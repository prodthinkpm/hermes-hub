import { access, copyFile, mkdir, open, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

export { createMockHermesHome } from "./mock.js";
import { execa } from "execa";
import { parse as parseYaml } from "yaml";
import {
  ApiErrorCode,
  type ApiError,
  type BackupInfo,
  type ConfigSummary,
  type EditableFileResult,
  type EditableFileType,
  type HermesCliInfo,
  type HermesHomeInfo,
  type HermesHomeSource,
  type ProfileDetail,
  type ProfileFileStatus,
  type ProfileHealthStatus,
  type ProfileSummary,
  type ProfilesListResponse,
  type RuntimeInfo,
  type SaveFileResponse,
  type ValidateFileResponse,
} from "@hermes-hub/shared";

export class HermesHubCoreError extends Error {
  readonly apiError: ApiError;

  constructor(apiError: ApiError) {
    super(apiError.message);
    this.name = "HermesHubCoreError";
    this.apiError = apiError;
  }
}

export type DetectRuntimeOptions = {
  hermesHomeOverride?: string;
  env?: NodeJS.ProcessEnv;
};

type CandidateHome = {
  path: string;
  source: HermesHomeSource;
};

export function createError(
  code: ApiError["code"],
  message: string,
  details?: Record<string, unknown>,
  suggestion?: string,
): ApiError {
  return {
    code,
    message,
    ...(details ? { details } : {}),
    ...(suggestion ? { suggestion } : {}),
  };
}

function firstNonEmptyLine(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
}

async function findHermesPath(): Promise<string | undefined> {
  const command = process.platform === "win32" ? "where" : "which";

  try {
    const result = await execa(command, ["hermes"], {
      reject: true,
      timeout: 5_000,
    });

    return firstNonEmptyLine(result.stdout);
  } catch {
    return undefined;
  }
}

async function detectHermesCli(): Promise<HermesCliInfo> {
  const hermesPath = await findHermesPath();

  if (!hermesPath) {
    return {
      found: false,
      error: createError(
        ApiErrorCode.HermesCliNotFound,
        "Hermes CLI was not found",
        undefined,
        "Install Hermes CLI or make sure it is available on PATH.",
      ),
    };
  }

  try {
    const result = await execa(hermesPath, ["--version"], {
      reject: true,
      timeout: 5_000,
    });

    return {
      found: true,
      path: hermesPath,
      version: result.stdout.trim() || result.stderr.trim() || undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      found: true,
      path: hermesPath,
      error: createError(
        ApiErrorCode.HermesCliVersionFailed,
        "Hermes CLI was found, but version detection failed",
        { message },
        "Run `hermes --version` in your terminal to inspect the failure.",
      ),
    };
  }
}

async function getHermesConfigHome(
  hermesCli: HermesCliInfo,
): Promise<string | undefined> {
  if (!hermesCli.found || !hermesCli.path) {
    return undefined;
  }

  try {
    const result = await execa(hermesCli.path, ["config", "home"], {
      reject: true,
      timeout: 5_000,
    });

    return firstNonEmptyLine(result.stdout);
  } catch {
    return undefined;
  }
}

async function checkHome(candidate: CandidateHome): Promise<HermesHomeInfo> {
  try {
    await access(candidate.path, constants.R_OK);

    return {
      found: true,
      path: candidate.path,
      source: candidate.source,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      found: false,
      path: candidate.path,
      source: candidate.source,
      error: createError(
        ApiErrorCode.HermesHomeNotFound,
        "HERMES_HOME was not found or is not readable",
        {
          path: candidate.path,
          source: candidate.source,
          message,
        },
        "Create the directory, fix permissions, or pass --home with a readable Hermes home path.",
      ),
    };
  }
}

async function detectHermesHome(
  hermesCli: HermesCliInfo,
  options: DetectRuntimeOptions,
): Promise<HermesHomeInfo> {
  const env = options.env ?? process.env;
  const configuredHome = await getHermesConfigHome(hermesCli);
  const candidates: CandidateHome[] = [
    ...(options.hermesHomeOverride
      ? [{ path: options.hermesHomeOverride, source: "cli-arg" as const }]
      : []),
    ...(configuredHome
      ? [{ path: configuredHome, source: "hermes-config-home" as const }]
      : []),
    ...(env.HERMES_HOME
      ? [{ path: env.HERMES_HOME, source: "env" as const }]
      : []),
    { path: join(homedir(), ".hermes"), source: "fallback" },
  ];
  const [candidate] = candidates;

  return checkHome(candidate);
}

export async function detectRuntime(
  options: DetectRuntimeOptions = {},
): Promise<RuntimeInfo> {
  const hermesCli = await detectHermesCli();
  const hermesHome = await detectHermesHome(hermesCli, options);

  return {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    hermesCli,
    hermesHome,
    checkedAt: new Date().toISOString(),
  };
}

function profileIdForPath(path: string) {
  return createHash("sha1").update(path).digest("hex");
}

async function fileStatus(path: string): Promise<ProfileFileStatus> {
  try {
    const stats = await stat(path);
    let readable = true;
    let writable = true;

    try {
      await access(path, constants.R_OK);
    } catch {
      readable = false;
    }

    try {
      await access(path, constants.W_OK);
    } catch {
      writable = false;
    }

    return {
      path,
      exists: true,
      readable,
      writable,
      sizeBytes: stats.size,
      updatedAt: stats.mtime.toISOString(),
      ...(readable
        ? {}
        : {
            error: createError(
              ApiErrorCode.PermissionDenied,
              "File exists but is not readable",
              { path },
              "Run 'chmod +r' on the file or check file ownership.",
            ),
          }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      path,
      exists: false,
      readable: false,
      writable: false,
      error: createError(ApiErrorCode.NotFound, "File was not found", {
        path,
        message,
      }, "Verify the file exists at the reported path."),
    };
  }
}

function latestIsoDate(values: Array<string | undefined>) {
  const timestamps = values
    .filter((value): value is string => Boolean(value))
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value));

  if (timestamps.length === 0) {
    return undefined;
  }

  return new Date(Math.max(...timestamps)).toISOString();
}

async function scanProfileCandidate(path: string): Promise<ProfileSummary> {
  const config = await fileStatus(join(path, "config.yaml"));
  const soul = await fileStatus(join(path, "SOUL.md"));
  const warnings: ApiError[] = [];
  const errors: ApiError[] = [];

  if (!config.exists) {
    warnings.push(
      createError(ApiErrorCode.NotFound, "config.yaml was not found", {
        path: config.path,
      }, "This Profile may be incomplete. Create config.yaml to enable editing."),
    );
  } else if (!config.readable) {
    errors.push(config.error ?? createError(ApiErrorCode.PermissionDenied, "config.yaml is not readable", undefined, "Fix file permissions so Hermes Hub can read config.yaml."));
  }

  if (!soul.exists) {
    warnings.push(
      createError(ApiErrorCode.NotFound, "SOUL.md was not found", {
        path: soul.path,
      }, "This Profile may be incomplete. Create SOUL.md to enable editing."),
    );
  } else if (!soul.readable) {
    errors.push(soul.error ?? createError(ApiErrorCode.PermissionDenied, "SOUL.md is not readable", undefined, "Fix file permissions so Hermes Hub can read SOUL.md."));
  }

  const status: ProfileHealthStatus =
    errors.length > 0 ? "error" : warnings.length > 0 ? "warning" : "ready";
  const lastUpdated = latestIsoDate([config.updatedAt, soul.updatedAt]);

  return {
    id: profileIdForPath(path),
    name: basename(path) || path,
    hermesHome: path,
    config,
    soul,
    status,
    health: status,
    lastUpdated,
    updatedAt: lastUpdated,
    warnings,
    errors,
  };
}

async function profileCandidatesFromHermesHome(hermesHome: string) {
  const candidates = new Set<string>();
  const profilesRoot = join(hermesHome, "profiles");
  const rootConfig = join(hermesHome, "config.yaml");
  const rootSoul = join(hermesHome, "SOUL.md");

  try {
    await stat(rootConfig);
    candidates.add(hermesHome);
  } catch {
    try {
      await stat(rootSoul);
      candidates.add(hermesHome);
    } catch {
      // An empty HERMES_HOME is a valid empty state for the MVP list.
    }
  }

  try {
    const entries = await readdir(profilesRoot, {
      withFileTypes: true,
    });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        candidates.add(join(profilesRoot, entry.name));
      }
    }
  } catch {
    // The profiles/ directory is optional; HERMES_HOME itself remains a candidate.
  }

  return [...candidates];
}

function parseConfigSummary(content: string): {
  parseStatus: "ok" | "error" | "empty";
  summary?: ConfigSummary;
} {
  if (!content.trim()) {
    return { parseStatus: "empty" };
  }

  try {
    const parsed = parseYaml(content) as Record<string, unknown> | undefined;

    if (!parsed || typeof parsed !== "object") {
      return { parseStatus: "ok", summary: {} };
    }

    return {
      parseStatus: "ok",
      summary: {
        model:
          typeof parsed.model === "string"
            ? parsed.model
            : parsed.model &&
                typeof parsed.model === "object" &&
                "default" in parsed.model
              ? String((parsed.model as Record<string, unknown>).default)
              : undefined,
        provider:
          typeof parsed.provider === "string"
            ? parsed.provider
            : parsed.model &&
                typeof parsed.model === "object" &&
                "provider" in parsed.model
              ? String((parsed.model as Record<string, unknown>).provider)
              : undefined,
        workspace:
          typeof parsed.workspace === "string" ? parsed.workspace : undefined,
      },
    };
  } catch {
    return { parseStatus: "error" };
  }
}

export async function readProfile(
  runtime: RuntimeInfo,
  profileId: string,
): Promise<ProfileDetail | null> {
  if (!runtime.hermesHome.found || !runtime.hermesHome.path) {
    return null;
  }

  const candidates = await profileCandidatesFromHermesHome(
    runtime.hermesHome.path,
  );
  const profilePath = candidates.find(
    (candidate) => profileIdForPath(candidate) === profileId,
  );

  if (!profilePath) {
    return null;
  }

  const summary = await scanProfileCandidate(profilePath);
  const configPath = join(profilePath, "config.yaml");
  const soulPath = join(profilePath, "SOUL.md");

  const configExtension: {
    parseStatus?: "ok" | "error" | "empty";
    summary?: ConfigSummary;
  } = {};

  if (summary.config.exists && summary.config.readable) {
    try {
      const content = await readFile(configPath, "utf8");
      const parsed = parseConfigSummary(content);

      configExtension.parseStatus = parsed.parseStatus;
      configExtension.summary = parsed.summary;
    } catch {
      configExtension.parseStatus = "error";
    }
  }

  const soulExtension: { empty?: boolean } = {};

  if (summary.soul.exists && summary.soul.readable) {
    try {
      const content = await readFile(soulPath, "utf8");

      soulExtension.empty = content.trim().length === 0;
    } catch {
      // Leave empty undefined when unreadable
    }
  }

  return {
    id: summary.id,
    name: summary.name,
    hermesHome: summary.hermesHome,
    config: {
      ...summary.config,
      ...configExtension,
    },
    soul: {
      ...summary.soul,
      ...soulExtension,
    },
    status: summary.status,
    warnings: summary.warnings,
    errors: summary.errors,
  };
}

export async function scanProfiles(
  runtime: RuntimeInfo,
): Promise<ProfilesListResponse> {
  const scannedAt = new Date().toISOString();

  if (!runtime.hermesHome.found || !runtime.hermesHome.path) {
    return {
      profiles: [],
      scannedAt,
      sourceHermesHome: runtime.hermesHome.path,
      warnings: [],
      errors: [
        runtime.hermesHome.error ??
          createError(
            ApiErrorCode.HermesHomeNotFound,
            "HERMES_HOME was not found or is not readable",
            undefined,
            "Set the HERMES_HOME environment variable or pass --home to specify the path.",
          ),
      ],
    };
  }

  try {
    const candidates = await profileCandidatesFromHermesHome(runtime.hermesHome.path);
    const profiles = await Promise.all(candidates.map(scanProfileCandidate));

    return {
      profiles,
      scannedAt,
      sourceHermesHome: runtime.hermesHome.path,
      warnings: [],
      errors: [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      profiles: [],
      scannedAt,
      sourceHermesHome: runtime.hermesHome.path,
      warnings: [],
      errors: [
        createError(ApiErrorCode.UnknownError, "Profile scan failed", {
          message,
        }, "Check filesystem permissions and try rescanning."),
      ],
    };
  }
}

export async function importProfile(
  runtime: RuntimeInfo,
  request: { path: string; name?: string },
): Promise<{ profile: ProfileSummary }> {
  const dirPath = request.path;

  try {
    await stat(dirPath);
  } catch {
    throw new HermesHubCoreError(
      createError(
        ApiErrorCode.NotFound,
        `Directory not found: ${dirPath}`,
        { path: dirPath },
        "Check the path and try again.",
      ),
    );
  }

  // Scan as a profile candidate to validate
  const profile = await scanProfileCandidate(dirPath);

  if (!profile.config.exists && !profile.soul.exists) {
    throw new HermesHubCoreError(
      createError(
        ApiErrorCode.ValidationError,
        "The directory must contain at least a config.yaml or SOUL.md file.",
        { path: dirPath },
        "Select a valid Hermes profile directory.",
      ),
    );
  }

  return { profile };
}

export async function getGatewayStatus(
  runtime: RuntimeInfo,
  profileId: string,
): Promise<{ status: "running" | "stopped" | "error" | "unknown"; pid?: number; uptime?: string; errorMessage?: string }> {
  if (!runtime.hermesHome.found || !runtime.hermesHome.path) {
    return { status: "unknown", errorMessage: "HERMES_HOME not available." };
  }

  const candidates = await profileCandidatesFromHermesHome(runtime.hermesHome.path);
  const profilePath = candidates.find((c) => profileIdForPath(c) === profileId);

  if (!profilePath) {
    return { status: "unknown", errorMessage: "Profile not found." };
  }

  // Try CLI-based detection
  if (runtime.hermesCli.found && runtime.hermesCli.path) {
    try {
      const result = await execa(runtime.hermesCli.path, ["gateway", "status"], {
        reject: false,
        timeout: 5_000,
      });
      const output = result.stdout || result.stderr || "";

      if (output.includes("running")) return { status: "running" };
      if (output.includes("stopped")) return { status: "stopped" };
      if (output.includes("error")) return { status: "error", errorMessage: output };
    } catch {
      // Fall through
    }
  }

  return { status: "unknown", errorMessage: "Could not determine gateway status." };
}

export async function startGateway(
  runtime: RuntimeInfo,
  profileId: string,
): Promise<{ success: boolean; message: string; pid?: number }> {
  if (!runtime.hermesCli.found || !runtime.hermesCli.path) {
    return { success: false, message: "Hermes CLI not found." };
  }

  const candidates = await profileCandidatesFromHermesHome(runtime.hermesHome.path ?? "");
  const profilePath = candidates.find((c) => profileIdForPath(c) === profileId);

  if (!profilePath) {
    return { success: false, message: "Profile not found." };
  }

  try {
    const result = await execa(runtime.hermesCli.path, ["gateway", "start"], {
      reject: false,
      timeout: 15_000,
    });

    return {
      success: result.exitCode === 0,
      message: result.stdout || result.stderr || "Gateway start attempted.",
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function stopGateway(
  runtime: RuntimeInfo,
  profileId: string,
): Promise<{ success: boolean; message: string; pid?: number }> {
  if (!runtime.hermesCli.found || !runtime.hermesCli.path) {
    return { success: false, message: "Hermes CLI not found." };
  }

  try {
    const result = await execa(runtime.hermesCli.path, ["gateway", "stop"], {
      reject: false,
      timeout: 15_000,
    });

    return {
      success: result.exitCode === 0,
      message: result.stdout || result.stderr || "Gateway stop attempted.",
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function restartGateway(
  runtime: RuntimeInfo,
  profileId: string,
): Promise<{ success: boolean; message: string; pid?: number }> {
  const stopResult = await stopGateway(runtime, profileId);

  if (!stopResult.success) return stopResult;

  return startGateway(runtime, profileId);
}

export async function readLogs(
  runtime: RuntimeInfo,
  profileId: string,
  options?: { lines?: number; filter?: string },
): Promise<{ lines: Array<{ timestamp?: string; level?: string; message: string; source?: string }>; totalFiles: number; path: string }> {
  const maxLines = options?.lines ?? 200;

  if (!runtime.hermesHome.found || !runtime.hermesHome.path) {
    throw new HermesHubCoreError(
      createError(ApiErrorCode.HermesHomeNotFound, "HERMES_HOME is not available"),
    );
  }

  const candidates = await profileCandidatesFromHermesHome(runtime.hermesHome.path);
  const profilePath = candidates.find((c) => profileIdForPath(c) === profileId);

  if (!profilePath) {
    throw new HermesHubCoreError(
      createError(ApiErrorCode.ProfileNotFound, "Profile not found", { profileId }),
    );
  }

  const logsPath = join(profilePath, "logs");
  let totalFiles = 0;
  const allLines: Array<{ timestamp?: string; level?: string; message: string; source?: string }> = [];

  try {
    const entries = await readdir(logsPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      totalFiles += 1;

      try {
        const content = await readFile(join(logsPath, entry.name), "utf8");
        const fileLines = content.split(/\r?\n/).filter(Boolean);

        for (const line of fileLines) {
          const parsed = parseLogLine(line);

          if (options?.filter) {
            const lower = parsed.message.toLowerCase();

            if (!lower.includes(options.filter.toLowerCase())) continue;
          }

          allLines.push(parsed);
        }
      } catch {
        // Skip unreadable files
      }
    }
  } catch {
    // Logs directory may not exist
  }

  // Return last N lines
  return {
    lines: allLines.slice(-maxLines),
    totalFiles,
    path: logsPath,
  };
}

function parseLogLine(raw: string): { timestamp?: string; level?: string; message: string; source?: string } {
  const tsMatch = raw.match(/^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)/);

  let timestamp: string | undefined;
  let rest = raw;

  if (tsMatch) {
    timestamp = tsMatch[1];
    rest = raw.slice(tsMatch[0].length).trim();
  }

  const levelMatch = rest.match(/^(ERROR|WARN|WARNING|INFO|DEBUG|TRACE)\s/i);

  let level: string | undefined;

  if (levelMatch) {
    level = levelMatch[1].toUpperCase();
    rest = rest.slice(levelMatch[0].length).trim();
  }

  return { timestamp, level, message: rest, source: undefined };
}

export function validateYaml(content: string): ValidateFileResponse {
  try {
    parseYaml(content);

    return { valid: true, errors: [], warnings: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const lineMatch = message.match(/line\s+(\d+)/i);
    const colMatch = message.match(/col(?:umn)?\s+(\d+)/i);

    return {
      valid: false,
      errors: [
        {
          code: ApiErrorCode.YamlInvalid,
          message,
          details: {
            ...(lineMatch ? { line: Number(lineMatch[1]) } : {}),
            ...(colMatch ? { column: Number(colMatch[1]) } : {}),
          },
          suggestion: "Fix the YAML syntax errors and try again.",
        },
      ],
      warnings: [],
    };
  }
}

export async function readEditableFile(
  runtime: RuntimeInfo,
  profileId: string,
  type: EditableFileType,
): Promise<EditableFileResult | null> {
  if (!runtime.hermesHome.found || !runtime.hermesHome.path) {
    return null;
  }

  const candidates = await profileCandidatesFromHermesHome(
    runtime.hermesHome.path,
  );
  const profilePath = candidates.find(
    (candidate) => profileIdForPath(candidate) === profileId,
  );

  if (!profilePath) {
    return null;
  }

  const fileName = type === "config" ? "config.yaml" : "SOUL.md";
  const filePath = join(profilePath, fileName);
  const status = await fileStatus(filePath);

  let content = "";

  if (status.exists && status.readable) {
    try {
      content = await readFile(filePath, "utf8");
    } catch {
      // Leave content empty — status already carries the error.
    }
  }

  return {
    profileId,
    type,
    path: filePath,
    content,
    status,
  };
}

function detectRedactedPlaceholder(content: string): ApiError | null {
  // Match sensitive keys with redacted placeholder values in raw YAML.
  // Examples: api_key: ********  or  token: "••••••"
  const sensitiveKey = String.raw`(api[_-]?key|token|secret|password|auth|credential|key)`;
  const redactedVal = String.raw`(\*{3,}|•{3,}|REDACTED|<redacted>|\[REDACTED\]|\[HIDDEN\])`;
  const regex = new RegExp(
    String.raw`(?:^|\n)\s*${sensitiveKey}\s*:\s*"?${redactedVal}"?\s*(?:\n|$)`,
    "gim",
  );

  const match = regex.exec(content);

  if (match) {
    return createError(
      ApiErrorCode.ValidationError,
      `The field "${match[1]}" appears to contain a redacted placeholder. Replace it with a real value before saving.`,
      { field: match[1] },
      "Paste the actual value or remove the field if it is not needed.",
    );
  }

  return null;
}

async function backupFile(
  filePath: string,
  profileId: string,
): Promise<BackupInfo> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = join(
    homedir(),
    ".hermes-hub",
    "backups",
    profileId,
    timestamp,
  );

  await mkdir(backupDir, { recursive: true });

  const fileName = basename(filePath);
  const backupPath = join(backupDir, fileName);

  try {
    await stat(filePath);
    await copyFile(filePath, backupPath);
    const stats = await stat(backupPath);

    return {
      path: backupPath,
      createdAt: new Date().toISOString(),
      sizeBytes: stats.size,
    };
  } catch {
    // File does not exist — record the intent without a file backup.
    return {
      path: backupDir,
      createdAt: new Date().toISOString(),
    };
  }
}

async function atomicWrite(
  filePath: string,
  content: string,
): Promise<void> {
  const tmpPath = `${filePath}.tmp-${Date.now()}`;
  let handle: Awaited<ReturnType<typeof open>> | undefined;

  try {
    handle = await open(tmpPath, "w", 0o600);
    await handle.writeFile(content);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(tmpPath, filePath);
  } catch (error) {
    if (handle) {
      try {
        await handle.close();
      } catch {
        // best effort
      }
    }

    try {
      await unlink(tmpPath);
    } catch {
      // best effort
    }

    throw error;
  }
}

export async function saveEditableFile(
  runtime: RuntimeInfo,
  profileId: string,
  type: EditableFileType,
  content: string,
): Promise<SaveFileResponse> {
  if (!runtime.hermesHome.found || !runtime.hermesHome.path) {
    throw new HermesHubCoreError(
      createError(
        ApiErrorCode.HermesHomeNotFound,
        "HERMES_HOME is not available",
        undefined,
        "Check that Hermes CLI and HERMES_HOME are configured correctly.",
      ),
    );
  }

  const candidates = await profileCandidatesFromHermesHome(
    runtime.hermesHome.path,
  );
  const profilePath = candidates.find(
    (candidate) => profileIdForPath(candidate) === profileId,
  );

  if (!profilePath) {
    throw new HermesHubCoreError(
      createError(
        ApiErrorCode.ProfileNotFound,
        "Profile not found",
        { profileId },
        "Check that the profile exists under the current HERMES_HOME.",
      ),
    );
  }

  const fileName = type === "config" ? "config.yaml" : "SOUL.md";
  const filePath = join(profilePath, fileName);

  // Validate config YAML
  if (type === "config") {
    // Detect redacted placeholders first (before YAML parse, since some
    // redacted patterns like ******** are valid YAML aliases).
    const redacted = detectRedactedPlaceholder(content);

    if (redacted) {
      throw new HermesHubCoreError(redacted);
    }

    const validation = validateYaml(content);

    if (!validation.valid) {
      throw new HermesHubCoreError(validation.errors[0]);
    }
  }

  // Validate SOUL content
  if (type === "soul" && content.trim().length === 0) {
    throw new HermesHubCoreError(
      createError(
        ApiErrorCode.ValidationError,
        "SOUL.md content must not be empty",
        undefined,
        "Add content to the SOUL.md file before saving.",
      ),
    );
  }

  // Backup
  let backup: BackupInfo;

  try {
    backup = await backupFile(filePath, profileId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    throw new HermesHubCoreError(
      createError(
        ApiErrorCode.FileWriteFailed,
        "Backup failed. Save aborted to protect existing files.",
        { message },
        "Check disk space and permissions on the backup directory.",
      ),
    );
  }

  // Atomic write
  try {
    await mkdir(dirname(filePath), { recursive: true });
    await atomicWrite(filePath, content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    throw new HermesHubCoreError(
      createError(
        ApiErrorCode.FileWriteFailed,
        "Failed to write file. The original file was not modified.",
        { message, backupPath: backup.path },
        "Check file permissions and disk space.",
      ),
    );
  }

  return {
    profileId,
    type,
    path: filePath,
    backup,
    savedAt: new Date().toISOString(),
  };
}

const DEFAULT_SOUL_TEMPLATE = `# Identity

You are a helpful Hermes Agent. Respond clearly and concisely.

## Behaviour

- Be accurate and honest
- When unsure, ask clarifying questions
- Use tools when they help the user
`;

function defaultConfig(model?: string, provider?: string, workspace?: string) {
  return `model:
  default: ${model ?? "deepseek-v4-flash"}
  provider: ${provider ?? "deepseek"}
providers: {}
fallback_providers: []
toolsets:
  - hermes-cli
agent:
  max_turns: 90
workspace: ${workspace ?? "~"}
`;
}

export async function createProfile(
  runtime: RuntimeInfo,
  request: {
    name: string;
    displayName?: string;
    description?: string;
    model?: string;
    provider?: string;
    workspace?: string;
    soulContent?: string;
  },
): Promise<{ profile: ProfileSummary }> {
  if (!runtime.hermesHome.found || !runtime.hermesHome.path) {
    throw new HermesHubCoreError(
      createError(
        ApiErrorCode.HermesHomeNotFound,
        "HERMES_HOME is not available",
        undefined,
        "Set HERMES_HOME or pass --home to specify the path.",
      ),
    );
  }

  const profilesDir = join(runtime.hermesHome.path, "profiles");
  const profilePath = join(profilesDir, request.name);

  // Check for collision
  try {
    await stat(profilePath);
    throw new HermesHubCoreError(
      createError(
        ApiErrorCode.ValidationError,
        `A profile named "${request.name}" already exists.`,
        { name: request.name },
        "Choose a different name or remove the existing profile first.",
      ),
    );
  } catch (error) {
    if (error instanceof HermesHubCoreError) throw error;
    // ENOENT is expected — directory does not exist yet
  }

  await mkdir(profilePath, { recursive: true });

  const configContent = defaultConfig(
    request.model,
    request.provider,
    request.workspace,
  );

  const soulContent = request.soulContent?.trim()
    ? request.soulContent
    : DEFAULT_SOUL_TEMPLATE;

  try {
    await writeFile(join(profilePath, "config.yaml"), configContent, "utf8");
    await writeFile(join(profilePath, "SOUL.md"), soulContent, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    throw new HermesHubCoreError(
      createError(
        ApiErrorCode.FileWriteFailed,
        "Failed to create profile files.",
        { message },
        "Check disk space and write permissions on the profiles directory.",
      ),
    );
  }

  const profile = await scanProfileCandidate(profilePath);

  return { profile };
}

export async function cloneProfile(
  runtime: RuntimeInfo,
  request: {
    sourceProfileId: string;
    newName: string;
    copyEnv?: boolean;
    copyAuth?: boolean;
    copyMemories?: boolean;
    copySessions?: boolean;
    copyLogs?: boolean;
  },
): Promise<{ profile: ProfileSummary; copiedFiles: string[]; skippedFiles: string[] }> {
  if (!runtime.hermesHome.found || !runtime.hermesHome.path) {
    throw new HermesHubCoreError(
      createError(
        ApiErrorCode.HermesHomeNotFound,
        "HERMES_HOME is not available",
      ),
    );
  }

  const candidates = await profileCandidatesFromHermesHome(
    runtime.hermesHome.path,
  );
  const sourcePath = candidates.find(
    (c) => profileIdForPath(c) === request.sourceProfileId,
  );

  if (!sourcePath) {
    throw new HermesHubCoreError(
      createError(
        ApiErrorCode.ProfileNotFound,
        "Source profile not found",
        { profileId: request.sourceProfileId },
      ),
    );
  }

  const profilesDir = join(runtime.hermesHome.path, "profiles");
  const targetPath = join(profilesDir, request.newName);

  try {
    await stat(targetPath);
    throw new HermesHubCoreError(
      createError(
        ApiErrorCode.ValidationError,
        `A profile named "${request.newName}" already exists.`,
        { name: request.newName },
        "Choose a different name.",
      ),
    );
  } catch (error) {
    if (error instanceof HermesHubCoreError) throw error;
    // ENOENT is expected
  }

  await mkdir(targetPath, { recursive: true });

  const copiedFiles: string[] = [];
  const skippedFiles: string[] = [];

  const safeCopy = ["config.yaml", "SOUL.md"];
  const optionalCopy: Record<string, boolean | undefined> = {
    ".env": request.copyEnv,
    "auth.json": request.copyAuth,
    "memories": request.copyMemories,
    "sessions": request.copySessions,
    "logs": request.copyLogs,
  };

  for (const file of safeCopy) {
    const src = join(sourcePath, file);

    try {
      await stat(src);
      await copyFile(src, join(targetPath, file));
      copiedFiles.push(file);
    } catch {
      skippedFiles.push(file);
    }
  }

  for (const [entry, shouldCopy] of Object.entries(optionalCopy)) {
    if (!shouldCopy) {
      skippedFiles.push(entry);
      continue;
    }

    const src = join(sourcePath, entry);

    try {
      await stat(src);
      // Directories need recursive copy; skip for MVP
      skippedFiles.push(`${entry} (skipped — directory copy not supported)`);
    } catch {
      skippedFiles.push(entry);
    }
  }

  const profile = await scanProfileCandidate(targetPath);

  return { profile, copiedFiles, skippedFiles };
}
