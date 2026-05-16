# Hermes Hub PRD v0.6 MVP 收敛版

> 基于 v0.5 继续补充：本版以“冷静的产品负责人”视角重新收敛 MVP，明确 2 周内只验证核心假设：Hermes Hub 是否能通过 npx 启动，并稳定扫描已有 Hermes Profile、读取 config.yaml / SOUL.md、做安全编辑与备份。创建向导、Profile 克隆、Gateway 启停、实时日志、模板系统、完整健康中心等从 MVP 中下放到后续版本。

---

## 1. 产品概述

### 1.1 产品名称

**Hermes Hub**

### 1.2 命名规范

| 项目 | 内容 |
|---|---|
| 产品英文名 | Hermes Hub |
| 产品中文名 | Hermes 中枢 / Hermes 管理中心 |
| 产品副标题 | Multi-Agent Profile Hub for Hermes |
| 一句话定位 | 用于统一创建、配置、运行和维护多个 Hermes Agent Profile 的本地可视化管理中心 |
| npm 包名 | `hermes-hub` |
| npx 启动命令 | `npx hermes-hub` |
| 组织包名备选 | `@hermes/hub` |
| 默认访问地址 | `http://127.0.0.1:8899` |

命名理由：

1. Hub 强调集中连接与管理，比 Multi-Instance 更贴合多个 Hermes Agent Profile 的聚合场景。
2. Hub 不局限于进程启停，能够覆盖 Profile、SOUL.md、Gateway、Skills、MCP、Cron、Sessions、Logs、Health 等对象。
3. Hub 适合后续扩展为本地版、桌面版、团队版或远程节点管理版。
4. `npx hermes-hub` 简短易记，适合 CLI 分发。

### 1.3 产品定位

Hermes Hub 是一个面向 Hermes Agent 多 Profile / 多 Agent 工作空间的本地可视化管理中心，用于统一完成 Agent 的创建、配置、运行、监控、日志查看、健康检查、备份与迁移。

它不是简单的“进程启停面板”，而是围绕 Hermes Agent Profile、HERMES_HOME、SOUL.md、config.yaml、Gateway Runtime、Skills、MCP、Cron、Sessions 和 Logs 构建的管理中枢。

### 1.4 核心问题

当用户同时维护多个 Hermes Agent 时，常见问题包括：

1. 新增 Agent 麻烦：需要复制目录、初始化配置、设置模型、配置密钥、调整 SOUL.md、启用技能、配置 MCP、配置 Gateway。
2. 修改 Agent 麻烦：配置分散在 `config.yaml`、`.env`、`auth.json`、`SOUL.md`、skills、cron、logs、sessions 等文件或目录中，手工编辑容易出错。
3. 多 Agent 状态不透明：难以直观看到每个 Agent 使用哪个模型、哪个工作目录、哪些工具、Gateway 是否运行、最近是否报错。
4. 排障成本高：需要手动执行 doctor、查日志、查配置、检查端口、检查权限和环境变量。
5. 复用困难：一个配置较好的 Agent 很难快速克隆成另一个用途相近的 Agent。

### 1.5 核心价值

通过 Hermes Hub 将 Hermes Agent 的 Profile、配置、身份、记忆、技能、MCP、Gateway、Cron、Session 和日志集中管理，实现：

- 新建 Agent 从“手动复制和配置”变成“模板化创建”。
- 修改配置从“编辑多个文件”变成“可视化表单 + YAML Raw 模式 + Diff 校验”。
- 排障从“人工看日志”变成“自动健康检查 + 问题定位 + 修复建议”。
- 多 Agent 运维从“分散命令行操作”变成“统一本地管理中心”。

---

## 2. Hermes Agent 关键对象理解

### 2.1 Agent Profile

Profile 是 Hermes Hub 的核心管理对象。每个 Profile 代表一个相对独立的 Hermes Agent 状态空间，可用于不同用途，例如编码助手、研究助手、个人助手、自动化任务 Agent、客服 Agent 等。

每个 Profile 至少应包含：

```text
Profile
├─ 基础信息：name、description、tags、status
├─ HERMES_HOME / state directory
├─ config.yaml
├─ .env / auth 信息引用
├─ SOUL.md
├─ memories / USER.md / long-term memory
├─ skills
├─ MCP servers
├─ cron jobs
├─ sessions
├─ logs
└─ gateway state / service state
```

### 2.2 HERMES_HOME

HERMES_HOME 是一个 Agent Profile 的状态目录。Hermes Hub 在创建和管理 Agent 时，应围绕 HERMES_HOME 做目录规划、权限检查、文件检测、备份恢复和状态扫描。

### 2.3 Config

Hermes 配置应支持两种编辑模式：

1. 表单模式：适合常用配置，例如模型、Provider、工作目录、终端后端、工具开关、Gateway 开关。
2. Raw 模式：直接编辑 `config.yaml`，适合高级用户。

### 2.4 SOUL.md

SOUL.md 是 Agent 的身份 / 人格 / 系统行为描述文件。Hermes Hub 应将其作为一等配置对象，而不是普通附件。

建议支持：

- 在线编辑 SOUL.md
- 模板生成 SOUL.md
- 对比不同 Profile 的 SOUL.md
- 修改历史
- 注入风险检查
- 长度检查
- 生效预览

### 2.5 Gateway Runtime

Hermes Gateway 是长期运行入口之一，适合接入 Telegram、Discord、Slack 或其他消息平台。Hermes Hub 中的 Start / Stop / Restart 更应该主要作用于 Gateway Runtime，而不是简单理解为整个 Agent 的生命周期。

### 2.6 Skills / MCP / Cron / Sessions / Logs

Hermes Hub 需要把这些对象从“目录和命令”提升为可视化管理对象：

- Skills：展示已安装、已启用、来源、版本、依赖、权限风险。
- MCP Servers：展示服务名、命令、参数、环境变量、连接状态、工具列表。
- Cron Jobs：展示定时任务、执行状态、最近运行结果、失败次数。
- Sessions：展示历史会话、最近活跃时间、关联 Profile、上下文摘要。
- Logs：展示运行日志、Gateway 日志、任务日志、错误聚合。

---

## 3. 用户角色与场景

| 角色 | 核心需求 | 典型场景 |
|---|---|---|
| 开发者 | 快速创建多个不同用途 Agent | 为不同项目创建 coder、reviewer、researcher Profile |
| 系统管理员 | 统一监控、排障、备份 | 查看哪些 Gateway 正在运行、哪些 Agent 报错 |
| 研究人员 | 对比模型和配置效果 | 用不同模型 / prompt / skill 组合做实验 |
| 运营人员 | 维护面向业务的 Agent | 修改人格、消息渠道、定时任务、知识记忆 |
| 团队负责人 | 管理权限与审计 | 查看谁修改了哪个 Agent 的配置 |

---

## 4. 产品目标

### 4.1 MVP 目标

MVP 不再同时追求“新增、修改、运行、监控、排障、模板”的完整闭环。第一版只验证一个核心假设：

> 用户是否愿意使用一个本地 Web 工具，通过 `npx hermes-hub` 打开后，统一查看已有 Hermes Profile，并更安全地编辑 `config.yaml` 和 `SOUL.md`。

MVP 必须完成：

1. 支持 `npx hermes-hub` 本地启动。
2. 支持 Hermes CLI / HERMES_HOME 探测。
3. 支持扫描已有 Hermes Profiles。
4. 支持 Profile 列表与基础详情。
5. 支持查看 `config.yaml` 和 `SOUL.md`。
6. 支持编辑并保存 `config.yaml` 和 `SOUL.md`。
7. 支持保存前自动备份。
8. 支持基础校验：文件存在、YAML 语法、路径权限、SOUL.md 是否为空。
9. 支持敏感信息脱敏显示。

MVP 暂不承诺：

1. 不承诺创建 Profile 向导。
2. 不承诺 Profile 克隆。
3. 不承诺 Gateway 启动 / 停止 / 重启。
4. 不承诺实时日志流。
5. 不承诺模板系统。
6. 不承诺完整 Health Center。
7. 不承诺资源监控大盘。
8. 不承诺智能排障或一键修复。

### 4.2 非 MVP 但重要目标

1. 创建 Profile 向导。
2. Profile 克隆。
3. Gateway 状态检测、启动、停止、重启。
4. 日志查看与实时日志流。
5. Doctor 集成与 Health Center。
6. 模板系统。
7. Skills / MCP / Cron 可视化管理。
8. 配置版本历史与回滚增强。
9. 多节点 Agent 管理。
10. 团队权限控制。
11. 指标看板与告警。
12. Marketplace / Template Hub。
13. Electron / Tauri 桌面版。

---

## 5. 核心功能模块

## 5.1 Profile 管理

### 5.1.1 Profile 列表

列表字段：

| 字段 | 说明 |
|---|---|
| Name | Profile 名称 |
| Status | Ready / Running / Stopped / Error / Unknown |
| Gateway | Running / Stopped / Not Configured |
| Model | 当前默认模型 |
| Provider | OpenAI / Anthropic / Ollama / 其他 |
| Workspace | 当前工作目录 |
| Skills | 已启用技能数量 |
| MCP | 已配置 MCP server 数量 |
| Last Session | 最近会话时间 |
| Last Error | 最近错误摘要 |
| Updated At | 最近配置更新时间 |

### 5.1.2 Profile 创建

创建方式：

1. 从空白创建
2. 从模板创建
3. 从已有 Profile 克隆
4. 从目录导入
5. 从备份恢复

创建向导建议分为 6 步：

1. 基础信息：Profile Name、Display Name、Description、Tags、HERMES_HOME、Workspace。
2. 模型与 Provider：Provider、Model、Base URL、API Key 引用方式、参数。
3. Agent Identity：选择 SOUL.md 模板、编辑 SOUL.md、设置记忆初始化内容。
4. Tools / Skills / MCP：选择 Skills、配置 MCP、配置工具权限。
5. Gateway / Cron：是否启用 Gateway、渠道配置、是否创建系统服务、是否启用 Cron。
6. 校验与创建：目录权限、配置格式、API Key、模型、MCP、端口、Gateway 状态、Diff。

### 5.1.3 Profile 克隆

| 选项 | 默认值 | 说明 |
|---|---|---|
| 复制 config.yaml | 是 | 复制基础配置 |
| 复制 SOUL.md | 是 | 复制 Agent 身份 |
| 复制 .env | 否 | 默认不复制密钥文件，避免泄漏 |
| 复制 auth.json | 否 | 默认不复制认证文件 |
| 复制 memories | 可选 | 根据场景决定是否继承记忆 |
| 复制 skills | 是 | 复制启用状态 |
| 复制 sessions | 否 | 默认不复制历史会话 |
| 复制 logs | 否 | 默认不复制日志 |
| 复制 gateway state | 否 | 防止渠道状态冲突 |
| 自动改名 | 是 | 避免 Profile 冲突 |

### 5.1.4 Profile 删除

删除应分为两种：

1. 从 Hermes Hub 移除注册信息，不删除文件。
2. 删除 Profile 目录，需要二次确认并输入 Profile 名称。

删除前必须提示：是否包含密钥文件、会话历史、记忆、日志，是否已备份，Gateway 是否正在运行。

---

## 5.2 配置管理

### 5.2.1 配置视图

配置页分为：

1. Overview：关键配置摘要
2. Form：可视化配置
3. YAML：原始配置编辑
4. Diff：修改前后对比
5. History：版本历史
6. Validate：校验结果

### 5.2.2 可视化配置项

| 配置类别 | 字段 |
|---|---|
| 基础 | Profile name、HERMES_HOME、Workspace |
| 模型 | Provider、Model、Base URL、Temperature、Max tokens |
| 终端 | Backend、Shell、Working Directory、Timeout |
| 工具 | Tool enable/disable、权限范围、确认策略 |
| MCP | Server name、command、args、env、enabled |
| 记忆 | Memory enabled、memory path、USER.md |
| Gateway | enabled、channels、service name、port/state |
| Cron | enabled、job list、timezone |
| 日志 | log level、retention、max size |

### 5.2.3 保存策略

1. Save Draft：保存草稿，不写入实际配置。
2. Save Config：写入配置，但不重启 Gateway。
3. Save & Restart Gateway：写入配置并重启 Gateway。
4. Save as Template：保存为模板。

### 5.2.4 配置校验

校验类型：YAML 语法校验、必填项校验、路径存在性校验、权限校验、Provider / Model 可访问性校验、API Key 引用校验、MCP command 可执行校验、Gateway service 状态校验、Cron 语法校验、SOUL.md 风险校验。

### 5.2.5 配置版本管理

每次保存配置生成版本记录，支持查看历史版本、Diff 对比、回滚到某版本、标记稳定版本。

---

## 5.3 SOUL.md 管理

### 5.3.1 SOUL 编辑器

功能：Markdown 编辑、实时预览、Prompt 长度统计、风险语句检测、模板插入、与其他 Profile 对比、保存历史。

### 5.3.2 SOUL 模板

内置模板建议：Coding Agent、Research Agent、Ops Agent、Personal Assistant、Customer Support Agent、Data Analysis Agent。

### 5.3.3 SOUL 校验

校验内容：是否为空、是否超过建议长度、是否包含明显 prompt injection 风险、是否包含敏感密钥、是否与当前 Profile 目标冲突。

---

## 5.4 Gateway 管理

### 5.4.1 Gateway 状态

| 字段 | 说明 |
|---|---|
| Status | Running / Stopped / Error / Unknown |
| PID | 进程 ID |
| Service Name | systemd / launchd 服务名称 |
| Channels | Telegram / Discord / Slack / Other |
| Uptime | 运行时长 |
| Last Restart | 最近重启时间 |
| Last Error | 最近错误 |
| Log Path | 日志路径 |

### 5.4.2 Gateway 操作

Start Gateway、Stop Gateway、Restart Gateway、Install Service、Uninstall Service、View Gateway Logs、Run Gateway Doctor。

### 5.4.3 注意事项

Hermes Hub 中的运行态应区分：Profile 是否配置完整、Gateway 是否正在运行、Cron 是否正在运行、当前是否有活跃 Session。不要将 Profile 的存在等同于 Agent 正在运行。

---

## 5.5 Skills 管理

Skills 列表字段包括：Name、Source、Version、Enabled Profiles、Permissions、Health、Updated At。

Skill 操作包括：启用 / 禁用、安装 / 卸载、更新、查看 README、查看权限声明、应用到多个 Profile。

对于具有文件、网络、Shell、GitHub、浏览器等权限的 Skill，应展示风险标记。

---

## 5.6 MCP Server 管理

MCP Server 列表字段包括：Name、Command、Args、Env、Status、Tools、Used By、Last Check。

MCP 配置编辑支持：表单编辑 command / args / env、JSON / YAML Raw 编辑、连接测试、工具发现、日志查看、应用到多个 Profile。

MCP 安全边界需要明确：文件系统访问、网络权限、密钥使用、Shell 执行能力。

---

## 5.7 Cron Jobs 管理

Cron 列表字段包括：Job Name、Profile、Schedule、Prompt / Command、Enabled、Last Run、Next Run、Last Result、Failure Count。

操作包括：新增任务、编辑任务、启用 / 禁用、立即运行一次、查看执行日志、失败重试策略。

---

## 5.8 日志与 Session 管理

### 5.8.1 日志类型

Profile 日志、Gateway 日志、Cron 日志、MCP 日志、Doctor 日志、Hermes Hub 后端日志。

### 5.8.2 日志能力

实时日志流、关键词搜索、Level 过滤、时间范围过滤、Profile 过滤、错误高亮、导出日志、一键复制错误上下文。

### 5.8.3 Session 列表

字段包括：Session ID、Profile、Started At、Last Active、Model、Summary、Token Usage、Status。

---

## 5.9 健康检查与智能排障

### 5.9.1 健康检查维度

HERMES_HOME、config.yaml、.env / auth、SOUL.md、Model、Provider、MCP、Gateway、Cron、Logs、Disk、Port。

### 5.9.2 问题分类

Config Error、Missing File、Permission Error、Auth Error、Model Error、Network Error、MCP Error、Gateway Error、Cron Error、Resource Error、Unknown Error。

### 5.9.3 修复建议

每个问题应给出：错误摘要、影响范围、可能原因、建议操作、是否支持一键修复、对应日志片段、相关配置路径。

---

## 6. 页面结构设计

### 6.1 信息架构

```text
Hermes Hub
├─ Dashboard
├─ Profiles
│  ├─ Profile List
│  ├─ Profile Detail
│  │  ├─ Overview
│  │  ├─ Config
│  │  ├─ SOUL.md
│  │  ├─ Gateway
│  │  ├─ Skills
│  │  ├─ MCP
│  │  ├─ Cron
│  │  ├─ Sessions
│  │  ├─ Logs
│  │  └─ Health Check
│  └─ Create Profile Wizard
├─ Templates
│  ├─ Profile Templates
│  ├─ SOUL Templates
│  └─ MCP Templates
├─ Logs
├─ Health Center
├─ Settings
│  ├─ Global Settings
│  ├─ Runtime Detection
│  ├─ Security
│  ├─ Backup
│  └─ Users / Roles
└─ About
```

### 6.2 首页 Dashboard

展示：总 Profile 数、Gateway Running 数、Error Profile 数、今日 Session 数、Cron 失败数、资源使用概览、最近错误、最近修改、快速入口 New Profile / Import / Run Doctor / View Logs。

### 6.3 Profile 详情页

推荐 Overview 卡片字段：Profile、Status、Gateway、Model、Provider、HERMES_HOME、Workspace、Skills、MCP Servers、Cron Jobs、Last Session、Health。

操作按钮：Open Chat、Run Prompt、Start Gateway、Stop Gateway、Restart Gateway、Edit Config、Edit SOUL.md、Run Doctor、Clone Profile、Backup、Delete。

---

## 7. Hermes Runtime Research

### 7.1 研究目标

Hermes Hub 的核心风险不在 UI，而在是否能稳定识别、读取、创建、修改、启动和排障真实的 Hermes Agent Profile。因此在正式开发前，必须先确认 Hermes CLI 命令、Profile 结构、HERMES_HOME 规则、Gateway 运行方式、日志位置和配置文件语义。

本章节作为 Hermes Hub Runtime Adapter 的开发依据。

### 7.2 已确认方向

Hermes Hub 的核心管理对象应为：

```text
Hermes Profile
```

而不是传统意义上的 Instance。

每个 Profile 应被视为一个独立的 Hermes Agent 状态空间，通常包含：

```text
HERMES_HOME
├─ config.yaml
├─ .env
├─ auth.json
├─ SOUL.md
├─ memories/
├─ sessions/
├─ skills/
├─ cron/
├─ logs/
└─ gateway state / runtime state
```

### 7.3 必须本机确认的 Hermes CLI 命令

开发前需要在目标环境执行以下命令，并保存输出作为适配依据：

```bash
which hermes
hermes --version
hermes --help
hermes profile --help
hermes profile list
hermes config --help
hermes config home
hermes doctor --help
hermes gateway --help
hermes logs --help
```

建议保存为：

```bash
mkdir -p docs/research

{
  echo "## which hermes"
  which hermes

  echo "\n## hermes --version"
  hermes --version

  echo "\n## hermes --help"
  hermes --help

  echo "\n## hermes profile --help"
  hermes profile --help

  echo "\n## hermes profile list"
  hermes profile list

  echo "\n## hermes config --help"
  hermes config --help

  echo "\n## hermes config home"
  hermes config home

  echo "\n## hermes doctor --help"
  hermes doctor --help

  echo "\n## hermes gateway --help"
  hermes gateway --help

  echo "\n## hermes logs --help"
  hermes logs --help
} > docs/research/hermes-cli-research.md 2>&1
```

### 7.4 Runtime Adapter 第一版适配范围

第一版 Runtime Adapter 不急于实现所有写操作，优先实现“探测 + 读取 + 校验”。

MVP 适配方法：

```ts
interface HermesRuntimeAdapter {
  detect(): Promise<HermesRuntimeInfo>
  getVersion(): Promise<string>
  detectHermesHome(): Promise<string>
  listProfiles(): Promise<ProfileSummary[]>
  readProfile(profileId: string): Promise<ProfileDetail>
  readConfig(profileId: string): Promise<ConfigFileResult>
  readSoul(profileId: string): Promise<SoulFileResult>
  runDoctor(profileId: string): Promise<DoctorResult>
  getGatewayStatus(profileId: string): Promise<GatewayStatus>
  readLogs(profileId: string, options: LogQuery): AsyncIterable<LogLine>
}
```

后续再扩展写操作：createProfile、cloneProfile、saveConfig、saveSoul、startGateway、stopGateway、restartGateway。

### 7.5 Profile 扫描结果结构

```ts
type HermesProfileScanResult = {
  name: string
  hermesHome: string
  configPath: string
  envPath?: string
  authPath?: string
  soulPath: string
  hasConfig: boolean
  hasEnv: boolean
  hasAuth: boolean
  hasSoul: boolean
  hasSessions: boolean
  hasMemories: boolean
  hasSkills: boolean
  hasCron: boolean
  hasLogs: boolean
  gatewayState?: 'running' | 'stopped' | 'error' | 'unknown'
  lastUpdated?: string
}
```

### 7.6 适配原则

1. 不硬编码单一 Hermes 版本的命令输出。
2. 优先通过 Hermes CLI 探测真实路径与能力。
3. CLI 不支持的能力再退回目录扫描。
4. 读操作优先，写操作必须具备备份、校验和回滚能力。
5. 不在 Hermes Hub 中发明独立 Profile 结构，应尽量遵循 Hermes 官方结构。
6. 不直接展示密钥值。
7. 不默认复制 `.env`、`auth.json`、sessions、logs。
8. Gateway 的运行态和 Profile 的存在态必须区分。
9. Runtime Adapter 输出必须标准化，供前端稳定消费。
10. 所有探测失败都需要给出明确错误原因和修复建议。

### 7.7 待确认问题

| 问题 | 优先级 | 说明 |
|---|---|---|
| `hermes profile list` 是否支持结构化输出 | 高 | 决定扫描方式 |
| `hermes config home` 在不同 Profile 下返回什么 | 高 | 决定 HERMES_HOME 检测 |
| Gateway 启停命令是否支持指定 Profile | 高 | 决定 Gateway 管理实现 |
| doctor 是否支持 JSON 输出 | 中 | 决定健康检查解析方式 |
| logs 命令是否支持 tail / follow | 中 | 决定实时日志实现 |
| skills / mcp / cron 是否有独立 CLI | 中 | 决定可视化管理深度 |
| Windows 路径和进程管理兼容性 | 中 | 决定跨平台支持策略 |
| Profile 克隆是否复制敏感信息 | 高 | 决定克隆默认策略 |

---

## 8. 技术方案与分发形态

### 8.1 推荐产品形态

Hermes Hub 建议采用“本地优先的 Node.js CLI + Web 管理后台”形态。

用户通过 npm / npx 启动本地管理后台：

```bash
npx hermes-hub
```

启动后由 CLI 自动完成：检查 Node.js 版本、检查 Hermes CLI、检查或初始化本地数据目录、扫描默认 HERMES_HOME、自动选择可用端口、启动本地 API Server、打开浏览器。

默认访问地址：

```text
http://127.0.0.1:8899
```

默认不得监听 `0.0.0.0`，除非用户显式指定。

### 8.2 推荐技术栈

| 层级 | 推荐技术 | 说明 |
|---|---|---|
| CLI 分发层 | Node.js + TypeScript + Commander | 提供 `npx hermes-hub` 入口 |
| 本地 API 服务 | Fastify / Hono | 提供 Profile、Config、Gateway、Logs、Health API |
| 前端框架 | React + Vite + TypeScript | 构建本地 Web Dashboard |
| UI 组件 | Tailwind CSS + shadcn/ui + lucide-react | 快速实现高质量管理后台 |
| 状态管理 | TanStack Query + Zustand | API 请求状态与局部 UI 状态 |
| 编辑器 | Monaco Editor | YAML、SOUL.md、Diff 编辑体验 |
| 本地数据库 | SQLite / better-sqlite3 | Profile Registry、配置版本、审计日志 |
| 进程调用 | execa | 调用 Hermes CLI、Gateway、doctor 等命令 |
| 日志监听 | chokidar / tail | 实时日志监听与 WebSocket 推送 |
| 配置处理 | yaml + zod | YAML 读写、Schema 校验 |
| WebSocket | @fastify/websocket | 实时日志、状态、任务进度推送 |
| 自动打开浏览器 | open | 启动后打开 Dashboard 页面 |

### 8.3 Monorepo 包结构

```text
hermes-hub
├─ packages
│  ├─ cli
│  ├─ server
│  ├─ web
│  ├─ core
│  ├─ shared
│  └─ templates
├─ package.json
├─ pnpm-workspace.yaml
└─ tsconfig.base.json
```

### 8.4 npm / npx 分发设计

```json
{
  "name": "hermes-hub",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "hermes-hub": "./dist/cli/index.js"
  },
  "files": [
    "dist",
    "web-dist",
    "templates",
    "README.md",
    "LICENSE"
  ],
  "engines": {
    "node": ">=20"
  }
}
```

CLI 入口文件必须包含：

```js
#!/usr/bin/env node
```

用户安装方式：

```bash
npx hermes-hub
npm install -g hermes-hub
hermes-hub
pnpm dlx hermes-hub
```

### 8.5 CLI 命令设计

MVP 阶段优先支持：

```bash
hermes-hub
hermes-hub --port 8899
hermes-hub --host 127.0.0.1
hermes-hub --home ~/.hermes
hermes-hub --no-open
hermes-hub doctor
hermes-hub scan
```

后续版本扩展：

```bash
hermes-hub init
hermes-hub export
hermes-hub import <backup.zip>
hermes-hub reset
hermes-hub version
hermes-hub service install
hermes-hub service uninstall
```

### 8.6 本地数据目录

默认路径建议：

```text
~/.hermes-hub/
├─ hub.db
├─ config.json
├─ logs/
├─ backups/
├─ cache/
└─ audit/
```

---

## 9. 后端能力设计

### 9.1 Runtime Adapter

Runtime Adapter 负责：发现 Hermes CLI 路径、获取 Hermes 版本、探测可用命令、执行 profile / config / gateway / doctor / logs 等命令、兼容不同版本命令差异、标准化输出结果。

### 9.2 Profile Registry

Hermes Hub 需要维护自己的 Profile 注册表，用于记录 UI 层元数据。实际配置仍以 Hermes Profile 目录为准。

### 9.3 配置写入策略

建议采用安全写入：读取当前配置、生成临时文件、校验临时文件、生成 Diff、备份旧文件、原子替换、记录版本、触发重载或提示重启。

### 9.4 日志流

后端提供 WebSocket，支持 tail、过滤、断线重连和历史回放。

---

## 10. 数据模型初稿

### 10.1 Profile

```sql
CREATE TABLE profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT,
  description TEXT,
  hermes_home TEXT NOT NULL,
  workspace TEXT,
  status TEXT,
  gateway_status TEXT,
  model TEXT,
  provider TEXT,
  tags TEXT,
  created_at TEXT,
  updated_at TEXT
);
```

### 10.2 ConfigVersion

```sql
CREATE TABLE config_versions (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  diff TEXT,
  changed_by TEXT,
  change_type TEXT,
  restart_required INTEGER,
  validation_status TEXT,
  created_at TEXT
);
```

### 10.3 HealthCheckResult

```sql
CREATE TABLE health_check_results (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  check_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  suggestion TEXT,
  fixable INTEGER,
  created_at TEXT
);
```

### 10.4 Template

```sql
CREATE TABLE templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  content TEXT NOT NULL,
  created_at TEXT,
  updated_at TEXT
);
```

---

## 11. API 初稿

### 11.1 Profiles

```http
GET    /api/profiles
POST   /api/profiles
GET    /api/profiles/{id}
PATCH  /api/profiles/{id}
DELETE /api/profiles/{id}
POST   /api/profiles/{id}/clone
POST   /api/profiles/{id}/backup
POST   /api/profiles/import
```

### 11.2 Config

```http
GET   /api/profiles/{id}/config
PUT   /api/profiles/{id}/config
POST  /api/profiles/{id}/config/validate
GET   /api/profiles/{id}/config/diff
GET   /api/profiles/{id}/config/versions
POST  /api/profiles/{id}/config/rollback
```

### 11.3 SOUL

```http
GET  /api/profiles/{id}/soul
PUT  /api/profiles/{id}/soul
POST /api/profiles/{id}/soul/validate
GET  /api/soul-templates
POST /api/soul-templates
```

### 11.4 Gateway

```http
GET  /api/profiles/{id}/gateway/status
POST /api/profiles/{id}/gateway/start
POST /api/profiles/{id}/gateway/stop
POST /api/profiles/{id}/gateway/restart
POST /api/profiles/{id}/gateway/install-service
POST /api/profiles/{id}/gateway/uninstall-service
```

### 11.5 Health

```http
POST /api/profiles/{id}/doctor
GET  /api/profiles/{id}/health
POST /api/profiles/{id}/health/fix
```

### 11.6 Logs

```http
GET /api/profiles/{id}/logs
GET /api/profiles/{id}/logs/download
WS  /ws/profiles/{id}/logs
```

---

## 12. 权限与安全

### 12.1 敏感信息处理

- API Key 不应明文展示。
- `.env` 默认仅允许编辑 key 名称和值的掩码形式。
- 导出模板时默认不包含密钥。
- 克隆 Profile 时默认不复制 `.env` 和 auth 信息。
- 日志展示时应支持密钥脱敏。

### 12.2 文件访问边界

需要明确：允许管理的根目录、是否允许任意路径导入、是否允许删除目录、是否支持软链接、是否允许访问用户 Home 目录下敏感文件。

### 12.3 操作审计

需要记录：创建 Profile、修改配置、编辑 SOUL.md、启动 / 停止 Gateway、删除 Profile、执行一键修复。

### 12.4 本地安全边界

1. 默认只监听 `127.0.0.1`。
2. 默认不允许局域网访问。
3. 克隆 Profile 默认不复制 `.env`、`auth.json`、sessions、logs。
4. 删除 Profile 目录必须二次确认，并输入 Profile 名称。
5. 保存配置前必须自动备份。
6. 所有危险操作必须写入审计日志。
7. 日志显示必须执行敏感信息脱敏。
8. 允许用户设置可管理根目录，避免任意路径读写。

---

## 13. 非功能性需求

| 类别 | 要求 |
|---|---|
| 性能 | 本地模式支持至少 20 个 Profile，列表刷新 < 1 秒 |
| 日志 | 实时日志延迟 < 1 秒，支持至少 10MB 日志文件浏览 |
| 配置安全 | 保存前必须校验，写入前必须备份 |
| 可靠性 | Gateway 操作失败必须返回明确错误原因 |
| 可扩展性 | 后端通过 Runtime Adapter 适配 Hermes CLI 版本变化 |
| 可维护性 | Profile、Gateway、Config、Logs、Health 模块解耦 |
| 安全 | 密钥脱敏、删除确认、敏感操作审计 |
| 可迁移 | 支持 Profile 备份、恢复、导入、导出 |

---

## 14. MVP 收敛判断\n\n### 14.1 当前 MVP 过大的原因\n\n当前 PRD 覆盖了 Profile 管理、配置管理、SOUL.md、Gateway、Skills、MCP、Cron、Logs、Health、Templates、Backup、Audit、npx 分发等多个模块。作为完整产品路线是合理的，但作为 MVP 过大。\n\n核心原因：\n\n1. 同时验证了太多假设。\n2. 写操作、进程操作、实时日志、模板和智能排障都存在较高实现风险。\n3. 很多功能能让产品“看起来完整”，但不能直接验证用户是否真的需要 Hermes Hub。\n4. 2 周内如果追求完整页面，很可能只做出漂亮但不可用的 Dashboard。\n\n### 14.2 MVP 核心假设\n\nMVP 只验证以下假设：\n\n> 当用户有多个 Hermes Agent Profile 时，最大的痛点是否是“看不清现有 Profile，改 config.yaml / SOUL.md 不安全、不方便”。\n\n如果这个假设成立，Hermes Hub 才值得继续扩展到创建、克隆、Gateway、日志、Health、模板和团队能力。\n\n### 14.3 必须保留\n\n| 功能 | 保留原因 |\n|---|---|\n| `npx hermes-hub` 本地启动 | 验证分发方式与使用门槛 |\n| Hermes CLI 探测 | 验证能否找到真实 Hermes 环境 |\n| HERMES_HOME 探测 | 验证能否找到真实 Profile 状态目录 |\n| Profile 扫描 | 验证是否能识别用户已有 Agent |\n| Profile 列表 | 核心入口，证明“集中管理”价值 |\n| Profile 详情基础信息 | 让用户知道每个 Profile 的配置状态 |\n| config.yaml 查看 / 编辑 / 保存 | 直接验证“修改麻烦”痛点 |\n| SOUL.md 查看 / 编辑 / 保存 | 直接验证 Agent 身份管理痛点 |\n| 保存前自动备份 | 降低用户试用风险 |\n| YAML 基础校验 | 避免保存坏配置 |\n| 密钥脱敏 | 本地工具的最低安全要求 |\n\n### 14.4 可以砍掉 / 下放\n\n| 功能 | 处理方式 | 原因 |\n|---|---|---|\n| 创建 Profile 向导 | 下放到 v0.2 | 创建涉及目录、模板、密钥、模型、Gateway，复杂度高 |\n| Profile 克隆 | 下放到 v0.2 | 克隆涉及 `.env`、auth、sessions、logs 的安全边界 |\n| Gateway 启停 | 下放到 v0.2 | 涉及进程管理和跨平台差异 |\n| 实时日志流 | 下放到 v0.2 | WebSocket、tail、日志路径兼容会增加复杂度 |\n| Doctor Health Center | 下放到 v0.2 | doctor 输出解析和规则引擎不是第一假设 |\n| Skills 管理 | 下放到 v0.3 | 先只展示摘要，不做管理 |\n| MCP 管理 | 下放到 v0.3 | 命令、env、连接测试复杂 |\n| Cron 管理 | 下放到 v0.3 | 调度和执行日志不是首要痛点 |\n| 模板系统 | 下放到 v0.3 | 对新增有价值，但不验证编辑已有 Profile |\n| 配置版本历史 / 回滚 | 下放到 v0.2 | MVP 只保留“保存前备份”，不做完整版本系统 |\n| 资源监控 | 砍掉 MVP | 与“新增和修改麻烦”无直接关系 |\n| 智能排障 / 一键修复 | 砍掉 MVP | 看起来高级，但实现风险高且不可控 |\n| 多用户权限 | 砍掉 MVP | 本地工具第一版不需要 |\n| 多节点远程管理 | 砍掉 MVP | 完全是后期团队版能力 |\n\n### 14.5 看起来完整但不能验证核心假设的功能\n\n1. 资源监控大盘：能让 UI 更像运维平台，但不能证明用户愿意用它管理 Hermes Profile。\n2. 智能排障：概念很好，但如果底层 doctor / logs 没打通，只会变成演示功能。\n3. 模板市场：对规模化有帮助，但不能验证用户最初是否需要 Hermes Hub。\n4. Skills / MCP / Cron 全量管理：完整但复杂，容易把 MVP 拖成平台工程。\n5. 实时日志流：体验好，但不是验证“修改配置更安全”的必要条件。\n6. Profile 创建向导：很重要，但创建比编辑复杂，先验证读取和修改更稳。\n\n### 14.6 最小闭环\n\n最小闭环定义为：\n\n```text\n用户执行 npx hermes-hub\n  ↓\n浏览器打开本地 Hermes Hub\n  ↓\n系统检测 hermes CLI 与 HERMES_HOME\n  ↓\n扫描已有 Profile\n  ↓\n用户进入某个 Profile\n  ↓\n查看 config.yaml / SOUL.md\n  ↓\n编辑并保存\n  ↓\n系统自动备份旧文件、校验新文件、脱敏敏感信息\n  ↓\n用户确认修改成功\n```\n\n这个闭环可以验证三件事：\n\n1. npx 分发是否足够低门槛。\n2. Hermes Hub 是否能理解真实 Hermes Profile。\n3. 用户是否愿意用 UI 替代手工改文件。\n\n---\n\n## 15. MVP 范围建议\n
### 15.1 MVP 必做

1. `npx hermes-hub` 本地启动能力。
2. 本地 Server 启动并自动打开浏览器。
3. Hermes CLI 探测：路径、版本、可用性。
4. HERMES_HOME 探测：优先 CLI，失败后手动选择。
5. Profile 扫描：识别已有 Profile 目录。
6. Profile 列表：展示名称、路径、config.yaml 状态、SOUL.md 状态、最近修改时间。
7. Profile 详情：展示基础文件结构和关键配置摘要。
8. config.yaml 查看、编辑、保存。
9. SOUL.md 查看、编辑、保存。
10. 保存前自动备份旧文件。
11. YAML 语法校验。
12. 文件权限检查。
13. 密钥脱敏展示。
14. 保存结果提示：成功、失败、备份位置、校验错误。

### 15.2 MVP 暂不做

1. 创建 Profile 向导。
2. Profile 克隆。
3. Gateway 启动、停止、重启。
4. 实时日志流。
5. Doctor Health Center。
6. Skills / MCP / Cron 管理。
7. 模板系统。
8. 配置版本历史与回滚 UI。
9. 资源监控大盘。
10. 智能排障与一键修复。
11. 多用户权限系统。
12. 多节点远程管理。
13. Electron / Tauri 桌面端。

---

## 16. 验收标准

| 模块 | 验收条件 |
|---|---|
| npx 启动 | 执行 `npx hermes-hub` 后可启动本地服务并打开浏览器 |
| Runtime 探测 | 能识别 Hermes CLI 路径、版本、HERMES_HOME；失败时给出清晰提示 |
| Profile 扫描 | 能识别已有 Hermes Profile，并展示路径、config.yaml 状态、SOUL.md 状态 |
| Profile 列表 | 至少能展示 1 个真实 Profile；没有 Profile 时展示空状态与手动选择入口 |
| Profile 详情 | 能展示基础文件结构、关键配置摘要、最近修改时间 |
| config.yaml 编辑 | 可打开、编辑、校验 YAML、保存；保存前自动备份 |
| SOUL.md 编辑 | 可打开、编辑、保存；保存前自动备份；空文件给出警告 |
| 安全 | `.env` / auth / token / key 等敏感值默认脱敏，不在日志和 UI 中明文暴露 |
| 错误处理 | 文件不存在、权限不足、YAML 错误、保存失败均有明确提示 |
| 最小闭环 | 用户能在 5 分钟内从启动工具到完成一次 config.yaml 或 SOUL.md 安全修改 |

---

## 17. 里程碑建议

### 2 周交付计划

#### 第 1 周：技术闭环

- Day 1：确认 Hermes CLI 命令与 HERMES_HOME 探测方式。
- Day 2：搭建 pnpm monorepo、CLI、Server、Web 基础结构。
- Day 3：实现 `npx hermes-hub` 启动、本地 Server、自动打开浏览器。
- Day 4：实现 Runtime detect：Hermes 路径、版本、HERMES_HOME。
- Day 5：实现 Profile 扫描 API 与最小 Profile List 页面。

#### 第 2 周：编辑闭环

- Day 6：Profile Detail 页面，展示 config.yaml / SOUL.md 状态。
- Day 7：实现 config.yaml 读取、编辑、YAML 校验。
- Day 8：实现 SOUL.md 读取、编辑、空内容警告。
- Day 9：实现保存前备份、保存失败恢复提示、密钥脱敏。
- Day 10：联调、真实 Profile 测试、修复错误、整理 README 和演示流程。

### v0.2 后续计划

- 创建 Profile 向导。
- Profile 克隆。
- Gateway 状态检测与启停。
- 日志查看。
- Doctor 基础集成。

### v0.3 后续计划

- Skills / MCP / Cron 管理。
- 模板系统。
- 配置版本历史和回滚 UI。
- Health Center。

---

## 18. 风险与待确认事项

### 18.1 Hermes CLI 命令差异

不同 Hermes 版本的 CLI 命令和参数可能变化。需要在开发前确认 profile、config、gateway、logs、doctor、skills、cron、mcp 相关命令，以及是否支持 JSON 输出。

### 18.2 Profile 目录结构差异

不同版本或不同安装方式下，HERMES_HOME 和 Profile 目录结构可能不同。Hermes Hub 不应强依赖单一硬编码路径。

### 18.3 密钥安全

`.env`、auth 文件、Provider token、MCP token 需要严格脱敏、备份排除和权限控制。

### 18.4 Gateway 服务管理

不同系统使用 systemd、launchd 或其他进程管理方式，需要抽象 service adapter。

### 18.5 删除和克隆风险

Profile 中可能包含记忆、会话、日志、密钥、平台状态，删除和克隆必须有明确选项和二次确认。

### 18.6 npx 分发与本地服务安全

npx 启动本地服务时需避免误暴露到局域网。默认必须绑定 `127.0.0.1`，并在用户显式传入 `--host 0.0.0.0` 时给出风险提示。

### 18.7 Node.js 版本与平台兼容

需要明确最低 Node.js 版本，建议为 Node.js 20+。需要测试 macOS、Linux、Windows 下的路径、权限、进程管理和日志监听行为。

### 18.8 打包体积与安装速度

前端静态资源、Monaco Editor、模板文件会增加 npm 包体积。需要在发布前控制 `files` 字段，避免将源码、测试文件、缓存文件一并发布。

---

## 19. 对初版 PRD 的关键调整点

| 初版表述 | 建议调整 |
|---|---|
| Hermes Multi-Instance Dashboard | Hermes Hub |
| Instance | Profile / Agent Profile |
| Start / Stop Instance | Start / Stop Gateway 或 Runtime |
| 自动分配端口与目录 | 创建 HERMES_HOME、Workspace、Gateway 配置 |
| 数据目录 | HERMES_HOME / Profile state directory |
| 资源监控优先 | MVP 中降级为次要，优先解决配置和新增 |
| 智能排障 | 先做 doctor 集成和规则检查，后做日志智能分析 |
| 模板系统 | 不只配置模板，还应包含 SOUL、MCP、Skills、Cron 模板 |

---

## 20. PRD 持续更新约定

后续对话中，只要出现以下内容变化，均需要同步更新 PRD，并生成新的版本文件：

1. 产品名称、定位、目标用户、核心价值发生变化。
2. Hermes CLI 命令、Profile 结构、HERMES_HOME 规则有新确认。
3. MVP 范围、里程碑、验收标准发生变化。
4. 新增或删除核心模块，例如 MCP、Skills、Cron、Gateway、Health Center、Templates。
5. 技术架构、分发方式、包名、命令行参数、数据目录发生变化。
6. UI 信息架构、页面结构、关键交互流程发生变化。
7. 安全策略、权限边界、密钥处理、删除/克隆策略发生变化。
8. 风险项、待确认事项、技术限制有新增结论。
9. 用户明确要求“更新 PRD”。

版本命名规则：

```text
Hermes Hub PRD v0.x 说明.md
```

示例：

```text
hermes_hub_prd_v0.6.md
hermes_hub_prd_v0.7.md
```

每次更新时，聊天中只提供简短说明和下载链接，不在聊天窗口完整展开 PRD 内容。

---

## 21. 一句话总结

Hermes Hub 的第一版 MVP 不追求完整平台，而是通过 `npx hermes-hub` 打通“启动 → 探测 Hermes → 扫描已有 Profile → 安全编辑 config.yaml / SOUL.md → 自动备份与校验”的最小闭环。只有当这个闭环被真实用户验证有价值后，再扩展创建、克隆、Gateway、日志、Health、模板、Skills、MCP 和 Cron。