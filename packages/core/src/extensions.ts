import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

type McpServer = {
  name: string;
  command: string;
  args: string[];
  envKeys: string[];
  enabled: boolean;
  status: "configured" | "missing_command" | "disabled" | "unknown";
};

type SkillEntry = {
  name: string;
  source: string;
  enabled: boolean;
  risk: "low" | "medium" | "high" | "unknown";
  permissions: string[];
};

type CronJob = {
  name: string;
  schedule: string;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  lastResult?: string;
};

export async function parseMcpServers(configPath: string): Promise<McpServer[]> {
  try {
    const content = await readFile(configPath, "utf8");
    const parsed = parseYaml(content) as Record<string, unknown> | undefined;
    const servers = (parsed?.mcp_servers ?? parsed?.mcpServers ?? []) as Array<Record<string, unknown>>;
    if (!Array.isArray(servers)) return [];
    return servers.map((s, i) => ({
      name: String(s.name ?? `mcp-${i}`),
      command: String(s.command ?? ""),
      args: Array.isArray(s.args) ? s.args.map(String) : [],
      envKeys: s.env && typeof s.env === "object" ? Object.keys(s.env as Record<string, unknown>) : [],
      enabled: s.enabled !== false,
      status: s.enabled === false ? "disabled" : s.command ? "configured" : "missing_command",
    }));
  } catch {
    return [];
  }
}

export async function parseSkills(profilePath: string): Promise<SkillEntry[]> {
  const skillsDir = join(profilePath, "skills");
  try {
    const entries = await readdir(skillsDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => {
      const name = e.name;
      let risk: SkillEntry["risk"] = "unknown";
      let permissions: string[] = [];
      // Risk assessment based on common skill name patterns
      if (/shell|exec|terminal|command/i.test(name)) { risk = "high"; permissions = ["shell"]; }
      else if (/file|fs|write|read|io/i.test(name)) { risk = "medium"; permissions = ["filesystem"]; }
      else if (/net|http|api|fetch|request/i.test(name)) { risk = "medium"; permissions = ["network"]; }
      else if (/git|github|repo/i.test(name)) { risk = "low"; permissions = ["repository"]; }
      return { name, source: "local", enabled: true, risk, permissions };
    });
  } catch {
    return [];
  }
}

export async function parseCronJobs(profilePath: string): Promise<CronJob[]> {
  const cronDir = join(profilePath, "cron");
  try {
    const entries = await readdir(cronDir, { withFileTypes: true });
    return entries.filter((e) => e.isFile() && (e.name.endsWith(".json") || e.name.endsWith(".yaml"))).map((e) => ({
      name: e.name.replace(/\.(json|yaml)$/, ""),
      schedule: "unknown",
      enabled: true,
      lastResult: "pending",
    }));
  } catch {
    return [];
  }
}
