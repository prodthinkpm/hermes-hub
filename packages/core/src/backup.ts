import { copyFile, mkdir, readdir, readFile, rename, stat, unlink, writeFile, open } from "node:fs/promises";
import { homedir } from "node:os";
import { join, basename, dirname } from "node:path";
import { createHash } from "node:crypto";
import { parse as parseYaml } from "yaml";
import { ApiErrorCode, type ApiError } from "@hermes-hub/shared";

export type BackupEntry = {
  id: string;
  profileId: string;
  fileName: string;
  fileType: "config" | "soul";
  backupPath: string;
  originalPath: string;
  createdAt: string;
  sizeBytes: number;
};

function profileIdForPath(path: string) {
  return createHash("sha1").update(path).digest("hex");
}

export async function listBackups(profileId: string): Promise<BackupEntry[]> {
  const backups: BackupEntry[] = [];
  const backupRoot = join(homedir(), ".hermes-hub", "backups", profileId);

  try {
    const timestampDirs = await readdir(backupRoot, { withFileTypes: true });
    for (const entry of timestampDirs) {
      if (!entry.isDirectory()) continue;
      const timestampDir = join(backupRoot, entry.name);

      try {
        const files = await readdir(timestampDir, { withFileTypes: true });
        for (const file of files) {
          if (!file.isFile()) continue;
          const filePath = join(timestampDir, file.name);
          const stats = await stat(filePath);

          const fileType = file.name.endsWith("SOUL.md") ? "soul" as const : "config" as const;
          const entryId = `${entry.name}_${file.name}`;

          backups.push({
            id: entryId,
            profileId,
            fileName: file.name,
            fileType,
            backupPath: filePath,
            originalPath: join("(profile)", file.name),
            createdAt: stats.birthtime.toISOString(),
            sizeBytes: stats.size,
          });
        }
      } catch { /* skip unreadable timestamp dirs */ }
    }
  } catch { /* backup root may not exist */ }

  backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return backups;
}

export async function readBackupContent(backupPath: string): Promise<string | null> {
  try {
    return await readFile(backupPath, "utf8");
  } catch {
    return null;
  }
}

// Minimal error for restore function (main HermesHubCoreError is in index.ts)
function restoreError(code: ApiError["code"], message: string, details?: Record<string, unknown>, suggestion?: string): Error & { apiError: ApiError } {
  return Object.assign(new Error(message), {
    name: "HermesHubCoreError",
    apiError: { code, message, ...(details ? { details } : {}), ...(suggestion ? { suggestion } : {}) },
  });
}

export async function restoreBackup(backupPath: string, targetPath: string): Promise<{ restored: string }> {
  // Read backup content
  let content: string;
  try {
    content = await readFile(backupPath, "utf8");
  } catch (e) {
    throw restoreError(
      ApiErrorCode.FileReadFailed,
      "Failed to read backup file",
      { path: backupPath },
      "Check that the backup file still exists and is readable.",
    );
  }

  // Validate YAML if config
  if (targetPath.endsWith(".yaml") || targetPath.endsWith(".yml")) {
    try { parseYaml(content); } catch (e) {
      throw restoreError(
        ApiErrorCode.YamlInvalid,
        "Backup contains invalid YAML. Restore aborted.",
        { message: e instanceof Error ? e.message : String(e) },
        "Fix the YAML in the backup file manually before restoring.",
      );
    }
  } else if (targetPath.endsWith(".md") && !content.trim()) {
    throw restoreError(
      ApiErrorCode.ValidationError,
      "Backup SOUL.md is empty. Restore aborted.",
      undefined,
      "Choose a backup that contains content.",
    );
  }

  // Backup current file before restore
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const profileId = backupPath.split(/[\\/]/).reverse().find((_, i, a) => i === 2) || "unknown";
  const backupDir = join(homedir(), ".hermes-hub", "backups", profileId, `pre-restore-${timestamp}`);
  await mkdir(backupDir, { recursive: true });
  const preRestorePath = join(backupDir, basename(targetPath));

  try {
    await stat(targetPath);
    await copyFile(targetPath, preRestorePath);
  } catch { /* target may not exist yet */ }

  // Atomic restore
  const tmpPath = `${targetPath}.tmp-${Date.now()}`;
  try {
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(tmpPath, content, "utf8");
    await rename(tmpPath, targetPath);
  } catch (e) {
    try { await unlink(tmpPath); } catch { /* best effort */ }
    throw restoreError(
      ApiErrorCode.FileWriteFailed,
      "Failed to restore backup. The original file was not modified.",
      { message: e instanceof Error ? e.message : String(e), preRestoreBackup: preRestorePath },
      "Check disk space and permissions.",
    );
  }

  return { restored: targetPath };
}
