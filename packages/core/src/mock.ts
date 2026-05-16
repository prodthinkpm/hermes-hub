import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const DEFAULT_SOUL = `# Identity

You are a helpful Hermes Agent. You respond clearly and concisely.

## Behaviour

- Be accurate and honest
- When unsure, ask clarifying questions
- Use tools when they help the user
`;

const CODER_SOUL = `# Identity

You are the Coder Agent. You specialise in software development tasks.

## Behaviour

- Write clean, tested, maintainable code
- Follow the project's existing patterns and conventions
- Review your own output for correctness before responding
- When debugging, isolate the problem before proposing a fix
`;

const REVIEWER_SOUL = `# Identity

You are the Reviewer Agent. You review code changes for correctness, safety, and style.

## Behaviour

- Check for logic errors, security issues, and performance problems
- Suggest improvements without being prescriptive
- Approve simple changes quickly; flag complex ones for discussion
- Reference specific lines when giving feedback
`;

type MockProfile = {
  name: string;
  config: Record<string, unknown>;
  soul: string;
};

function buildConfig(overrides: Record<string, unknown> = {}) {
  return {
    model: { default: "deepseek-v4-flash", provider: "deepseek" },
    providers: {},
    fallback_providers: [],
    toolsets: ["hermes-cli"],
    agent: { max_turns: 90 },
    workspace: "/tmp",
    ...overrides,
  };
}

export async function createMockHermesHome(): Promise<string> {
  const basePath = join(tmpdir(), "hermes-hub-mock", Date.now().toString());

  await mkdir(basePath, { recursive: true });

  const profiles: MockProfile[] = [
    {
      name: "assistant",
      config: buildConfig({
        model: { default: "deepseek-v4-flash", provider: "deepseek" },
        workspace: "/tmp",
      }),
      soul: DEFAULT_SOUL,
    },
    {
      name: "coder",
      config: buildConfig({
        model: { default: "deepseek-v4-pro", provider: "deepseek" },
        workspace: "/Users/dev/projects",
      }),
      soul: CODER_SOUL,
    },
    {
      name: "reviewer",
      config: buildConfig({
        model: { default: "claude-sonnet-4-6", provider: "anthropic" },
        workspace: "/Users/dev/review",
      }),
      soul: REVIEWER_SOUL,
    },
  ];

  // Write root-level config.yaml and SOUL.md (the default profile)
  await writeFile(
    join(basePath, "config.yaml"),
    toYaml(buildConfig()),
    "utf8",
  );
  await writeFile(join(basePath, "SOUL.md"), DEFAULT_SOUL, "utf8");

  // Write profile subdirectories
  const profilesDir = join(basePath, "profiles");
  await mkdir(profilesDir, { recursive: true });

  for (const profile of profiles) {
    const dir = join(profilesDir, profile.name);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "config.yaml"), toYaml(profile.config), "utf8");
    await writeFile(join(dir, "SOUL.md"), profile.soul, "utf8");
  }

  return basePath;
}

function toYaml(obj: Record<string, unknown>, indent = 0): string {
  const prefix = "  ".repeat(indent);
  const lines: string[] = [];

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;

    if (typeof value === "object" && !Array.isArray(value)) {
      lines.push(`${prefix}${key}:`);
      lines.push(toYaml(value as Record<string, unknown>, indent + 1));
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${prefix}${key}: []`);
      } else {
        lines.push(`${prefix}${key}:`);
        for (const item of value) {
          if (typeof item === "string") {
            lines.push(`${prefix}  - ${item}`);
          } else {
            lines.push(`${prefix}  - ${JSON.stringify(item)}`);
          }
        }
      }
    } else if (typeof value === "string") {
      lines.push(`${prefix}${key}: ${value}`);
    } else {
      lines.push(`${prefix}${key}: ${value}`);
    }
  }

  return lines.join("\n");
}
