# Hermes Hub

**多 Agent / 多 Profile / 多节点统一管理平台** — 中心化的 Hermes Agent 控制台，采用 Controller-Agent 架构，通过 Web UI 管理本地和远程机器上的所有 Hermes Agent 实例。

---

## 项目简介

[Hermes Agent](https://hermes-agent.nousresearch.com/) 的多 Agent 能力通过 **Profile** 实现——每个 Profile 是一个独立的 Hermes home directory，包含自己的 `config.yaml`、`.env`、`SOUL.md`、sessions、skills、cron jobs 和 gateway state。

Hermes Hub 通过在目标机器上部署轻量级 **Hub Agent**，将所有 Agent 统一接入一个 **Hub Server** 控制台：

```text
Hub Server   = 控制中心（Web UI + REST API + SQLite）
Hub Agent    = 节点代理（部署到目标机，执行本地管理操作）
Hermes Profile = 被管理的 Agent 实例
```

---

## 功能特性

- **Agent Fleet 总览** — 统一表格展示所有节点上的 Agent，按节点过滤
- **Web 端节点管理** — 创建/重命名/删除节点，自动生成 vkey + copy-paste 命令，30s 无心跳自动离线
- **Profile 生命周期** — 创建/重命名/删除 Agent，全部走异步 Command Queue
- **Gateway 控制** — 启动/停止/重启单个或批量 Gateway
- **Setup / Doctor** — 通过 Web 触发 `hermes setup` 和 `hermes doctor`
- **Config 编辑** — 可视化表单 + Raw YAML 双视图，写入前自动备份至 `~/.hermes-hub/backups/`
- **SOUL.md / Env / Skills** — 在线编辑 Agent 身份、环境变量、技能列表
- **Logs Center** — 全局日志聚合 + Agent/Node/Command 多维度查询，审计日志自动记录
- **SQLite 持久化** — 8 张表，WAL 模式，重启不丢数据
- **安全与权限** — JWT 登录认证 + 三级 RBAC（admin/operator/viewer）+ 密钥脱敏
- **WebSocket 推送** — 命令状态变化实时推送到前端，替代轮询
- **暗色主题** — 适合长时间运维使用的暗色 UI

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

### 1. 安装依赖 & 构建

```bash
pnpm install
pnpm build
```

### 2. 启动 Hub Server

```bash
node packages/cli/dist/cli.js
```

Server 默认监听 `http://localhost:3000`，首次启动打印管理员凭据：`admin / admin`。

### 3. 创建节点（Web UI）

打开 `http://localhost:3000`，用 `admin / admin` 登录，进入 **Nodes** 页面，点击 **+ New Node**。创建后展开行复制命令：

```bash
hermes-hub-agent --hub-url=http://localhost:3000 --vkey=abc123def456...
```

### 4. 部署 Hub Agent

在目标机器上：

```bash
# 安装
cd agents/hub-agent
pip install .
# 或 uv build && scp dist/*.whl 到目标机 pip install

# 运行
hermes-hub-agent --hub-url=http://<server-ip>:3000 --vkey=<复制自 Web UI>
```

### 开发模式（前端热更新）

```bash
# 终端 1: API Server
node packages/cli/dist/cli.js --no-open

# 终端 2: Vite dev server
pnpm dev
```

---

## Hub Agent

### CLI 参数

```
hermes-hub-agent --hub-url=http://localhost:3000 --vkey=abc123
```

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--hub-url` | Hub Server 地址 | `http://localhost:3000` |
| `--vkey` | 节点验证密钥（Web UI 创建节点时生成） | — |

环境变量：`HERMES_HUB_URL`、`HERMES_HUB_VKEY`、`HERMES_HOME`、`HERMES_HUB_HEARTBEAT_INTERVAL`

### 子命令

```bash
hermes-hub-agent daemon              # 默认：心跳 + 命令轮询
hermes-hub-agent register            # 注册 + 打印返回的 node_id
hermes-hub-agent scan                # 扫描本地 Hermes profiles
hermes-hub-agent heartbeat-once      # 构建一次心跳 payload（调试）
```

默认命令为 `daemon`，无参数启动等同 `hermes-hub-agent daemon`。

### 分发

```bash
cd agents/hub-agent
uv build                           # → dist/hermes_hub_agent-0.7.0-py3-none-any.whl
scp dist/*.whl user@server:/tmp/
ssh user@server "pip install /tmp/hermes_hub_agent-*.whl"
```

---

## Web 页面

| 页面 | 路由 | 说明 |
|------|------|------|
| Dashboard | `/` | 概览统计 + 快速操作 |
| Agents | `/profiles` | Agent 列表、创建、重命名、删除、按节点过滤 |
| Agent 详情 | `/profiles/:id` | Config / SOUL / Skills / Env 编辑 |
| Nodes | `/nodes` | 节点列表、新建/重命名/删除、复制连接命令 |
| Node 详情 | `/nodes/:id` | 节点详细信息（只读） |
| Gateway | `/services` | 单/批量 Gateway 启停 |
| Logs | `/logs` | 全局日志 + 按 Agent 过滤 |
| Settings | `/settings` | 扫描路径 |
| Login | `/login` | 登录页 |

### 权限模型

| 角色 | 查看 | 创建/删除 Agent | Gateway 控制 | Config/SOUL/Env | 节点管理 | 用户管理 |
|------|------|-----------------|-------------|-----------------|---------|---------|
| Admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Operator | ✓ | ✓ | ✓ | ✓ | — | — |
| Viewer | ✓ | — | — | — | — | — |

---

## API 文档

### Hub Agent API（Agent → Server）

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/hub-agents/register` | 注册节点（vkey 识别，无需 node_id） |
| `POST` | `/api/hub-agents/:nodeId/heartbeat` | 心跳上报（含 profile 扫描结果） |
| `GET` | `/api/hub-agents/:nodeId/commands/poll` | 轮询待执行命令 |
| `POST` | `/api/hub-agents/:nodeId/commands/:cmdId/started` | 标记命令开始 |
| `POST` | `/api/hub-agents/:nodeId/commands/:cmdId/result` | 提交执行结果 |

### Public API（Web UI → Server，需 JWT）

| 方法 | 路径 | 说明 | 最低角色 |
|------|------|------|---------|
| `GET` | `/api/health` | 健康检查 | 公开 |
| `POST` | `/api/auth/login` | 登录 | 公开 |
| `GET` | `/api/auth/status` | 会话状态 | 公开 |
| `POST` | `/api/nodes` | 创建节点 | admin |
| `GET` | `/api/nodes` | 节点列表 | viewer |
| `GET` | `/api/nodes/:id` | 节点详情 | viewer |
| `GET` | `/api/nodes/:id/vkey` | 节点 vkey + 命令 | admin |
| `PUT` | `/api/nodes/:id` | 更新节点 | admin |
| `DELETE` | `/api/nodes/:id` | 删除节点 | admin |
| `GET` | `/api/agents` | Agent 列表 | viewer |
| `GET` | `/api/agents/:id` | Agent 详情 | viewer |
| `GET/POST` | `/api/commands` | 命令列表/创建 | viewer/operator |
| `GET` | `/api/commands/:id` | 命令详情 | viewer |
| `GET/POST` | `/api/profiles` | Profile 列表/创建 | viewer/operator |
| `DELETE` | `/api/profiles/:id` | 删除 Profile | operator |
| `PUT` | `/api/profiles/:id/rename` | 重命名 | operator |
| `POST` | `/api/profiles/:id/gateway/start\|stop\|restart` | Gateway 控制 | operator |
| `POST` | `/api/profiles/:id/setup` | 运行 Setup | operator |
| `POST` | `/api/profiles/:id/doctor` | 运行 Doctor | operator |
| `POST` | `/api/profiles/:id/config/read` | 读取 Config | viewer |
| `POST` | `/api/profiles/:id/config.yaml` | 写入 Config | operator |
| `POST` | `/api/profiles/:id/soul/read` | 读取 SOUL | viewer |
| `POST` | `/api/profiles/:id/SOUL.md` | 写入 SOUL | operator |
| `POST` | `/api/profiles/:id/skills/read` | 技能列表 | viewer |
| `POST` | `/api/profiles/:id/env/read` | Env 状态 | viewer |
| `POST` | `/api/profiles/:id/env` | 设置 Env | operator |
| `POST` | `/api/profiles/:id/env/delete` | 删除 Env | operator |
| `GET` | `/api/logs` | 全局日志 | viewer |
| `GET` | `/api/profiles/:id/logs` | Agent 日志 | viewer |
| `GET` | `/api/nodes/:id/logs` | Node 日志 | viewer |
| `GET` | `/api/commands/:id/logs` | 命令日志 | viewer |
| `GET` | `/api/config` | Hub 配置 | viewer |

WebSocket：连接 `ws://host/ws`，推送 `{ event: "command.updated", command: {...} }`。

---

## 项目结构

```
hermes-hub/
├── packages/
│   ├── protocol/             # 共享 TypeScript 类型定义
│   ├── core/                 # API 客户端（HermesApiClient）+ Web 类型
│   ├── web/                  # Vue 3 SPA 前端（11 个页面）
│   ├── server/               # HTTP Server + SQLite + WebSocket
│   │   └── src/
│   │       ├── index.ts      #   路由 + JWT 鉴权 + RBAC
│   │       ├── database.ts   #   SQLite 持久化（8 张表）
│   │       └── websocket.ts  #   WebSocket 推送（零依赖）
│   └── cli/                  # CLI 入口（npx hermes-hub）
├── agents/
│   └── hub-agent/            # Python Hub Agent
│       ├── pyproject.toml
│       ├── Dockerfile
│       └── hermes_hub_agent/
│           ├── main.py         #   CLI 入口（scan/heartbeat-once/register/daemon）
│           ├── hub_client.py   #   HTTP 客户端
│           ├── command_runner.py # 命令轮询 + 执行
│           ├── heartbeat.py    #   注册 + 心跳
│           ├── scanner.py      #   Profile 发现与摘要
│           ├── profile_inspector.py # Profile 元数据检查
│           └── hermes_imports.py # Hermes 路径检测
├── docker-compose.yml
├── Dockerfile.server
└── docs/
```

---

## 部署方式

### 本地开发

```bash
pnpm install && pnpm build
node packages/cli/dist/cli.js
```

### Hub Agent

```bash
cd agents/hub-agent && uv build
# 分发 dist/*.whl 到目标机
pip install hermes_hub_agent-*.whl
hermes-hub-agent --hub-url=http://<hub>:3000 --vkey=<vkey>
```

### Docker Compose

```bash
docker compose up -d
```

---

## 测试

```bash
pnpm run build

# API 测试
curl http://localhost:3000/api/health
curl -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin"}'

# 创建节点 + 注册
curl -X POST http://localhost:3000/api/nodes \
  -H 'Authorization: Bearer <token>' \
  -d '{"name":"test"}'
# → 复制返回的 command，在目标机运行
```

---

## Roadmap

- [x] **Phase 1** — 架构骨架
- [x] **Phase 2** — Command Queue
- [x] **Phase 3** — SQLite 持久化
- [x] **Phase 4** — Gateway 管理
- [x] **Phase 5** — Logs / Audit
- [x] **Phase 6** — Config / SOUL / Env
- [x] **Phase 7** — 安装与部署
- [x] **Phase 8** — 多节点增强
- [x] **Phase 9** — 安全与权限

详见 [`docs/hermes-hub-execution-plan.md`](docs/hermes-hub-execution-plan.md)

---

## FAQ

### 首次登录

Server 首次启动自动创建 `admin / admin`。请立即修改密码。

### Hub Agent 找不到 hermes 命令

```bash
export HERMES_BIN=/usr/local/bin/hermes
```

### Server 端口被占用

```bash
node packages/cli/dist/cli.js --port 3001
```

### 数据持久化

所有数据在 `~/.hermes-hub/hub.db`（SQLite WAL），重启不丢。

### 远程节点管理

Web UI 创建节点 → 复制命令 → 目标机运行 `hermes-hub-agent --hub-url=... --vkey=...`。

---

## License

> TODO
