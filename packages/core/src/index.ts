import { access, readdir, readFile, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { execa } from "execa";
import { parse as parseYaml } from "yaml";
import {
  ApiErrorCode,
  type ApiError,
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
  type ValidateFileResponse,
} from "@hermes-hub/shared";

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
      }),
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
      }),
    );
  } else if (!config.readable) {
    errors.push(config.error ?? createError(ApiErrorCode.PermissionDenied, "config.yaml is not readable"));
  }

  if (!soul.exists) {
    warnings.push(
      createError(ApiErrorCode.NotFound, "SOUL.md was not found", {
        path: soul.path,
      }),
    );
  } else if (!soul.readable) {
    errors.push(soul.error ?? createError(ApiErrorCode.PermissionDenied, "SOUL.md is not readable"));
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
        }),
      ],
    };
  }
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
