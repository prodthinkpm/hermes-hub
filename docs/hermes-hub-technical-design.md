# Hermes Hub 技术方案

版本：v0.1  
日期：2026-05-18  
架构模式：Controller-Agent  
核心目标：多 Agent / 多 Profile / 多节点统一管理

---

## 1. 技术结论

Hermes Hub 不从零实现 Agent Runtime，也不替代 Hermes Agent。

Hermes Hub 采用 Controller-Agent 架构：

```text
Hermes Hub Server
  负责控制面、WebUI、注册中心、命令队列、日志和审计

Hermes Hub Agent
  部署到目标机器 / Docker 容器，负责本地 Hermes Profiles 管理

Hermes Agent
  原生运行时，Profile / Gateway / Setup / Sessions / Skills 仍由 Hermes 自己管理
```

关键原则：

```text
Hub Server 不直接 SSH 到机器执行命令。
Hub Agent 主动连接 Hub Server，拉取任务并回传结果。
```

---

## 2. 设计依据

Hermes Agent 的 Profile 是一个独立 Hermes home directory。每个 Profile 有自己的：

- `config.yaml`
- `.env`
- `SOUL.md`
- sessions
- memory
- skills
- cron jobs
- gateway state

命名 Profile 通过 `HERMES_HOME` 进行状态隔离。

Docker 场景中，Hermes 容器把用户数据、配置、API keys、sessions、skills、memories 挂载到 `/opt/data`。

Hermes Hooks / Plugin Hooks 可以用于事件观测，但不适合作为核心常驻管理服务，因此 Hermes Hub Agent 必须是独立 daemon。

---

## 3. 总体架构

```text
┌────────────────────────────────────────────────────────────┐
│                    Hermes Hub Server                       │
│                                                            │
│  ┌──────────────┐   ┌─────────────┐   ┌─────────────────┐ │
│  │    WebUI     │   │  REST API   │   │  WebSocket/SSE  │ │
│  └──────┬───────┘   └──────┬──────┘   └────────┬────────┘ │
│         │                  │                   │          │
│  ┌──────▼──────────────────▼───────────────────▼───────┐  │
│  │                 Application Services                 │  │
│  │                                                       │  │
│  │  Node Registry      Agent Registry     Command Queue  │  │
│  │  Heartbeat Monitor  Log Center         Audit Service  │  │
│  │  Setup Center       Gateway Manager    Event Center   │  │
│  └──────┬───────────────────────────────────────────────┘  │
│         │                                                   │
│  ┌──────▼───────────────────────────────────────────────┐  │
│  │                 Database / Storage                   │  │
│  │  nodes, agents, commands, logs, events, audits        │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────────────▲─────────────────────────────────────┘
                       │
                       │ HTTPS / WebSocket / Long Poll
                       │
┌──────────────────────┴─────────────────────────────────────┐
│                    Hermes Hub Agent                        │
│                                                            │
│  Register / Heartbeat / Poll Commands / Execute / Report   │
│                                                            │
│  ┌──────────────┐ ┌─────────────┐ ┌─────────────────────┐ │
│  │ProfileScanner│ │CommandRunner│ │GatewayController    │ │
│  └──────────────┘ └─────────────┘ └─────────────────────┘ │
│  ┌──────────────┐ ┌─────────────┐ ┌─────────────────────┐ │
│  │ConfigManager │ │SecretManager│ │LogTailer            │ │
│  └──────────────┘ └─────────────┘ └─────────────────────┘ │
│                                                            │
│  HERMES_HOME=~/.hermes 或 /opt/data                        │
└────────────────────────────────────────────────────────────┘
```

---

## 4. 项目拆分

建议 monorepo：

```text
hermes-hub/
  apps/
    hub-server/
      src/
      package.json

    hub-web/
      src/
      package.json

  agents/
    hub-agent/
      pyproject.toml
      hermes_hub_agent/
        main.py
        config.py
        register.py
        heartbeat.py
        scanner.py
        command_runner.py
        gateway.py
        profile.py
        logs.py
        secrets.py
        terminal.py
        audit.py

  packages/
    protocol/
      schemas/
        node-register.schema.json
        heartbeat.schema.json
        command.schema.json
        command-result.schema.json

  docs/
    requirements.md
    technical-design.md
```

也可以简化成两个仓库：

```text
hermes-hub-server
hermes-hub-agent
```

推荐早期 monorepo，便于协议同步。

---

## 5. 技术选型

## 5.1 Hub Server

推荐：

```text
后端：Node.js / NestJS 或 Python FastAPI
数据库：PostgreSQL，开发期可用 SQLite
实时：WebSocket 或 SSE
任务队列：数据库轮询 + 状态机，后续可接 Redis
认证：JWT / Session
部署：Docker Compose
```

如果团队偏前端工程化，推荐：

```text
NestJS + Prisma + PostgreSQL
```

如果团队偏 Python，推荐：

```text
FastAPI + SQLAlchemy + PostgreSQL
```

## 5.2 Hub Web

推荐：

```text
Vue 3 / React
TypeScript
Tailwind / Naive UI / Ant Design
Monaco Editor
xterm.js
```

核心组件：

- Agent Fleet Table
- Node Table
- Command Center
- Logs Viewer
- Config Editor
- SOUL.md Editor
- Setup Wizard
- Gateway Control Panel

## 5.3 Hub Agent

推荐 Python。

原因：

- Hermes Agent 是 Python 生态
- 读写 YAML / env / logs 简单
- 执行 Hermes CLI 简单
- 容器内集成成本低
- 后续可作为 Hermes Plugin / Hook 共享部分代码

依赖：

```text
httpx
pydantic
PyYAML
python-dotenv
psutil
typer
rich
websockets 或 sseclient
```

---

## 6. Hub Server 模块设计

## 6.1 Node Registry

负责管理 Hub Agent 节点。

数据：

```ts
type Node = {
  id: string;
  name: string;
  hostname: string;
  os: string;
  arch: string;
  agentVersion: string;
  hermesVersion?: string;
  hermesHome: string;
  status: "online" | "offline" | "unhealthy" | "disabled";
  lastHeartbeatAt?: string;
  capabilities: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
};
```

接口：

```http
GET    /api/nodes
POST   /api/nodes/register-token
GET    /api/nodes/:nodeId
PATCH  /api/nodes/:nodeId
DELETE /api/nodes/:nodeId
POST   /api/nodes/:nodeId/disable
POST   /api/nodes/:nodeId/enable
```

## 6.2 Agent Registry

管理所有 Managed Agents。

数据：

```ts
type ManagedAgent = {
  id: string;               // nodeId:profileName
  nodeId: string;
  profileName: string;
  displayName?: string;
  description?: string;
  profileHome: string;

  provider?: string;
  model?: string;
  terminalCwd?: string;

  setupStatus: "unknown" | "ready" | "needs_setup" | "failed";
  gatewayStatus: "unknown" | "running" | "stopped" | "failed";
  apiServerStatus: "unknown" | "enabled" | "disabled" | "failed";

  sessionsCount?: number;
  skillsCount?: number;
  cronCount?: number;

  hasEnv: boolean;
  hasSoul: boolean;

  lastSeenAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
};
```

接口：

```http
GET    /api/agents
GET    /api/agents/:agentId
POST   /api/agents
PATCH  /api/agents/:agentId
DELETE /api/agents/:agentId
POST   /api/agents/:agentId/rescan
```

## 6.3 Command Queue

Hub Server 不直接执行远程操作，只创建 command。

数据：

```ts
type Command = {
  id: string;
  nodeId: string;
  agentId?: string;
  type: string;
  payload: Record<string, unknown>;
  status: "pending" | "dispatched" | "running" | "success" | "failed" | "timeout" | "cancelled";
  stdout?: string;
  stderr?: string;
  error?: string;
  createdBy: string;
  createdAt: string;
  dispatchedAt?: string;
  startedAt?: string;
  finishedAt?: string;
};
```

接口：

```http
GET  /api/commands
GET  /api/commands/:commandId
POST /api/commands/:commandId/retry
POST /api/commands/:commandId/cancel
```

Hub Agent 侧接口：

```http
GET  /api/hub-agents/:nodeId/commands/poll
POST /api/hub-agents/:nodeId/commands/:commandId/started
POST /api/hub-agents/:nodeId/commands/:commandId/result
```

## 6.4 Heartbeat Monitor

职责：

- 接收心跳
- 更新 node 状态
- 更新 agent 摘要
- 检测超时
- 触发 offline
- 记录异常

接口：

```http
POST /api/hub-agents/register
POST /api/hub-agents/:nodeId/heartbeat
```

## 6.5 Logs Center

日志来源：

- Hub Server
- Hub Agent
- Command
- Profile logs
- Gateway logs
- setup logs

接口：

```http
GET /api/logs
GET /api/logs/stream
GET /api/agents/:agentId/logs
GET /api/nodes/:nodeId/logs
```

---

## 7. Hub Agent 模块设计

## 7.1 Agent 配置

配置文件：

```yaml
# /etc/hermes-hub-agent/config.yaml
hub:
  url: https://hub.example.com
  token: hhub_xxxxx

node:
  name: server-a
  tags:
    - prod
    - linux

hermes:
  home: ~/.hermes
  binary: hermes

runtime:
  poll_interval_seconds: 3
  heartbeat_interval_seconds: 10
  command_timeout_seconds: 300
  log_max_bytes: 200000

security:
  allow_web_terminal: false
  allow_env_write: true
  allow_config_write: true
  allow_soul_write: true
```

环境变量覆盖：

```bash
HERMES_HUB_URL
HERMES_HUB_TOKEN
HERMES_HOME
HERMES_BINARY
```

## 7.2 注册流程

启动时：

```text
1. 读取配置
2. 检查 hermes binary
3. 获取 hermes version
4. 扫描 profiles
5. POST /api/hub-agents/register
6. 启动 heartbeat loop
7. 启动 command polling loop
```

注册 payload：

```json
{
  "node_id": "server-a",
  "hostname": "ubuntu-agent-01",
  "agent_version": "0.1.0",
  "hermes_version": "0.x",
  "hermes_home": "/home/ubuntu/.hermes",
  "runtime": {
    "os": "linux",
    "arch": "x86_64",
    "docker": false
  },
  "capabilities": {
    "profiles": true,
    "setup": true,
    "gateway": true,
    "logs": true,
    "sessions": true,
    "skills": true,
    "cron": true,
    "soul": true,
    "config": true
  }
}
```

## 7.3 Profile Scanner

扫描规则：

```text
默认 Profile:
HERMES_HOME

命名 Profiles:
HERMES_HOME/profiles/*
```

Docker 模式：

```text
HERMES_HOME=/opt/data
```

识别一个 profile：

- 目录存在
- 包含 `config.yaml` 或 `.env` 或 `SOUL.md`
- 或包含 sessions / skills / logs 等 Hermes 目录

读取摘要：

- config.yaml
- .env key 状态
- SOUL.md 是否存在
- sessions 数量
- skills 数量
- cron 数量
- gateway pid / state

输出：

```json
{
  "profile_name": "coder",
  "profile_home": "/home/ubuntu/.hermes/profiles/coder",
  "provider": "openrouter",
  "model": "anthropic/claude-sonnet-4.6",
  "terminal_cwd": "/home/ubuntu/projects/app",
  "has_env": true,
  "env_status": {
    "OPENROUTER_API_KEY": "set",
    "OPENAI_API_KEY": "missing"
  },
  "has_soul": true,
  "sessions_count": 128,
  "skills_count": 32,
  "cron_count": 4,
  "gateway_status": "running"
}
```

## 7.4 Command Runner

命令执行原则：

```text
只执行白名单 command type
不接受任意 shell
每个 command 有 timeout
stdout / stderr 限制长度
敏感信息脱敏
执行结果回传 Hub
```

白名单：

```text
profile.scan
profile.create
profile.rename
profile.delete
profile.setup
profile.doctor

config.read
config.patch

env.status
env.set
env.delete

soul.read
soul.update

gateway.status
gateway.start
gateway.stop
gateway.restart

sessions.list
skills.list
cron.list
logs.tail
```

## 7.5 Hermes 命令执行方式

对于命名 Profile，不依赖 alias，统一设置 `HERMES_HOME`：

```bash
HERMES_HOME=/home/ubuntu/.hermes/profiles/coder hermes doctor
HERMES_HOME=/home/ubuntu/.hermes/profiles/coder hermes setup
HERMES_HOME=/home/ubuntu/.hermes/profiles/coder hermes gateway start
```

默认 Profile：

```bash
HERMES_HOME=/home/ubuntu/.hermes hermes doctor
```

创建 Profile 可以在 root HERMES_HOME 下执行：

```bash
HERMES_HOME=/home/ubuntu/.hermes hermes profile create coder
```

## 7.6 Setup Runner

支持：

```text
完整 setup
quick setup
non-interactive setup
section setup
```

命令映射：

```bash
hermes setup
hermes setup --quick
hermes setup --non-interactive
hermes setup model
hermes setup terminal
hermes setup gateway
hermes setup tools
hermes setup agent
```

## 7.7 Gateway Controller

支持：

```text
status
start
stop
restart
health check
```

执行：

```bash
HERMES_HOME=<profile_home> hermes gateway status
HERMES_HOME=<profile_home> hermes gateway start
HERMES_HOME=<profile_home> hermes gateway stop
```

如果 Docker 镜像以 `gateway run` 作为主进程，则容器级 Gateway 管理由容器管理逻辑处理。

第一阶段如果 Hub Agent 和 Hermes Gateway 同容器，建议 Hub Agent 不直接 stop 自己所在容器。

## 7.8 File Managers

### Config Manager

读写：

```text
config.yaml
```

保存前：

- YAML 解析校验
- 字段校验
- 备份旧文件
- 写入审计摘要

### Env Manager

`.env` 不明文返回。

只返回：

```json
{
  "OPENAI_API_KEY": "set",
  "OPENROUTER_API_KEY": "missing"
}
```

写入支持：

- set key
- delete key
- mask log

### Soul Manager

读写：

```text
SOUL.md
```

支持：

- 读取
- 更新
- 保存版本
- 回滚

---

## 8. API 协议设计

## 8.1 Hub Agent 注册

```http
POST /api/hub-agents/register
Authorization: Bearer <token>
```

Request：

```json
{
  "node_id": "server-a",
  "name": "生产服务器 A",
  "hostname": "ubuntu-agent-01",
  "agent_version": "0.1.0",
  "hermes_version": "0.x",
  "hermes_home": "/home/ubuntu/.hermes",
  "capabilities": {
    "profiles": true,
    "setup": true,
    "gateway": true,
    "logs": true
  }
}
```

Response：

```json
{
  "ok": true,
  "node_id": "server-a",
  "server_time": "2026-05-18T10:00:00+08:00",
  "poll_interval_seconds": 3,
  "heartbeat_interval_seconds": 10
}
```

## 8.2 Heartbeat

```http
POST /api/hub-agents/:nodeId/heartbeat
```

Request：

```json
{
  "status": "online",
  "metrics": {
    "cpu_percent": 18.3,
    "memory_percent": 42.1,
    "disk_free_gb": 120.5
  },
  "summary": {
    "profiles_total": 10,
    "gateway_running": 6
  },
  "profiles": [
    {
      "profile_name": "coder",
      "profile_home": "/home/ubuntu/.hermes/profiles/coder",
      "provider": "openrouter",
      "model": "anthropic/claude-sonnet-4.6",
      "gateway_status": "running",
      "has_env": true,
      "has_soul": true
    }
  ]
}
```

## 8.3 Poll Commands

```http
GET /api/hub-agents/:nodeId/commands/poll
```

Response：

```json
{
  "commands": [
    {
      "id": "cmd_001",
      "type": "profile.create",
      "agent_id": null,
      "payload": {
        "profile_name": "coder",
        "description": "代码开发 Agent",
        "mode": "clone_config",
        "clone_from": "default"
      }
    }
  ]
}
```

## 8.4 Command Result

```http
POST /api/hub-agents/:nodeId/commands/:commandId/result
```

Request：

```json
{
  "status": "success",
  "stdout": "Profile coder created",
  "stderr": "",
  "result": {
    "profile_name": "coder"
  },
  "started_at": "2026-05-18T10:00:00+08:00",
  "finished_at": "2026-05-18T10:00:03+08:00"
}
```

---

## 9. Command Type 详细设计

## 9.1 profile.create

Payload：

```json
{
  "profile_name": "coder",
  "description": "代码开发 Agent",
  "mode": "blank | clone_config | clone_all",
  "clone_from": "default",
  "terminal_cwd": "/home/ubuntu/projects/app"
}
```

执行：

```bash
hermes profile create coder
hermes profile create coder --clone
hermes profile create coder --clone-all
hermes profile create coder --clone --clone-from default
```

如果有 `terminal_cwd`：

```bash
HERMES_HOME=<profile_home> hermes config set terminal.cwd /home/ubuntu/projects/app
```

## 9.2 profile.setup

Payload：

```json
{
  "profile_name": "coder",
  "section": "model | terminal | gateway | tools | agent | all",
  "mode": "interactive | quick | non_interactive"
}
```

执行：

```bash
HERMES_HOME=<profile_home> hermes setup
HERMES_HOME=<profile_home> hermes setup model
HERMES_HOME=<profile_home> hermes setup --quick
```

## 9.3 gateway.start

Payload：

```json
{
  "profile_name": "coder"
}
```

执行：

```bash
HERMES_HOME=<profile_home> hermes gateway start
```

## 9.4 soul.update

Payload：

```json
{
  "profile_name": "coder",
  "content": "# Coder Agent Soul\n..."
}
```

执行：

```text
写入 <profile_home>/SOUL.md
保存旧文件备份
回传 diff 摘要
```

## 9.5 env.set

Payload：

```json
{
  "profile_name": "coder",
  "key": "OPENROUTER_API_KEY",
  "value": "sk-xxxx"
}
```

执行：

```text
更新 <profile_home>/.env
日志脱敏
审计记录只保存 key 名称，不保存 value
```

---

## 10. WebUI 页面设计

## 10.1 Dashboard

内容：

- Node 总数
- Online Nodes
- Agent 总数
- Gateway Running
- Setup Required
- 最近错误
- 最近任务

## 10.2 Agent Fleet

主页面。

表格字段：

- Agent
- Node
- Profile Home
- Provider
- Model
- terminal.cwd
- Setup
- Gateway
- Sessions
- Skills
- Last Seen
- Actions

批量操作：

- Setup
- Doctor
- Start Gateway
- Stop Gateway
- Restart Gateway
- Rescan

## 10.3 New Agent

步骤：

```text
1. 选择 Node
2. 填写 Profile 信息
3. 选择创建方式
4. 设置 terminal.cwd
5. 创建后动作
6. 确认命令预览
```

## 10.4 Agent Detail

Tab：

- Overview
- Setup
- Config
- Env
- SOUL.md
- Gateway
- Sessions
- Skills
- Cron
- Logs
- Audit
- Danger

## 10.5 Node Detail

内容：

- Node 信息
- Agent 版本
- Hermes 版本
- CPU / Memory
- HERMES_HOME
- Profiles
- Commands
- Logs
- 维护操作

## 10.6 Command Center

内容：

- 所有任务
- 状态
- stdout / stderr
- 重试
- 取消
- 操作人

## 10.7 Logs Center

内容：

- Node logs
- Agent logs
- Gateway logs
- Setup logs
- Command logs

---

## 11. 数据库设计

## 11.1 nodes

```sql
CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  hostname TEXT,
  os TEXT,
  arch TEXT,
  agent_version TEXT,
  hermes_version TEXT,
  hermes_home TEXT,
  status TEXT NOT NULL,
  capabilities JSON,
  tags JSON,
  last_heartbeat_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);
```

## 11.2 agents

```sql
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL,
  profile_name TEXT NOT NULL,
  display_name TEXT,
  description TEXT,
  profile_home TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  terminal_cwd TEXT,
  setup_status TEXT,
  gateway_status TEXT,
  api_server_status TEXT,
  has_env BOOLEAN,
  has_soul BOOLEAN,
  sessions_count INTEGER,
  skills_count INTEGER,
  cron_count INTEGER,
  last_seen_at TIMESTAMP,
  last_error TEXT,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);
```

## 11.3 commands

```sql
CREATE TABLE commands (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL,
  agent_id TEXT,
  type TEXT NOT NULL,
  payload JSON NOT NULL,
  status TEXT NOT NULL,
  stdout TEXT,
  stderr TEXT,
  error TEXT,
  created_by TEXT,
  created_at TIMESTAMP NOT NULL,
  dispatched_at TIMESTAMP,
  started_at TIMESTAMP,
  finished_at TIMESTAMP
);
```

## 11.4 audits

```sql
CREATE TABLE audits (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  node_id TEXT,
  agent_id TEXT,
  command_id TEXT,
  request_summary JSON,
  result_summary JSON,
  ip TEXT,
  created_at TIMESTAMP NOT NULL
);
```

## 11.5 logs

```sql
CREATE TABLE logs (
  id TEXT PRIMARY KEY,
  node_id TEXT,
  agent_id TEXT,
  command_id TEXT,
  level TEXT,
  source TEXT,
  message TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL
);
```

---

## 12. 安全设计

## 12.1 Hub Agent 连接模式

采用 Agent 主动连接 Hub。

优点：

- 不需要远程机器开放入站端口
- 适合内网 / NAT / Docker
- 更容易穿透云环境
- Hub 统一管理授权和命令队列

## 12.2 Token

注册 Token：

- 由 Hub 生成
- 可设置过期时间
- 可限制 Node 标签
- 可撤销

Agent Token：

- Node 注册后获取或绑定
- 后续 heartbeat / poll commands 使用
- 可轮换

## 12.3 命令白名单

Hub Agent 不执行任意 shell。

所有操作必须映射到 command type。

## 12.4 Secret 脱敏

脱敏规则：

- API_KEY
- TOKEN
- SECRET
- PASSWORD
- ACCESS_KEY
- PRIVATE_KEY

日志写入前脱敏。

`.env` 不返回明文。

## 12.5 Web Terminal

默认禁用。

启用后：

- 仅 Admin 可用
- 所有输入输出审计
- 可配置只允许 setup 命令
- 支持 session timeout

---

## 13. Docker 部署设计

## 13.1 Hub Server docker-compose

```yaml
services:
  hermes-hub:
    image: hermes-hub:latest
    ports:
      - "8080:8080"
    environment:
      DATABASE_URL: postgresql://hub:hub@postgres:5432/hub
    depends_on:
      - postgres

  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: hub
      POSTGRES_PASSWORD: hub
      POSTGRES_DB: hub
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
```

## 13.2 Hub Agent in Docker

模式一：与 Hermes Agent 同容器。

```yaml
services:
  hermes-coder:
    image: hermes-agent-with-hub-agent:latest
    volumes:
      - ./data/coder:/opt/data
    environment:
      HERMES_HOME: /opt/data
      HERMES_HUB_URL: https://hub.example.com
      HERMES_HUB_TOKEN: hhub_xxxxx
      HERMES_NODE_NAME: docker-coder
```

模式二：Sidecar。

```yaml
services:
  hermes-coder:
    image: nousresearch/hermes-agent:latest
    command: gateway run
    volumes:
      - ./data/coder:/opt/data

  hermes-coder-agent:
    image: hermes-hub-agent:latest
    volumes:
      - ./data/coder:/opt/data
    environment:
      HERMES_HOME: /opt/data
      HERMES_HUB_URL: https://hub.example.com
      HERMES_HUB_TOKEN: hhub_xxxxx
```

---

## 14. 兼容 Hermes Hooks / Plugin 的设计

第一阶段 Hub Agent 负责核心管理。

第二阶段可以增加可选 Hermes Hook / Plugin：

用途：

- session.start 上报
- session.end 上报
- agent.start / agent.end 上报
- tool 调用上报
- LLM 调用统计
- gateway slash command 事件

事件写入本地 outbox：

```text
<profile_home>/hub-events/outbox.jsonl
```

Hub Agent 负责读取并发送。

这样避免 plugin 本身承担常驻心跳。

---

## 15. 开发里程碑

## Milestone 1：基础 Controller-Agent

- Hub Server 初始化
- Hub Agent 初始化
- Node 注册
- Heartbeat
- Command Poll
- Command Result
- Profile Scanner
- Agent Fleet 页面

## Milestone 2：Profile 管理

- 新建 Profile
- Profile 详情
- SOUL.md 读写
- config.yaml 读取
- env 状态
- terminal.cwd 编辑
- Profile rescan

## Milestone 3：Setup / Gateway

- setup command
- setup logs
- doctor
- gateway status
- gateway start
- gateway stop
- gateway restart
- 批量操作

## Milestone 4：日志 / 审计

- Command Center
- Logs Center
- Audit Log
- 日志脱敏
- command retry / cancel

## Milestone 5：Docker 优化

- 同容器模式
- Sidecar 模式
- Docker 镜像
- Compose 模板
- 容器健康检查

## Milestone 6：事件观测

- Hermes hooks
- session events
- tool events
- LLM events
- event timeline

---

## 16. 风险与应对

## 16.1 Hermes CLI 变化

风险：Hermes CLI 命令参数变更。

应对：

- Hub Agent 封装 HermesAdapter
- 版本探测
- 按 hermes_version 选择命令策略

## 16.2 Setup 交互复杂

风险：setup wizard 需要交互输入。

应对：

- 第一阶段支持 Web Terminal
- 常用配置走表单写 config / env
- 复杂 setup 交给原生 CLI

## 16.3 Gateway 停止影响 Hub Agent

风险：同容器模式下 stop gateway 可能影响整个容器。

应对：

- 区分 process mode / container mode
- 容器模式下 Gateway 控制由容器生命周期管理
- 提供安全提示

## 16.4 Secret 泄漏

风险：日志或 API 返回密钥。

应对：

- 全链路脱敏
- `.env` 不明文返回
- 审计不记录 value

## 16.5 多 Profile 并发写

风险：多个任务同时写同一 profile。

应对：

- Agent 侧 profile-level lock
- command queue 串行化同一 agent 的写操作

---

## 17. 第一版交付清单

Hub Server：

- REST API
- WebUI
- DB schema
- Node Registry
- Agent Registry
- Command Queue
- Logs Center
- Audit Log

Hub Agent：

- configure
- start
- register
- heartbeat
- scan profiles
- poll commands
- execute commands
- report result
- tail logs
- redact secrets

WebUI：

- Dashboard
- Nodes
- Agent Fleet
- New Agent
- Agent Detail
- Setup Center
- Gateway Control
- Command Center
- Logs Center

---

## 18. 参考链接

- https://hermes-agent.nousresearch.com/docs/user-guide/profiles/
- https://hermes-agent.nousresearch.com/docs/user-guide/docker/
- https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks/
