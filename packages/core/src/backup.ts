import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, basename } from "node:path";
import { createHash } from "node:crypto";

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
