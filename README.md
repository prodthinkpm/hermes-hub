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

## 功能特性（v0.9）

- **Agent Fleet 总览** — 统一表格展示所有节点上的 Agent，按节点过滤
- **Node 管理** — 注册 Token、心跳监控、Enable/Disable/Delete、专属节点页面
- **Profile 生命周期** — 创建/重命名/删除 Agent，全部走异步 Command Queue
- **Gateway 控制** — 启动/停止/重启单个或批量 Gateway
- **Setup / Doctor** — 通过 Web 触发 `hermes setup` 和 `hermes doctor`
- **Config 编辑** — 可视化表单 + Raw YAML 双视图，写入前自动备份
- **SOUL.md / Env / Skills** — 在线编辑 Agent 身份、环境变量、技能列表
- **Logs Center** — 全局日志聚合 + Agent/Node/Command 多维度查询，审计日志自动记录
- **SQLite 持久化** — 8 张表，WAL 模式，重启不丢数据
- **安全与权限** — JWT 登录认证 + 三级 RBAC（admin/operator/viewer）+ 密钥脱敏
- **安装与部署** — `init`/`service` 子命令、systemd/launchd/schtasks、Docker Compose
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

### 3. 启动 Hub Server

```bash
node packages/cli/dist/cli.js
```

Server 默认监听 `http://localhost:3000`。

首次启动会打印默认管理员凭据：`admin / admin`（请立即修改密码）。

### 4. 启动 Hub Agent（另一终端）

```bash
cd agents/hub-agent
python -m hermes_hub_agent.main --hub-url http://localhost:3000
```

### 5. 打开浏览器

访问 `http://localhost:3000`，使用 `admin / admin` 登录。

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
| `--no-open` | 不自动打开浏览器 | `false` |

### Hub Agent

#### 运行模式

```bash
# 直接运行
python -m hermes_hub_agent.main --hub-url http://localhost:3000

# 使用配置文件
python -m hermes_hub_agent.main --config ~/.config/hermes-hub-agent/config.yaml

# 单次心跳（用于定时任务/Windows Scheduled Task）
python -m hermes_hub_agent.main --once
```

#### CLI 参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--hub-url` | Hub Server 地址 | `http://localhost:3000` |
| `--node-id` | 节点标识符 | `local` |
| `--node-name` | 节点显示名称 | `My Node` |
| `--hermes-home` | HERMES_HOME 路径 | 自动检测 |
| `--interval` | 心跳间隔（秒） | `10` |
| `--token` | 注册 Token | — |
| `--config` | 配置文件路径 | 平台标准路径 |
| `--once` | 单次执行后退出 | — |

环境变量：`HERMES_HUB_URL`、`HERMES_NODE_ID`、`HERMES_NODE_NAME`、`HERMES_HOME`、`HERMES_HUB_HEARTBEAT_INTERVAL`、`HERMES_HUB_TOKEN`

#### 初始化

```bash
# 生成配置文件
python -m hermes_hub_agent.main init --node-id my-node --token <registration-token>

# 安装为系统服务
python -m hermes_hub_agent.main service install
python -m hermes_hub_agent.main service start
python -m hermes_hub_agent.main service status
```

配置文件位置（按平台）：

| 平台 | 路径 |
|------|------|
| Linux | `~/.config/hermes-hub-agent/config.yaml` |
| macOS | `~/Library/Application Support/hermes-hub-agent/config.yaml` |
| Windows | `%LOCALAPPDATA%\hermes-hub-agent\config.yaml` |

### 持久化

Hub Server 使用 SQLite 存储所有数据：

```
~/.hermes-hub/hub.db    # WAL 模式，重启不丢
```

---

## 使用说明

### Web 页面

| 页面 | 路由 | 说明 |
|------|------|------|
| Dashboard | `/` | 概览统计 + 快速操作 |
| Agents | `/profiles` | Agent 列表、创建、重命名、删除、按节点过滤 |
| Agent 详情 | `/profiles/:id` | Config / SOUL / Skills / Env 编辑 |
| Nodes | `/nodes` | 节点列表、状态监控 |
| Node 详情 | `/nodes/:id` | 节点信息、启用/禁用/删除 |
| Gateway | `/services` | 单/批量 Gateway 启停 |
| Logs | `/logs` | 全局日志 + 按 Agent 过滤 |
| Settings | `/settings` | 扫描路径 + 注册 Token |
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
| `POST` | `/api/hub-agents/register` | 注册节点（需 token） |
| `POST` | `/api/hub-agents/:nodeId/heartbeat` | 心跳上报 |
| `GET` | `/api/hub-agents/:nodeId/commands/poll` | 轮询待执行命令 |
| `POST` | `/api/hub-agents/:nodeId/commands/:cmdId/started` | 标记命令开始 |
| `POST` | `/api/hub-agents/:nodeId/commands/:cmdId/result` | 提交执行结果 |

### Public API（Web UI → Server，需 JWT）

| 方法 | 路径 | 说明 | 最低角色 |
|------|------|------|---------|
| `GET` | `/api/health` | 健康检查 | —（公开） |
| `POST` | `/api/auth/login` | 登录 | —（公开） |
| `GET` | `/api/auth/status` | 会话状态 | —（公开） |
| `POST` | `/api/auth/change-password` | 修改密码 | viewer |
| `GET` | `/api/nodes` | 节点列表 | viewer |
| `GET` | `/api/nodes/:id` | 节点详情 | viewer |
| `PUT` | `/api/nodes/:id` | 更新节点 | admin |
| `DELETE` | `/api/nodes/:id` | 删除节点 | admin |
| `GET` | `/api/agents` | Agent 列表 | viewer |
| `GET` | `/api/agents/:id` | Agent 详情 | viewer |
| `GET` `/POST` | `/api/commands` | 命令列表/创建 | viewer / operator |
| `GET` | `/api/commands/:id` | 命令详情 | viewer |
| `GET` `/POST` | `/api/profiles` | Profile 列表/创建 | viewer / operator |
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
| `GET` | `/api/settings/registration-token` | 注册 Token | admin |
| `GET` | `/api/config` | Hub 配置 | viewer |

---

## 项目结构

```
hermes-hub/
├── packages/
│   ├── protocol/             # @hermes-hub/protocol  — 共享 TypeScript 类型定义
│   │   └── src/index.ts      #   HubNode, ManagedAgent, HubCommand, HubUser 等
│   ├── core/                 # @hermes-hub/core      — 共享 API 客户端 + Web 类型
│   │   └── src/
│   │       ├── api.ts        #   HermesApiClient（含 JWT auth 注入）
│   │       └── types.ts      #   ProfileRow, LogEntry, BadgeTone 等
│   ├── web/                  # @hermes-hub/web       — Vue 3 SPA 前端
│   │   └── src/
│   │       ├── pages/        #   11 个页面（Dashboard, Profiles, Nodes, Login, ...）
│   │       ├── components/   #   UI 组件（StatusBadge, LogConsole, GlassPanel 等）
│   │       ├── stores/       #   Pinia store（hub, auth, theme）
│   │       ├── router/       #   Vue Router（含 beforeEach 鉴权守卫）
│   │       └── data/         #   导航配置
│   ├── server/               # @hermes-hub/server    — Controller-Agent HTTP Server
│   │   └── src/
│   │       ├── index.ts      #   路由 + JWT 鉴权 + RBAC
│   │       └── database.ts   #   SQLite 持久化（8 张表，含 users）
│   └── cli/                  # hermes-hub            — CLI 入口
│       └── src/cli.ts        #   解析参数 → 启动 server
├── agents/
│   └── hub-agent/            # Python Hub Agent
│       ├── pyproject.toml
│       ├── Dockerfile
│       └── hermes_hub_agent/
│           ├── main.py       #   注册、心跳、轮询命令、init/service 子命令
│           ├── config.py     #   配置文件生成与加载
│           └── service.py    #   systemd/launchd/schtasks 服务管理
├── docker-compose.yml        # hub-server + hub-agent 编排
├── Dockerfile.server         # Hub Server Docker 镜像
└── docs/                     # 需求、设计、执行计划文档
```

---

## 部署方式

### 本地开发

```bash
pnpm install && pnpm build
node packages/cli/dist/cli.js
```

### Hub Agent 部署

```bash
cd agents/hub-agent
pip install -e .
hermes-hub-agent init --node-id my-server --token <token>
hermes-hub-agent service install
hermes-hub-agent service start
```

### Docker Compose

```bash
docker compose up -d
```

包含 `hub-server`（端口 3000）+ `hub-agent` 两个服务，数据卷持久化。

---

## 测试

```bash
# 构建验证
pnpm run build

# Python 语法检查
python -m hermes_hub_agent.main --help

# 手工集成验证
# 终端 1：启动 Server
node packages/cli/dist/cli.js --port 3099

# 终端 2：API 测试
curl http://localhost:3099/api/health
curl -X POST http://localhost:3099/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin"}'

# 终端 3：启动 Hub Agent
cd agents/hub-agent && python -m hermes_hub_agent.main --hub-url http://localhost:3099 --once
```

---

## Roadmap

- [x] **Phase 1** — 架构骨架（Controller-Agent 闭环）
- [x] **Phase 2** — Command Queue + Profile 管理迁移
- [x] **Phase 3** — SQLite 持久化
- [x] **Phase 4** — Setup / Gateway 管理
- [x] **Phase 5** — Logs Center 与 Audit Log
- [x] **Phase 6** — Config / SOUL / Env 完整管理
- [x] **Phase 7** — 安装与部署（init、service、Docker）
- [x] **Phase 8** — 远程 / Docker / 多节点增强
- [x] **Phase 9** — 安全与权限（JWT + RBAC）

详见 [`docs/hermes-hub-execution-plan.md`](docs/hermes-hub-execution-plan.md)

---

## FAQ

### 首次登录用什么账号？

Server 首次启动时自动创建 `admin / admin`。请登录后立即修改密码。

### Hub Agent 找不到 hermes 命令怎么办？

设置 `HERMES_BIN` 环境变量指向 hermes 可执行文件路径：

```bash
export HERMES_BIN=/usr/local/bin/hermes    # Linux/macOS
set HERMES_BIN=C:\tools\hermes.cmd         # Windows
```

### Server 启动报端口被占用？

使用 `--port` 参数指定其他端口：`node packages/cli/dist/cli.js --port 3001`

### 重启 Server 后数据还在吗？

是的。所有数据持久化到 `~/.hermes-hub/hub.db`（SQLite WAL 模式），重启不会丢失。

### 如何管理远程机器上的 Agent？

在远程机器上部署 Hub Agent，指向 Hub Server 地址即可：

```bash
python -m hermes_hub_agent.main --hub-url http://<hub-server-ip>:3000 --node-id remote-server
```

多节点管理通过 Nodes 页面统一查看和控制。

---

## License

> TODO

---

## 联系方式

- **Issues**: [GitHub Issues](<TODO: 仓库 issues 地址>)
- **邮件**: TODO
