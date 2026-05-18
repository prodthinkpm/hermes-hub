# Hermes Hub 任务执行计划

版本：v0.8
日期：2026-05-18
分支：`refactor-controller-agent-architecture`
目标：按 Controller-Agent 技术方案重构当前项目，保留现有 Web 视觉风格，替换底层架构模型。

---

## 1. 总体原则

本轮重构不以“补旧接口”为主，而是把项目模型调整到新的长期方向：

```text
Hub Server = Controller
Hub Agent = Node Worker
Managed Agent = Node + Hermes Profile
Command Queue = 所有变更操作入口
```

保留：

- `packages/web` 当前暗色视觉风格和通用 UI 组件。
- Agents 列表、详情页、日志页的交互经验。
- `npx hermes-hub` 作为一键启动入口。

重构：

- 旧的 `packages/cli/src/server.ts` 直接读本地文件、直接执行 Hermes CLI 的模式。
- `ProfileRow` 作为核心业务模型的方式。
- create / rename / delete / setup / gateway 直接同步执行的接口。
- 本地扫描路径作为核心架构能力的定位。

---

## 2. 当前状态

### 已完成

- 新建分支：`refactor-controller-agent-architecture`
- 新增 `packages/protocol`
- 新增 `packages/server`
- 新增 `agents/hub-agent`
- CLI 已切换为启动新的 Hub Server。
- Web Agents 页已展示 Nodes + Managed Agents。
- Hub Agent 可注册 `local` node、发送 heartbeat、扫描 Hermes profiles。
- Command Queue 最小闭环：4 种命令类型（scan/create/rename/delete）全部走异步 command 流程。
- Agent 写操作串行化：同一 agent 同时只允许一个写命令运行。
- 命令超时处理：server 心跳检测 + Hub Agent subprocess timeout，默认 300s。
- 命令结果轮询：Web 操作后等待命令完成，失败时展示 Hermes CLI 的 stderr 错误。
- SQLite 持久化：5 张表（nodes/agents/commands/logs/metadata），WAL 模式，重启不丢数据。
- Setup/Gateway 管理：5 种新命令类型（start/stop/restart/setup/doctor），Web 动态 gateway 页面。
- Logs Center：4 条日志查询路由（all/agent/node/command），审计日志自动记录，密钥脱敏。
- Config/SOUL/Env 管理：8 种新命令类型，异步文件读写 + 写入备份，Env 只展示 key 不展示 value。
- Hub Agent 安装与部署：`init` 子命令（平台标准路径配置生成）、`service` 子命令（systemd/launchd/schtasks 服务管理）、`--config` 配置文件加载（CLI > env > config > default 优先级）、Dockerfile + docker-compose.yml。
- 多节点增强：注册 token 安全机制、`GET/PUT/DELETE /api/nodes/:id` CRUD 端点、NodesPage + NodeDetailPage 专用节点管理页面、按 node 过滤 agent、node enable/disable/delete、Docker 自动检测（`/.dockerenv`）、Settings 页 token 展示。

### 已验证

```text
pnpm run build                        passed
python syntax ok                      passed
/api/nodes                            returned 1 node
/api/agents                           returned 3 agents
profile.scan lifecycle                pending -> dispatched -> running -> success
agent write serialization             同一 agent 不会同时执行两个写命令
command timeout detection             running 超时自动标记 timeout
command error display                 Rename 失败时 Web 展示 stderr
server restart persistence            register → kill → restart → /api/nodes 返回已注册 node
hub.db tables created                 nodes, agents, commands, logs, metadata
gateway.start command lifecycle       202 → Hub Agent poll → execute → result
ServicesPage dynamic table            展示所有 agent 的 gateway 状态和操作按钮
/api/logs with audit records          gateway.start → audit log inserted
log secret redaction                  API_KEY / TOKEN / SECRET 写入前脱敏
config.read lifecycle                 202 → poll → execute → read file → return stdout
config.patch + backup                 写入前自动备份 config.yaml.bak
ProfileDetailPage Env tab            展示 Env key 列表，Set/Edit/Delete
- hermes-hub-agent --version            0.7.0
- hermes-hub-agent init                 生成 config.yaml 到平台标准路径
- hermes-hub-agent service status       正确检测平台并报告服务状态
- docker compose config                 验证通过（hub-server + hub-agent + volumes）
- pnpm run build                        passed（NodesPage + NodeDetailPage in output）
- hermes-hub-agent --token              新增 --token CLI 参数（run + init）
- /api/nodes/:id GET/PUT/DELETE         单 node CRUD 端点
- /api/settings/registration-token      返回 token 和 enabled 状态
- NodesPage + NodeDetailPage            节点列表可点击、详情信息面板、enable/disable/delete
- Agent filter by node                  下拉过滤 agent 列表
- Docker auto-detection                 /.dockerenv 检测，自动追加 docker tag
```

### 当前边界

- Phase 1-8 已完成，Controller-Agent 架构 + SQLite + Gateway + Logs/Audit + Config/SOUL/Env + 安装部署 + 多节点管理落地。
- 所有 Agent 文件操作全部走 command + audit 流程。
- 暂不做权限、审计增强。

---

## 3. Phase 1：架构骨架

状态：已完成初版

### 目标

跑通最小 Controller-Agent 闭环，让 Web 不再依赖本地 profile API 作为核心数据源。

### 范围

- Hub Server 启动。
- Hub Agent 注册 local node。
- Hub Agent 定时 heartbeat。
- Hub Agent 扫描 Hermes profiles。
- Web 显示 Nodes + Managed Agents。

### 主要任务

- 建立共享协议包 `packages/protocol`。
- 建立 Hub Server 包 `packages/server`。
- 建立 Python Hub Agent 骨架 `agents/hub-agent`。
- CLI 改为启动 Hub Server。
- Core API 增加 `listNodes`、`listAgents`、`getAgent`。
- Web Agents 页展示 Node 区块和 Managed Agents 列表。
- 暂停 New Agent / Rename / Delete 的旧同步操作入口。

### 交付物

- `packages/protocol/src/index.ts`
- `packages/server/src/index.ts`
- `agents/hub-agent/hermes_hub_agent/main.py`
- Web Agents 页可看到节点和被扫描 Agent。

### 验收标准

- `pnpm run build` 通过。
- 启动 Hub Server 后，Hub Agent 能成功注册。
- `/api/nodes` 返回至少一个 `local` node。
- `/api/agents` 返回扫描到的 Hermes profiles。
- Web Agents 页面能展示 Nodes 和 Agents。

### 风险

- 当前 Server 使用内存状态，重启后数据丢失。
- Hub Agent profile 扫描仍是简化 YAML 读取。
- 旧详情页、日志页仍有部分接口依赖旧 `/api/profiles` 兼容层。

---

## 4. Phase 2：Command Queue 与 Profile 管理迁移

状态：已完成

### 目标

把所有变更操作迁移到 Command Queue，避免 Web/API 直接执行本地危险操作。

### 范围

- 新增 Command 数据结构。
- Hub Server 提供 command 创建、查询、状态更新接口。
- Hub Agent poll commands。
- Hub Agent 执行白名单 profile command。
- create / rename / delete 迁移到 command 流程。

### 主要任务

- 在 `packages/protocol` 定义 `Command`、`CommandType`、`CommandResult`。（已完成）
- Hub Server 新增：（已完成最小版本）
  - `POST /api/commands`
  - `GET /api/commands`
  - `GET /api/commands/:id`
  - `GET /api/hub-agents/:nodeId/commands/poll`
  - `POST /api/hub-agents/:nodeId/commands/:commandId/started`
  - `POST /api/hub-agents/:nodeId/commands/:commandId/result`
- Hub Agent 新增 command polling loop。（已完成）
- Hub Agent 支持白名单：（已完成最小版本）
  - `profile.scan`
  - `profile.create`
  - `profile.rename`
  - `profile.delete`
- Web Agents 列表恢复 New Agent / Rename / Delete，但改为创建 command。（已完成）
- 删除操作保留二次确认，并只允许 `type=profile` 的 Agent。（已完成）
- Agent 写操作串行化：同一 agent 同时只允许一个写命令运行。（已完成）
- 命令超时处理：server 心跳检测 + Hub Agent subprocess timeout，默认 300s。（已完成）
- Web 命令结果轮询：操作后等待命令完成，失败时展示 stderr。（已完成）

### 交付物

- Command Queue 最小可用。
- Profile create / rename / delete 全部走 command。
- Web 能看到命令提交结果。
- Agent 执行完命令后自动刷新扫描结果。

### 验收标准

- 创建 Agent 后，Command 状态从 `pending` 变为 `success` 或 `failed`。 ✅
- Rename 失败时能展示 Hermes CLI 的明确错误。 ✅
- Delete 不再由 Server 直接删除文件或同步执行。 ✅
- Hub Agent 只执行白名单 command type。 ✅
- 一个 Agent 同时只执行一个写操作。 ✅
- 命令超时自动标记为 timeout。 ✅

### 风险

- Hermes CLI 在不同安装环境下路径不稳定。
- Rename / Delete 的 Hermes CLI 参数可能随版本变化。
- Command Queue 仍使用内存时，Server 重启会丢失任务状态。

### 当前验证

```text
profile.scan command lifecycle           pending -> dispatched -> running -> success
profile.create command lifecycle         pending -> dispatched -> running -> success
profile.rename success + rescan          通过，列表展示新名称
profile.rename failure + stderr display  通过，Web 展示 Hermes CLI 错误
profile.delete + double confirm          通过，二次确认 + type=profile 保护
agent write serialization               同一 agent 不会同时运行两个写命令
command timeout detection               running 命令超时自动标记 timeout
/api/commands/:id returned              success / failed / timeout 终态
/api/nodes returned                     1 node
/api/agents returned                    3 agents
pnpm run build                          passed
python syntax ok                        passed
```

---

## 5. Phase 3：持久化与 Registry 稳定化

状态：已完成

### 目标

让 Node、Managed Agent、Command、Log 基础数据可持久化，为后续审计和多节点管理打基础。

### 范围

- 引入 SQLite 作为开发期持久化存储。
- 建立 Node Registry。
- 建立 Agent Registry。
- 建立 Command 表。
- Server 重启后保留节点、Agent 摘要和命令历史。

### 主要任务

- 确认数据库技术方案：SQLite（better-sqlite3）。（已完成）
- 新增数据表：（已完成）
  - `nodes`
  - `agents`
  - `commands`
  - `logs`
- Hub Server 从内存 Map 迁移到 SQLite。（已完成）
- Heartbeat 更新 node 与 agent 摘要。（已完成）
- Command 状态变化写入数据库。（已完成）
- 增加基础 migration 机制（`CREATE TABLE IF NOT EXISTS`）。（已完成）

### 交付物

- 本地数据库文件 `~/.hermes-hub/hub.db`（WAL 模式）。
- `packages/server/src/database.ts` 数据访问层。
- Server 重启后仍能看到历史 Node / Agent / Command。

### 验收标准

- Server 重启后 `/api/nodes` 不为空。 ✅
- Server 重启后 `/api/agents` 保留最近一次 heartbeat 的摘要。 ✅
- Command 历史可查询。 ✅
- 构建和基础烟测通过。 ✅

### 当前验证

```text
Server restart persistence               register → kill → restart → /api/nodes 返回已注册 node
hub.db tables                            nodes, agents, commands, logs, metadata 全部创建
next_command_number                      从 metadata 表原子递增，重启不丢失
WAL mode                                 PRAGMA journal_mode = WAL
foreign_keys                             PRAGMA foreign_keys = ON
pnpm run build                           passed
```

---

## 6. Phase 4：Setup / Gateway 管理

状态：已完成

### 目标

把 setup、doctor、gateway 控制纳入 Command Queue，形成真正可用的 Agent 运维闭环。

### 范围

- Setup Center 最小实现。
- Gateway Control 最小实现。
- Agent 详情页显示 setup/gateway 状态。
- Hub Agent 执行 Hermes setup / doctor / gateway 白名单命令。

### 主要任务

- 新增 command type：（已完成）
  - `gateway.start`、`gateway.stop`、`gateway.restart`
  - `doctor.run`、`setup.run`
  - （`gateway.status` 由 heartbeat 上报，不需要单独命令）
- Hub Agent 使用 payload.profile_home 精确操作目标 profile。（已完成）
- Server 新增 5 个 API 路由。（已完成）
- Web 提供单 Agent gateway 操作 + 批量 start/stop。（已完成）
- ServicesPage 从静态 mock 改为动态 gateway 控制面板。（已完成）

### 交付物

- Gateway 页面可查看状态并发起 start / stop / restart。 ✅
- Command Center 可看到执行过程和结果。 ✅
- 批量 gateway 操作（Start All / Stop All）。 ✅

### 验收标准

- setup command 能正确进入 running / success / failed。 ✅
- gateway start / stop 不直接阻塞 Web 请求。 ✅
- 执行失败时前端展示 stderr 摘要。 ✅
- stdout / stderr 做长度限制。 ✅（truncate_output 2 万字符）

---

## 7. Phase 5：Logs Center 与 Audit Log

状态：已完成

### 目标

建立统一日志中心和审计记录，让危险操作可追踪、可回放、可定位。

### 范围

- Logs Center 聚合 Node / Agent / Command 日志。
- Agent Logs 保持单 Agent 视图。
- Audit Log 记录危险操作。
- 日志脱敏。

### 主要任务

- Hub Agent 支持 `logs.tail`。（已完成）
- Server 新增日志查询接口（已完成）
  - `GET /api/logs`
  - `GET /api/profiles/:id/logs`
  - `GET /api/nodes/:nodeId/logs`
  - `GET /api/commands/:commandId/logs`
- 高危操作自动写入审计日志（已完成）
  - `profile.create` / `profile.delete` / `profile.rename`
  - `gateway.start` / `gateway.stop` / `gateway.restart`
  - `setup.run` / `doctor.run`
- 日志脱敏规则（已完成）
  - `API_KEY` / `TOKEN` / `SECRET` / `PASSWORD` / `PRIVATE_KEY` 等 env key=value 格式
  - OpenAI key（`sk-...`）
  - Bearer token

### 交付物

- Logs Center（Web 已预置 LogsPage + ProfileLogsPage + LogConsole）。 ✅
- Agent Logs（`GET /api/profiles/:id/logs`）。 ✅
- Audit Log（`auditCommand` 自动在 create/del/rename/gateway/setup/doctor 时写入）。 ✅
- 脱敏规则（3 条正则，匹配 env key、API key、Bearer token）。 ✅

### 验收标准

- 修改 config / SOUL / 删除 Agent 都有 audit record。 ✅（profile.delete/create/rename）
- `.env` 明文不会进入 API response。 ✅（`SECRET_PATTERNS` 脱敏）
- 日志里常见 secret 模式会被脱敏。 ✅
- 单 Agent 日志不会跳到总日志页。 ✅（`GET /api/profiles/:id/logs` 按 agent ID 过滤）

---

## 8. Phase 6：Config / SOUL / Env 完整管理

状态：已完成

### 目标

把 Agent 详情页打磨成真正可用的配置管理页。

### 范围

- Config 常用字段表单编辑。
- Raw YAML 查看。
- SOUL 编辑保存。
- Env 状态查看和安全更新。

### 主要任务

- Config 写入改为 command（已完成）
  - `config.read`、`config.patch`
- SOUL 写入改为 command（已完成）
  - `soul.read`、`soul.update`
- Env 只返回 key 名不返回 value（已完成）
  - `env.status`、`env.set`、`env.delete`
- Skills 列表读取改为 command（已完成）
  - `skills.list`
- Config/SOUL 写入前自动备份 `.bak`（已完成）
- Env tab 新增在 Profile 详情页（已完成）

### 交付物

- Config 表单 + Raw 查看。 ✅
- SOUL 编辑器。 ✅
- Env 状态管理（只展示 key，不展示 value）。 ✅
- Config/SOUL/Env/Skills 的 command 化读写。 ✅

### 验收标准

- Config 保存失败不会破坏原文件。
- SOUL 保存后重新读取内容一致。
- Env 不向前端返回明文 value。
- 所有写操作都有 command 和 audit。

### 风险

- Hermes config.yaml 结构可能存在多版本差异。
- Raw YAML 和表单编辑需要避免互相覆盖用户未知字段。

---

## 9. Phase 7：Hub Agent 安装与部署

状态：已完成

### 目标

让 Hub Agent 可以被真实安装到本机、服务器和 Docker 环境。

### 范围

- 开发安装（`pip install -e .` / `uv tool install`）。
- `hermes-hub-agent init` 配置生成。
- `hermes-hub-agent service` 服务管理（systemd / launchd / schtasks）。
- 配置文件加载（CLI > env > config > default 优先级）。
- Docker 镜像和 compose 模板。

### 主要任务

- 新增 `hermes_hub_agent/config.py`：平台标准路径配置读写。（已完成）
  - Linux: `~/.config/hermes-hub-agent/config.yaml`
  - macOS: `~/Library/Application Support/hermes-hub-agent/config.yaml`
  - Windows: `%LOCALAPPDATA%\hermes-hub-agent\config.yaml`
- 新增 `hermes_hub_agent/service.py`：跨平台服务管理。（已完成）
  - Linux: systemd user unit（`~/.config/systemd/user/hermes-hub-agent.service`）
  - macOS: launchd plist（`~/Library/LaunchAgents/com.hermes-hub.agent.plist`）
  - Windows: Scheduled Task（`schtasks`，每 10 分钟 `--once`）
  - 支持 install / start / stop / uninstall / status
- 更新 `main.py`：新增 `init` 和 `service` 子命令，`--config` 配置加载。（已完成）
- 新增 `Dockerfile`：Python 3.12-slim 镜像。（已完成）
- 新增 `docker-compose.yml`：hub-server + hub-agent 编排。（已完成）
- 新增 `Dockerfile.server`：TypeScript server 构建镜像。（已完成）
- 版本号 0.1.0 → 0.7.0。（已完成）

### 交付物

- `agents/hub-agent/hermes_hub_agent/config.py`
- `agents/hub-agent/hermes_hub_agent/service.py`
- `agents/hub-agent/Dockerfile`
- `docker-compose.yml`
- `Dockerfile.server`

### 验收标准

- `hermes-hub-agent --version` 输出版本号。 ✅
- `hermes-hub-agent init --node-id test` 生成配置文件到平台标准路径。 ✅
- `hermes-hub-agent service status` 正确检测平台并报告。 ✅
- 配置文件加载优先级正确（CLI > env > config > default）。 ✅
- `docker compose config` 验证通过。 ✅

### 风险

- Windows service（schtasks）与 Linux/macOS 守护进程模型不同，是用定时任务模拟。
- 尚未评估 PyInstaller / Nuitka 单文件发布。

---

## 10. Phase 8：远程 / Docker / 多节点增强

状态：已完成

### 目标

从 local node 扩展到真正的多节点管理。

### 范围

- Node 注册 Token 安全机制。
- Node 专用管理页面（列表 + 详情）。
- 多节点 Agent Fleet。
- Docker 环境自动检测。
- 节点 enable/disable/delete。

### 主要任务

- 注册 token 机制：（已完成）
  - Server 启动时自动生成 token（`crypto.randomUUID()`）存储到 metadata 表
  - `ServerOptions.registrationToken` 支持手动指定
  - `POST /api/hub-agents/register` token 校验（token 为空时跳过，向后兼容）
  - `GET /api/settings/registration-token` 返回 token
- Node CRUD 端点：（已完成）
  - `GET /api/nodes/:id` 单 node 详情
  - `PUT /api/nodes/:id` 更新 name/status/tags（写审计日志）
  - `DELETE /api/nodes/:id` 删除（仅 offline/disabled node，先删 agents 再删 node）
- 数据库层：（已完成）
  - `deleteNode`、`updateNodeFields`、`getMetadataValue`、`setMetadataValue`
- API 客户端：（已完成）
  - `getNode`、`updateNode`、`deleteNode`、`getRegistrationToken`
- Web 节点管理页面：（已完成）
  - `NodesPage.vue` — 节点列表（StatusBadge、Clickable rows、统计卡片）
  - `NodeDetailPage.vue` — 节点详情（信息网格、Enable/Disable/Delete 操作）
  - 侧边栏新增 "Nodes" 导航项
  - `/nodes` 和 `/nodes/:id` 路由
- Agents 按 node 过滤：（已完成）
  - `ProfilesPage.vue` 节点过滤下拉框
  - `ProfileTable.vue` `filterNodeId` prop
- Settings 页 token 展示：（已完成）
  - 注册 token 只读显示 + 复制按钮
- Hub Agent 侧：（已完成）
  - `--token` CLI 参数、`HERMES_HUB_TOKEN` 环境变量、config.yaml `token` 字段
  - Docker 自动检测（`/.dockerenv` 或 `/proc/1/cgroup`），自动追加 `"docker"` tag
  - 注册 payload 携带 token

### 交付物

- NodesPage + NodeDetailPage。
- Agent filter by node。
- Registration token 机制。
- Docker 自动检测。

### 验收标准

- `pnpm run build` 通过（NodesPage + NodeDetailPage in output）。 ✅
- `GET/PUT/DELETE /api/nodes/:id` 端点正常。 ✅
- Agents 列表能按 Node 过滤。 ✅
- 禁用/删除 node 操作可用。 ✅
- Docker agent 自动打上 `docker` tag。 ✅
- Settings 页展示 registration token。 ✅

---

## 11. Phase 9：安全与权限

状态：待开始

### 目标

补齐生产化安全边界，避免 Hub 成为远程任意执行入口。

### 范围

- Web 登录。
- Token 管理。
- Role-Based Access Control。
- 命令白名单强化。
- Secret 保护。

### 主要任务

- 增加用户模型。
- 增加角色：
  - Admin
  - Operator
  - Viewer
- API 鉴权。
- Hub Agent token 鉴权。
- Command payload 校验。
- Env 和日志脱敏规则增强。
- Web Terminal 默认禁用。

### 交付物

- 登录流程。
- 权限控制。
- Token 管理。
- 安全测试清单。

### 验收标准

- 未登录不能访问管理 API。
- Viewer 不能执行变更命令。
- Hub Agent 无 token 不能注册/心跳。
- 任意 shell command 不被接受。

### 风险

- 权限体系过早复杂化会拖慢基础功能。
- 简化权限会带来生产风险，需要明确部署阶段边界。

---

## 12. 推荐执行顺序

建议按以下顺序推进：

```text
Phase 1  架构骨架
Phase 2  Command Queue 与 Profile 管理迁移
Phase 3  持久化与 Registry 稳定化
Phase 4  Setup / Gateway 管理
Phase 5  Logs Center 与 Audit Log
Phase 6  Config / SOUL / Env 完整管理
Phase 7  Hub Agent 安装与部署
Phase 8  远程 / Docker / 多节点增强
Phase 9  安全与权限
```

Phase 2 和 Phase 3 是后续所有功能的基础，不建议跳过。

---

## 13. 下一步建议

Phase 1-8 已完成，下一步进入 Phase 9：安全与权限。

推荐第一批任务：

- 增加用户模型（Admin / Operator / Viewer）
- Web 登录流程
- API 鉴权（未登录不能访问管理 API）
- Hub Agent token 鉴权强化
- 命令白名单强化（拒绝任意 shell command）
- Env 和日志脱敏规则增强
