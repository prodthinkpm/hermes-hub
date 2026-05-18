# Hermes Hub

**多 Agent / 多 Profile / 多节点统一管理平台** — 中心化的 Hermes Agent 控制台，采用 Controller-Agent 架构，通过 Web UI 管理本地和远程机器上的所有 Hermes Agent 实例。

---

## 项目简介

[Hermes Agent](https://hermes-agent.nousresearch.com/) 的多 Agent 能力通过 **Profile** 实现——每个 Profile 是一个独立的 Hermes home directory，包含自己的 `config.yaml`、`.env`、`SOUL.md`、sessions、skills、cron jobs 和 gateway state。

但随着 Agent 数量增长，纯 CLI 管理会出现痛点：

- 10 个 Agent 需要分别启动、停止、查看日志
- setup 过程需要手动进入终端
- 本机、远程服务器、Docker 容器中的 Agent 无法统一管理
- 多 Agent 状态、Gateway 状态、操作记录无法集中查看

Hermes Hub 通过在目标机器上部署轻量级 **Hub Agent**，将所有这些 Agent 统一接入一个 **Hub Server** 控制台，实现：

```text
Hermes Hub Server = 控制中心（Web UI + REST API + 数据库）
Hermes Hub Agent  = 节点代理（部署到目标机，执行本地管理操作）
Hermes Profile    = 被管理的 Agent 实例
```

---

## 功能特性

### 当前已实现（v0.4）

- **Agent Fleet 总览** — 统一表格展示所有节点上的 Agent，含 Setup / Gateway / API 状态
- **Node 管理** — Hub Agent 注册、心跳监控、在线状态跟踪
- **Profile 生命周期** — 创建 / 重命名 / 删除 Agent，全部走异步 Command Queue
- **Gateway 控制** — 启动 / 停止 / 重启单个或批量 Gateway
- **Setup / Doctor** — 通过 Web 触发 `hermes setup` 和 `hermes doctor`
- **Config 编辑** — 可视化 YAML 表单 + Raw 编辑双视图
- **SOUL.md 编辑** — 在线编辑 Agent 身份和行为描述
- **SQLite 持久化** — 重启不丢数据，WAL 模式保证读并发
- **暗色主题** — 适合长时间运维使用的暗色 UI

### 规划中（v0.5+）

- 日志中心与审计日志
- Env 密钥管理（仅状态，不返回明文）
- Docker / 远程节点接入
- 用户认证与 RBAC 权限
- Web Terminal 交互式 setup

---

## 项目截图

> TODO: 补充 Dashboard、Agent Fleet、Gateway Control 页面截图或 GIF 演示

---

## 环境要求

| 依赖 | 版本要求 | 说明 |
|------|---------|------|
| Node.js | >= 18 | Server 和 CLI 运行时 |
| pnpm | >= 9 | Monorepo 包管理 |
| Python | >= 3.10 | Hub Agent 运行环境（仅被管理节点需要） |
| Hermes CLI | 任意版本 | Hub Agent 通过 Hermes CLI 执行管理操作 |

操作系统支持：**macOS**、**Linux**、**Windows**（包括 WSL）

---

## 快速开始

### 1. 克隆项目

```bash
git clone <TODO: 仓库地址>
cd hermes-hub
```

### 2. 安装依赖 & 构建

```bash
pnpm install
pnpm build
```

构建顺序为 `protocol → core → web → server → cli`，全量构建约 5-10 秒。

### 3. 启动 Hub Server

```bash
node packages/cli/dist/cli.js
```

Server 默认监听 `http://localhost:3000`，自动打开浏览器。

### 4. 启动 Hub Agent（另一终端）

```bash
cd agents/hub-agent
python -m hermes_hub_agent.main --hub-url http://localhost:3000
```

Hub Agent 启动后会：
1. 注册到 Hub Server
2. 扫描本机 `~/.hermes` 下的 Profiles
3. 定时发送心跳并等待命令

### 5. 打开浏览器

访问 `http://localhost:3000`，在 **Agents** 页面查看被扫描到的 Agent 列表。

### 开发模式（前端热更新）

```bash
# 终端 1: 启动 API Server
node packages/cli/dist/cli.js --no-open

# 终端 2: 启动 Vite dev server（/api/* 自动代理到 :3000）
pnpm dev
```

---

## 配置说明

### Hub Server（CLI 参数）

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--port, -p` | 监听端口 | `3000` |
| `--api, -a` | Hermes 后端代理地址 | `HERMES_API_URL` 环境变量 |
| `--no-open` | 不自动打开浏览器 | `false` |

### Hub Agent（CLI 参数）

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--hub-url` | Hub Server 地址 | `http://localhost:3000` |
| `--node-id` | 节点标识符 | `local` |
| `--node-name` | 节点显示名称 | `local` |
| `--hermes-home` | HERMES_HOME 路径 | 自动检测（`~/.hermes` 或 `%LOCALAPPDATA%/hermes`） |
| `--interval` | 心跳间隔（秒） | `10` |
| `--once` | 单次执行后退出 | — |

环境变量覆盖：`HERMES_HUB_URL`、`HERMES_NODE_ID`、`HERMES_NODE_NAME`、`HERMES_HOME`、`HERMES_HUB_HEARTBEAT_INTERVAL`

### 持久化

Hub Server 使用 SQLite 存储所有数据，数据库文件默认位置：

```
~/.hermes-hub/hub.db    # WAL 模式，重启不丢
```

可通过 `dbPath` 配置项自定义路径（需修改 `startServer` 调用方）。

---

## 使用说明

### CLI 一键启动

```bash
npx hermes-hub                       # 默认 localhost:3000
npx hermes-hub --port 8080           # 指定端口
npx hermes-hub --no-open             # 不自动打开浏览器
```

### Web 主要操作

| 操作 | 页面 | 说明 |
|------|------|------|
| 查看 Agent 列表 | Agents | 表格展示所有 Agent 的状态、模型、路径 |
| 新建 Agent | Agents → New Agent | 填写名称和克隆方式，走异步 command 执行 |
| 重命名 Agent | Agents → Rename | 内联弹窗修改 |
| 删除 Agent | Agents → Delete | 二次确认 + 名称匹配 |
| 查看/编辑 Config | Agent 详情页 | 表单模式 + Raw YAML 双视图 |
| 编辑 SOUL.md | Agent 详情页 | 文本编辑器 |
| Gateway 控制 | Services | Start / Stop / Restart + 批量操作 |
| Setup / Doctor | 详情页（即将支持） | 触发 setup 或 doctor 命令 |
| 日志查看 | Logs | 全局日志聚合 |

### Hub Agent 手动管理

```bash
# 注册并持续运行
python -m hermes_hub_agent.main --hub-url http://your-hub:3000 --node-id server-a

# 单次心跳（测试用）
python -m hermes_hub_agent.main --once
```

---

## API 文档

### Hub Agent API（Hub Agent → Hub Server）

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/hub-agents/register` | 注册节点 |
| `POST` | `/api/hub-agents/:nodeId/heartbeat` | 心跳上报（含 profiles 摘要） |
| `GET` | `/api/hub-agents/:nodeId/commands/poll` | 轮询待执行命令 |
| `POST` | `/api/hub-agents/:nodeId/commands/:cmdId/started` | 标记命令开始执行 |
| `POST` | `/api/hub-agents/:nodeId/commands/:cmdId/result` | 提交命令执行结果 |

### Public API（Web UI → Hub Server）

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/health` | 健康检查 |
| `GET` | `/api/nodes` | 节点列表 |
| `GET` | `/api/agents` | Agent 列表 |
| `GET` | `/api/agents/:id` | Agent 详情 |
| `GET` `/POST` | `/api/commands` | 命令列表 / 创建命令 |
| `GET` | `/api/commands/:id` | 命令详情 |
| `GET` `/POST` | `/api/profiles` | Profile 列表 / 创建 Profile |
| `GET` `/DELETE` | `/api/profiles/:id` | Profile 详情 / 删除 |
| `PUT` | `/api/profiles/:id/rename` | 重命名 Profile |
| `POST` | `/api/profiles/:id/gateway/start` | 启动 Gateway |
| `POST` | `/api/profiles/:id/gateway/stop` | 停止 Gateway |
| `POST` | `/api/profiles/:id/gateway/restart` | 重启 Gateway |
| `POST` | `/api/profiles/:id/setup` | 运行 Setup |
| `POST` | `/api/profiles/:id/doctor` | 运行 Doctor |
| `GET` | `/api/logs` | 日志列表（占位） |
| `GET` | `/api/config` | 配置信息（占位） |

> 完整的请求/响应格式参考 `packages/protocol/src/index.ts` 中的类型定义。
> Swagger / OpenAPI 文档：TODO

---

## 项目结构

```
hermes-hub/
├── packages/
│   ├── protocol/             # @hermes-hub/protocol  — 共享 TypeScript 类型定义
│   │   └── src/index.ts      #   HubNode, ManagedAgent, HubCommand, CommandType 等
│   ├── core/                 # @hermes-hub/core      — 共享 API 客户端 + Web 类型
│   │   └── src/
│   │       ├── api.ts        #   HermesApiClient（listAgents, startGateway, waitForCommand 等）
│   │       └── types.ts      #   ProfileRow, LogEntry, BadgeTone 等
│   ├── web/                  # @hermes-hub/web       — Vue 3 SPA 前端
│   │   └── src/
│   │       ├── pages/        #   8 个页面（Dashboard, Profiles, Create, Detail, Logs, Services, Settings）
│   │       ├── components/   #   UI 组件（StatusBadge, LogConsole, GlassPanel 等）
│   │       ├── stores/       #   Pinia store（hub, theme）
│   │       ├── router/       #   Vue Router
│   │       └── data/         #   静态数据 & 导航配置
│   ├── server/               # @hermes-hub/server    — Controller-Agent HTTP Server
│   │   └── src/
│   │       ├── index.ts      #   路由处理 + 业务逻辑（hub-agent API + public API）
│   │       └── database.ts   #   SQLite 持久化（better-sqlite3, 5 张表）
│   └── cli/                  # hermes-hub            — CLI 入口（可发布到 npm）
│       └── src/cli.ts        #   解析参数 → 启动 server → 打开浏览器
├── agents/
│   └── hub-agent/            # Python Hub Agent（部署到被管理节点）
│       ├── pyproject.toml
│       └── hermes_hub_agent/
│           └── main.py       #   注册、心跳、轮询命令、执行 Hermes CLI
├── docs/
│   ├── hermes-hub-requirements.md       # 产品需求文档
│   ├── hermes-hub-technical-design.md   # 技术设计文档
│   ├── hermes-hub-execution-plan.md     # 分阶段执行计划
│   └── agent-profile-requirements.md    # Agent/Profile 管理需求
├── package.json              # pnpm workspace 根配置
├── pnpm-workspace.yaml
└── pnpm-lock.yaml
```

---

## 部署方式

### 本地开发部署

```bash
pnpm install && pnpm build
node packages/cli/dist/cli.js
```

### Hub Agent 部署

```bash
# 在被管理节点上
cd agents/hub-agent
python -m hermes_hub_agent.main \
  --hub-url http://<hub-server-ip>:3000 \
  --node-id my-server \
  --hermes-home ~/.hermes
```

### Docker 部署

> TODO: Docker Compose 模板将在 Phase 7 提供

---

## 测试说明

```bash
# 构建验证
pnpm run build

# Python 语法检查
python -c "import py_compile; py_compile.compile('agents/hub-agent/hermes_hub_agent/main.py', doraise=True)"

# 手动集成验证
# 终端 1：启动 Server
node packages/cli/dist/cli.js --no-open --port 3099

# 终端 2：验证 API
curl http://localhost:3099/api/health

# 终端 3：启动 Hub Agent
cd agents/hub-agent && python -m hermes_hub_agent.main --hub-url http://localhost:3099 --once

# 再次验证 nodes/agents 接口
curl http://localhost:3099/api/nodes
curl http://localhost:3099/api/agents
```

> 单元测试和集成测试框架：TODO

---

## 贡献指南

欢迎提交 Issue 和 Pull Request。

### 提交规范

1. **Fork** 本仓库
2. 创建特性分支：`git checkout -b feat/your-feature`
3. 提交代码：`git commit -m "feat: your feature description"`
4. 推送到分支：`git push origin feat/your-feature`
5. 发起 **Pull Request** 到 `main` 分支

### Commit Message 格式

遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

- `feat:` — 新功能
- `fix:` — Bug 修复
- `docs:` — 文档变更
- `refactor:` — 重构
- `test:` — 测试相关

### 代码规范

- TypeScript：通过 `tsc --noEmit` 检查，无 any 类型逃逸
- Python：标准 PEP 8 风格
- Vue：Composition API + `<script setup>` 语法

---

## Roadmap

详见 [`docs/hermes-hub-execution-plan.md`](docs/hermes-hub-execution-plan.md)

- [x] **Phase 1** — 架构骨架（Controller-Agent 闭环）
- [x] **Phase 2** — Command Queue + Profile 管理迁移
- [x] **Phase 3** — SQLite 持久化
- [x] **Phase 4** — Setup / Gateway 管理
- [ ] **Phase 5** — Logs Center 与 Audit Log
- [ ] **Phase 6** — Config / SOUL / Env 完整管理
- [ ] **Phase 7** — Hub Agent 安装与部署（pipx、systemd、Docker）
- [ ] **Phase 8** — 远程 / Docker / 多节点增强
- [ ] **Phase 9** — 安全与权限

---

## FAQ

### Hub Agent 找不到 hermes 命令怎么办？

设置 `HERMES_BIN` 环境变量指向 hermes 可执行文件路径：

```bash
# Linux/macOS
export HERMES_BIN=/usr/local/bin/hermes

# Windows
set HERMES_BIN=C:\tools\hermes.cmd
```

### Server 启动报端口被占用？

```
[hermes-hub] Port 3000 is already in use. Try: --port 3001
```

使用 `--port` 参数指定其他端口。

### 重启 Server 后数据还在吗？

是的。从 Phase 3 开始，所有数据持久化到 `~/.hermes-hub/hub.db`（SQLite WAL 模式），重启不会丢失。

### 可以管理远程机器上的 Agent 吗？

目前 Phase 4 阶段支持 `local` 节点的完整管理。远程节点和多节点管理计划在 Phase 8 实现。

### 如何在没有 Python 的机器上使用 Hub Agent？

Hub Agent 目前依赖 Python >= 3.10（作为 Hermes 生态的一部分）。计划在 Phase 7 提供独立的二进制发布版本。

---

## License

> TODO: 请选择并添加许可证文件。推荐 MIT、Apache-2.0 或 GPL-3.0。

---

## 联系方式

- **Issues**: [GitHub Issues](<TODO: 仓库 issues 地址>)
- **邮件**: TODO
- **交流群**: TODO

---

## 还需要补充的信息清单

为完善本 README，还需要你提供以下内容：

1. **GitHub 仓库地址** — 用于克隆命令和 Issues 链接
2. **License 选择** — MIT / Apache-2.0 / GPL-3.0 等，需添加 `LICENSE` 文件
3. **项目截图/GIF** — Dashboard、Agent 列表、Gateway 控制页面的截图
4. **联系方式** — 维护者邮箱、社区交流群或 Discord/Slack 链接
5. **NPM 发布状态** — `npx hermes-hub` 是否已发布到 npm registry
6. **API 文档链接** — 如果后续有 Swagger/OpenAPI 文档的部署地址
7. **Docker 镜像** — 是否已有 Docker Hub 或 GHCR 镜像地址（Phase 7 后补充）
