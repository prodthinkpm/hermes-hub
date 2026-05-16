#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { Command } from "commander";
import open from "open";
import { createHermesHubServer } from "@hermes-hub/server";
import type { ApiResponse, HealthCheckData } from "@hermes-hub/shared";
import { createMockHermesHome } from "@hermes-hub/core";
import { execSync } from "node:child_process";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8899;

export type CliHealthResponse = ApiResponse<HealthCheckData>;

type CliOptions = {
  host: string;
  home?: string;
  mock?: boolean;
  port: number;
  open: boolean;
};

function readPackageVersion() {
  try {
    const packageJsonPath = fileURLToPath(new URL("../package.json", import.meta.url));
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      version?: string;
    };

    return packageJson.version ?? "dev";
  } catch {
    return "dev";
  }
}

function parsePort(value: string) {
  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }

  return port;
}

function isPortAvailable(port: number, host: string) {
  return new Promise<boolean>((resolve, reject) => {
    const server = createServer();

    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE" || error.code === "EACCES") {
        resolve(false);
        return;
      }

      reject(error);
    });

    server.once("listening", () => {
      server.close(() => {
        resolve(true);
      });
    });

    server.listen({ host, port });
  });
}

async function findAvailablePort(startPort: number, host: string) {
  for (let port = startPort; port <= 65535; port += 1) {
    if (await isPortAvailable(port, host)) {
      return port;
    }
  }

  throw new Error(`No available port found from ${startPort} to 65535`);
}

function getBrowserUrl(host: string, port: number) {
  const displayHost = host === "0.0.0.0" ? DEFAULT_HOST : host;

  return `http://${displayHost}:${port}`;
}

async function main() {
  const program = new Command()
    .name("hermes-hub")
    .description("Start the local Hermes Hub server.")
    .version(readPackageVersion())
    .option("--host <host>", "host to bind the local server", DEFAULT_HOST)
    .option("--home <path>", "Hermes home path to use for runtime detection")
    .option("--mock", "create a mock HERMES_HOME for testing")
    .option("--demo", "alias for --mock (create mock HERMES_HOME for demonstration)")
    .option("--port <port>", "port to bind the local server", parsePort, DEFAULT_PORT)
    .option("--no-open", "do not open the browser after startup")
    .command("doctor")
    .description("Run environment checks for Hermes Hub")
    .action(async () => {
      const version = readPackageVersion();
      console.log(`Hermes Hub v${version}`);
      console.log("Running environment checks...\n");

      // Node.js version
      const nodeVersion = process.version;
      const nodeMajor = Number(nodeVersion.slice(1).split(".")[0]);
      console.log(`  Node.js: ${nodeVersion} ${nodeMajor >= 20 ? "✓" : "✗ (need >= 20)"}`);

      // Hermes CLI
      try {
        const whichCmd = process.platform === "win32" ? "where" : "which";
        const hermesPath = execSync(`${whichCmd} hermes`, { encoding: "utf8", timeout: 5_000 }).split("\n")[0]?.trim();
        if (hermesPath) {
          try {
            const ver = execSync(`"${hermesPath}" --version`, { encoding: "utf8", timeout: 5_000 }).trim();
            console.log(`  Hermes CLI: ${hermesPath} (${ver}) ✓`);
          } catch {
            console.log(`  Hermes CLI: ${hermesPath} (version unknown) ⚠`);
          }
        } else {
          console.log("  Hermes CLI: not found (optional) ⚠");
        }
      } catch {
        console.log("  Hermes CLI: not found (optional) ⚠");
      }

      // HERMES_HOME
      const hermesHome = process.env.HERMES_HOME || process.argv.find((a) => a.startsWith("--home="))?.split("=")[1] || `${homedir()}/.hermes`;
      console.log(`  HERMES_HOME: ${hermesHome}`);

      // Default port
      try {
        const portAvail = await isPortAvailable(DEFAULT_PORT, DEFAULT_HOST);
        console.log(`  Port ${DEFAULT_PORT}: ${portAvail ? "available ✓" : "in use ⚠"}`);
      } catch {
        console.log(`  Port ${DEFAULT_PORT}: check failed ⚠`);
      }

      console.log("\nDoctor check complete.");
      process.exit(0);
    });

  program.parse(process.argv.filter((arg, index) => index <= 1 || arg !== "--"));

  const options = program.opts<CliOptions>();

  let hermesHomeOverride = options.home;

  if (options.mock || (options as Record<string, unknown>).demo) {
    const mockPath = await createMockHermesHome();

    console.log(`Mock HERMES_HOME created at ${mockPath}`);
    hermesHomeOverride ??= mockPath;
  }

  const port = await findAvailablePort(options.port, options.host);

  if (options.host === "0.0.0.0") {
    console.warn(
      "Security warning: binding Hermes Hub to 0.0.0.0 may expose it to your local network. Use this only on trusted networks.",
    );
  }

  const app = createHermesHubServer({
    version: readPackageVersion(),
    hermesHomeOverride,
  });

  await app.listen({
    host: options.host,
    port,
  });

  const url = getBrowserUrl(options.host, port);
  console.log(`Hermes Hub is running at ${url}`);

  if (options.open) {
    await open(url);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to start Hermes Hub: ${message}`);
  process.exitCode = 1;
});
