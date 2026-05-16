import { access, mkdir, readFile, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  HealthCheckItem,
  HealthCheckResult,
  HealthCheckSummary,
  RuntimeInfo,
} from "@hermes-hub/shared";

function item(
  checkId: string,
  name: string,
  category: HealthCheckItem["category"],
  severity: HealthCheckItem["severity"],
  status: HealthCheckItem["status"],
  message: string,
  suggestion?: string,
  details?: Record<string, unknown>,
): HealthCheckItem {
  return { checkId, name, category, severity, status, message, suggestion, details };
}

function summary(items: HealthCheckItem[]): HealthCheckSummary {
  return {
    pass: items.filter((i) => i.status === "pass").length,
    warn: items.filter((i) => i.status === "warn").length,
    fail: items.filter((i) => i.status === "fail").length,
    unknown: items.filter((i) => i.status === "unknown").length,
    total: items.length,
  };
}

async function checkCli(
  runtime: RuntimeInfo,
): Promise<HealthCheckItem> {
  if (runtime.hermesCli.found && runtime.hermesCli.version) {
    return item(
      "cli-found",
      "Hermes CLI",
      "cli",
      "info",
      "pass",
      `Hermes CLI found at ${runtime.hermesCli.path} (${runtime.hermesCli.version})`,
    );
  }
  if (runtime.hermesCli.found) {
    return item(
      "cli-version",
      "Hermes CLI Version",
      "cli",
      "warning",
      "warn",
      "Hermes CLI found but version could not be determined",
      "Run `hermes --version` in your terminal to verify.",
    );
  }
  return item(
    "cli-missing",
    "Hermes CLI",
    "cli",
    "warning",
    "warn",
    "Hermes CLI was not found on PATH",
    "Install Hermes CLI or ensure it is available on your PATH.",
    runtime.hermesCli.error ? { error: runtime.hermesCli.error.message } : undefined,
  );
}

async function checkHome(
  runtime: RuntimeInfo,
): Promise<HealthCheckItem> {
  if (!runtime.hermesHome.found || !runtime.hermesHome.path) {
    return item(
      "home-missing",
      "HERMES_HOME",
      "home",
      "error",
      "fail",
      "HERMES_HOME was not found or is not readable",
      "Set the HERMES_HOME environment variable or use --home to specify the path.",
    );
  }

  const p = runtime.hermesHome.path;
  let writable = false;
  try {
    await access(p, constants.W_OK);
    writable = true;
  } catch { /* not writable */ }

  if (writable) {
    return item(
      "home-ok",
      "HERMES_HOME",
      "home",
      "info",
      "pass",
      `HERMES_HOME found at ${p} (source: ${runtime.hermesHome.source})`,
    );
  }

  return item(
    "home-readonly",
    "HERMES_HOME Permissions",
    "home",
    "warning",
    "warn",
    `HERMES_HOME found at ${p} but is not writable`,
    "Check file permissions with `ls -la` and ensure Hermes Hub can write to this directory.",
  );
}

async function checkProfileDir(
  profilePath: string,
): Promise<HealthCheckItem> {
  try {
    await access(profilePath, constants.R_OK | constants.W_OK);
    return item(
      "profile-dir-ok",
      "Profile Directory",
      "profile_dir",
      "info",
      "pass",
      `Profile directory is readable and writable: ${profilePath}`,
    );
  } catch {
    try {
      await access(profilePath, constants.R_OK);
      return item(
        "profile-dir-readonly",
        "Profile Directory Permissions",
        "profile_dir",
        "warning",
        "warn",
        `Profile directory is readable but not writable: ${profilePath}`,
        "Check file permissions with `ls -la` and grant write access.",
      );
    } catch {
      return item(
        "profile-dir-missing",
        "Profile Directory",
        "profile_dir",
        "error",
        "fail",
        `Profile directory not found or not accessible: ${profilePath}`,
        "Verify the profile exists at this path.",
      );
    }
  }
}

async function checkConfig(
  configPath: string,
): Promise<HealthCheckItem[]> {
  const results: HealthCheckItem[] = [];

  let exists = false;
  try {
    await stat(configPath);
    exists = true;
  } catch {
    results.push(item(
      "config-missing",
      "config.yaml",
      "config",
      "error",
      "fail",
      "config.yaml does not exist",
      "Create a config.yaml via `hermes profile init` or the New Profile wizard.",
      { path: configPath },
    ));
    return results;
  }

  try {
    await access(configPath, constants.R_OK);
  } catch {
    results.push(item(
      "config-unreadable",
      "config.yaml Permissions",
      "config",
      "error",
      "fail",
      "config.yaml exists but is not readable",
      "Grant read access with `chmod +r` on the file.",
      { path: configPath },
    ));
    return results;
  }

  // Check YAML validity
  try {
    const content = await readFile(configPath, "utf8");
    if (!content.trim()) {
      results.push(item(
        "config-empty",
        "config.yaml Content",
        "config",
        "warning",
        "warn",
        "config.yaml exists but is empty",
        "Open the Config Editor to add content.",
        { path: configPath },
      ));
    } else {
      try {
        parseYaml(content);
        results.push(item(
          "config-ok",
          "config.yaml",
          "config",
          "info",
          "pass",
          "config.yaml exists and contains valid YAML",
          undefined,
          { path: configPath },
        ));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        results.push(item(
          "config-invalid-yaml",
          "config.yaml Syntax",
          "config",
          "error",
          "fail",
          `config.yaml contains invalid YAML: ${msg.slice(0, 120)}`,
          "Fix the YAML syntax errors, then re-save.",
          { path: configPath, error: msg },
        ));
      }
    }

    // Check writable
    try {
      await access(configPath, constants.W_OK);
    } catch {
      results.push(item(
        "config-readonly",
        "config.yaml Writable",
        "config",
        "warning",
        "warn",
        "config.yaml is readable but not writable",
        "Grant write access to enable editing and saving.",
        { path: configPath },
      ));
    }
  } catch {
    results.push(item(
      "config-read-error",
      "config.yaml Read Error",
      "config",
      "error",
      "fail",
      "Failed to read config.yaml",
      "Check file permissions and disk integrity.",
      { path: configPath },
    ));
  }

  return results;
}

async function checkSoul(
  soulPath: string,
): Promise<HealthCheckItem[]> {
  const results: HealthCheckItem[] = [];

  let exists = false;
  try {
    await stat(soulPath);
    exists = true;
  } catch {
    results.push(item(
      "soul-missing",
      "SOUL.md",
      "soul",
      "warning",
      "warn",
      "SOUL.md does not exist",
      "Create a SOUL.md in the profile directory or use the SOUL editor.",
      { path: soulPath },
    ));
    return results;
  }

  try {
    await access(soulPath, constants.R_OK);
  } catch {
    results.push(item(
      "soul-unreadable",
      "SOUL.md Permissions",
      "soul",
      "error",
      "fail",
      "SOUL.md exists but is not readable",
      "Grant read access with `chmod +r` on the file.",
      { path: soulPath },
    ));
    return results;
  }

  let content = "";
  try {
    content = await readFile(soulPath, "utf8");
  } catch {
    results.push(item(
      "soul-read-error",
      "SOUL.md Read Error",
      "soul",
      "error",
      "fail",
      "Failed to read SOUL.md",
      "Check file permissions and disk integrity.",
    ));
    return results;
  }

  if (!content.trim()) {
    results.push(item(
      "soul-empty",
      "SOUL.md Content",
      "soul",
      "warning",
      "warn",
      "SOUL.md exists but is empty",
      "Open the SOUL editor and define the agent's identity.",
      { path: soulPath },
    ));
  } else {
    results.push(item(
      "soul-ok",
      "SOUL.md",
      "soul",
      "info",
      "pass",
      `SOUL.md exists with content (${content.length} chars)`,
      undefined,
      { path: soulPath, sizeBytes: content.length },
    ));
  }

  try {
    await access(soulPath, constants.W_OK);
  } catch {
    results.push(item(
      "soul-readonly",
      "SOUL.md Writable",
      "soul",
      "warning",
      "warn",
      "SOUL.md is readable but not writable",
      "Grant write access to enable editing and saving.",
    ));
  }

  return results;
}

async function checkGateway(
  runtime: RuntimeInfo,
  profileId: string,
): Promise<HealthCheckItem> {
  if (!runtime.hermesCli.found) {
    return item(
      "gateway-no-cli",
      "Gateway Status",
      "gateway",
      "warning",
      "unknown",
      "Cannot check Gateway status — Hermes CLI not found",
      "Install Hermes CLI to enable Gateway status detection.",
    );
  }

  // Lightweight check: verify the CLI supports the gateway command
  try {
    const { execa } = await import("execa");
    const result = await execa(runtime.hermesCli.path!, ["gateway", "--help"], {
      reject: false,
      timeout: 5_000,
    });
    if (result.exitCode === 0) {
      return item(
        "gateway-available",
        "Gateway Command",
        "gateway",
        "info",
        "pass",
        "Hermes CLI gateway command is available",
      );
    }
    return item(
      "gateway-unavailable",
      "Gateway Command",
      "gateway",
      "warning",
      "warn",
      "Hermes CLI gateway command is not available",
      "Check that your Hermes CLI version supports gateway commands.",
    );
  } catch {
    return item(
      "gateway-check-failed",
      "Gateway Check",
      "gateway",
      "warning",
      "unknown",
      "Could not determine if Gateway commands are available",
      "Run `hermes gateway --help` manually to verify.",
    );
  }
}

async function checkLogs(
  profilePath: string,
): Promise<HealthCheckItem> {
  const logsDir = join(profilePath, "logs");
  try {
    const s = await stat(logsDir);
    if (s.isDirectory()) {
      return item(
        "logs-ok",
        "Logs Directory",
        "logs",
        "info",
        "pass",
        "Logs directory exists",
        undefined,
        { path: logsDir },
      );
    }
    return item(
      "logs-not-dir",
      "Logs Directory",
      "logs",
      "warning",
      "warn",
      "logs path exists but is not a directory",
      "Ensure the logs path is a directory.",
    );
  } catch {
    return item(
      "logs-missing",
      "Logs Directory",
      "logs",
      "info",
      "pass",
      "No logs directory yet — will be created when Gateway runs",
      "Logs will be created automatically when the Gateway starts.",
      { path: logsDir },
    );
  }
}

async function checkBackupDir(): Promise<HealthCheckItem> {
  const backupDir = join(homedir(), ".hermes-hub", "backups");
  try {
    await mkdir(backupDir, { recursive: true });
    await access(backupDir, constants.W_OK);
    return item(
      "backup-ok",
      "Backup Directory",
      "backup",
      "info",
      "pass",
      "Backup directory is writable",
      undefined,
      { path: backupDir },
    );
  } catch {
    return item(
      "backup-unwritable",
      "Backup Directory",
      "backup",
      "error",
      "fail",
      `Backup directory is not writable: ${backupDir}`,
      "Ensure ~/.hermes-hub/backups/ is writable. Check disk space and permissions.",
      { path: backupDir },
    );
  }
}

async function checkSecretPlaceholders(
  configPath: string,
): Promise<HealthCheckItem | null> {
  let content: string;
  try {
    content = await readFile(configPath, "utf8");
  } catch {
    return null; // File can't be read — already covered by config checks
  }

  const sensitiveKey = String.raw`(api[_-]?key|token|secret|password|auth|credential|key)`;
  const redactedVal = String.raw`(\*{3,}|•{3,}|REDACTED|<redacted>|\[REDACTED\]|\[HIDDEN\])`;
  const regex = new RegExp(
    String.raw`(?:^|\n)\s*${sensitiveKey}\s*:\s*"?${redactedVal}"?\s*(?:\n|$)`,
    "gim",
  );
  const match = regex.exec(content);

  if (match) {
    return item(
      "secret-placeholder",
      "Secret Placeholder Risk",
      "security",
      "warning",
      "warn",
      `The field "${match[1]}" appears to contain a redacted placeholder`,
      "Replace placeholder values with real keys before saving.",
      { field: match[1] },
    );
  }

  return null;
}

export async function runHealthCheck(
  runtime: RuntimeInfo,
  profileId: string,
  profilePath: string,
): Promise<HealthCheckResult> {
  const items: HealthCheckItem[] = [];

  // 1. CLI check
  items.push(await checkCli(runtime));

  // 2. HERMES_HOME check
  items.push(await checkHome(runtime));

  // 3. Profile directory check
  items.push(await checkProfileDir(profilePath));

  // 4. config.yaml checks
  const configPath = join(profilePath, "config.yaml");
  items.push(...(await checkConfig(configPath)));

  // 5. SOUL.md checks
  const soulPath = join(profilePath, "SOUL.md");
  items.push(...(await checkSoul(soulPath)));

  // 6. Gateway check
  items.push(await checkGateway(runtime, profileId));

  // 7. Logs check
  items.push(await checkLogs(profilePath));

  // 8. Backup directory check
  items.push(await checkBackupDir());

  // 9. Secret placeholder check
  const secretCheck = await checkSecretPlaceholders(configPath);
  if (secretCheck) items.push(secretCheck);

  return {
    profileId,
    checkedAt: new Date().toISOString(),
    items,
    summary: summary(items),
  };
}
