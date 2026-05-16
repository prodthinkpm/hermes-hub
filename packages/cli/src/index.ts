#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import open from "open";
import { createHermesHubServer } from "@hermes-hub/server";
import type { ApiResponse, HealthCheckData } from "@hermes-hub/shared";
import { createMockHermesHome } from "@hermes-hub/core";

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
    .option("--port <port>", "port to bind the local server", parsePort, DEFAULT_PORT)
    .option("--no-open", "do not open the browser after startup");

  program.parse(process.argv.filter((arg, index) => index <= 1 || arg !== "--"));

  const options = program.opts<CliOptions>();

  let hermesHomeOverride = options.home;

  if (options.mock) {
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
