# Hermes Hub 任务执行计划

版本：v0.2
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
```

### 当前边界

- Phase 1-2 已完成，Controller-Agent 架构落地。
- create / rename / delete 已走 command 流程。
- 暂不引入数据库，Hub Server 使用内存状态。
- 暂不做 setup / doctor / gateway 管理操作。
- 暂不做远程节点、Docker、权限、审计。

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

状态：待开始

### 目标

让 Node、Managed Agent、Command、Log 基础数据可持久化，为后续审计和多节点管理打基础。

### 范围

- 引入 SQLite 作为开发期持久化存储。
- 建立 Node Registry。
- 建立 Agent Registry。
- 建立 Command 表。
- Server 重启后保留节点、Agent 摘要和命令历史。

### 主要任务

- 确认数据库技术方案：SQLite 起步，后续 PostgreSQL。
- 新增数据表：
  - `nodes`
  - `agents`
  - `commands`
  - `logs`
- Hub Server 从内存 Map 迁移到 repository/service 层。
- Heartbeat 更新 node 与 agent 摘要。
- Command 状态变化写入数据库。
- 增加基础 migration 机制。

### 交付物

- 本地数据库文件。
- 数据访问层。
- Server 重启后仍能看到历史 Node / Agent / Command。

### 验收标准

- Server 重启后 `/api/nodes` 不为空。
- Server 重启后 `/api/agents` 保留最近一次 heartbeat 的摘要。
- Command 历史可查询。
- 构建和基础烟测通过。

### 风险

- 过早引入复杂 ORM 会拖慢重构。
- 数据库 schema 如果和协议模型耦合过深，后续调整成本高。

---

## 6. Phase 4：Setup / Gateway 管理

状态：待开始

### 目标

把 setup、doctor、gateway 控制纳入 Command Queue，形成真正可用的 Agent 运维闭环。

### 范围

- Setup Center 最小实现。
- Gateway Control 最小实现。
- Agent 详情页显示 setup/gateway 状态。
- Hub Agent 执行 Hermes setup / doctor / gateway 白名单命令。

### 主要任务

- 新增 command type：
  - `profile.setup`
  - `profile.doctor`
  - `gateway.status`
  - `gateway.start`
  - `gateway.stop`
  - `gateway.restart`
- Hub Agent 为每个 command 设置 timeout。
- Hub Agent 捕获 stdout / stderr。
- Server 保存 command 执行输出摘要。
- Web 提供单 Agent 操作入口。
- Web 提供批量 gateway start / stop / restart 的第一版。

### 交付物

- Agent 详情页可发起 setup / doctor。
- Gateway 页面可查看状态并发起 start / stop / restart。
- Command Center 可看到执行过程和结果。

### 验收标准

- setup command 能正确进入 running / success / failed。
- gateway start / stop 不直接阻塞 Web 请求。
- 执行失败时前端展示 stderr 摘要。
- stdout / stderr 做长度限制。

### 风险

- Hermes setup 交互复杂，第一版可能只能支持非交互或 Web Terminal 入口。
- 同容器模式下 stop gateway 可能影响 Hub Agent，需要明确安全策略。

---

## 7. Phase 5：Logs Center 与 Audit Log

状态：待开始

### 目标

建立统一日志中心和审计记录，让危险操作可追踪、可回放、可定位。

### 范围

- Logs Center 聚合 Node / Agent / Command 日志。
- Agent Logs 保持单 Agent 视图。
- Audit Log 记录危险操作。
- 日志脱敏。

### 主要任务

- Hub Agent 支持 `logs.tail`。
- Server 新增日志写入接口。
- Server 新增日志查询接口：
  - `GET /api/logs`
  - `GET /api/agents/:agentId/logs`
  - `GET /api/nodes/:nodeId/logs`
  - `GET /api/commands/:commandId/logs`
- 新增 Audit service。
- 对密钥类字段脱敏：
  - `API_KEY`
  - `TOKEN`
  - `SECRET`
  - `PASSWORD`
  - `PRIVATE_KEY`
- Web Logs 页区分 all logs、node logs、agent logs、command logs。

### 交付物

- Logs Center。
- Agent Logs。
- Audit Log 基础页。
- 脱敏规则。

### 验收标准

- 修改 config / SOUL / 删除 Agent 都有 audit record。
- `.env` 明文不会进入 API response。
- 日志里常见 secret 模式会被脱敏。
- 单 Agent 日志不会跳到总日志页。

### 风险

- 日志量增长后需要分页或流式读取。
- 简单脱敏规则可能漏掉非标准 key。

---

## 8. Phase 6：Config / SOUL / Env 完整管理

状态：待开始

### 目标

把 Agent 详情页打磨成真正可用的配置管理页。

### 范围

- Config 常用字段表单编辑。
- Raw YAML 查看。
- SOUL 编辑保存。
- Env 状态查看和安全更新。

### 主要任务

- Config 写入改为 command：
  - `config.read`
  - `config.patch`
- SOUL 写入改为 command：
  - `soul.read`
  - `soul.update`
- Env 只返回状态：
  - `env.status`
  - `env.set`
  - `env.delete`
- 保存前 YAML 校验。
- 保存后提示是否需要重启 Gateway。
- 添加 config 写入备份策略。

### 交付物

- Config 表单 + Raw 查看。
- SOUL 编辑器。
- Env 状态管理。
- Config/SOUL/Env 的 command 化写入。

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

状态：待开始

### 目标

让 Hub Agent 可以被真实安装到本机、服务器和 Docker 环境。

### 范围

- 开发安装。
- 二进制发布。
- systemd / launchd / Windows service。
- Docker sidecar。

### 主要任务

- 支持：
  - `pipx install hermes-hub-agent`
  - `uv tool install hermes-hub-agent`
- 增加 `hermes-hub-agent init`。
- 增加配置文件：
  - Linux: `/etc/hermes-hub-agent/config.yaml`
  - macOS: `~/Library/Application Support/hermes-hub-agent/config.yaml`
  - Windows: `%LOCALAPPDATA%\hermes-hub-agent\config.yaml`
- 增加 service install/start/stop 命令。
- 评估 PyInstaller / Nuitka 单文件发布。
- 增加 Docker 镜像和 compose 模板。

### 交付物

- Hub Agent 安装文档。
- 本机 service 运行方式。
- Docker sidecar 示例。

### 验收标准

- 新机器按文档可以注册到 Hub。
- service 重启后自动恢复 heartbeat。
- Docker sidecar 可以扫描挂载的 `/opt/data`。

### 风险

- Windows service 权限和路径处理复杂。
- 打包二进制需要处理不同平台依赖。

---

## 10. Phase 8：远程 / Docker / 多节点增强

状态：待开始

### 目标

从 local node 扩展到真正的多节点管理。

### 范围

- Node 注册 Token。
- Node 状态页。
- 多节点 Agent Fleet。
- Docker 模式。
- 节点维护状态。

### 主要任务

- Hub Server 增加注册 token。
- Hub Agent 注册时使用 token。
- Node 页面展示：
  - hostname
  - OS
  - arch
  - agent version
  - hermes home
  - last heartbeat
  - profiles count
  - gateway count
- 支持 node disable / enable。
- Docker 模式识别 `/opt/data`。
- Web 增加 Node 过滤器。

### 交付物

- Node Management 页面。
- 多节点 Agent Fleet。
- Docker 接入文档。

### 验收标准

- 两个不同 node 能同时注册。
- Agents 列表能按 Node 过滤。
- offline node 能被标记。
- 禁用 node 后不再下发命令。

### 风险

- Token 生命周期和撤销策略需要和权限体系一起设计。
- Docker 容器内 Gateway 管理要避免误停自身。

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

Phase 1-2 已完成，下一步进入 Phase 3：持久化与 Registry 稳定化。

推荐第一批任务：

- 引入 SQLite（零配置、单文件、适合开发期）。
- 建立 `nodes`、`agents`、`commands` 表。
- Hub Server 从内存 Map 迁移到 SQLite 读写。
- Heartbeat 更新时同步写入数据库。
- Server 重启后 Node/Agent/Command 数据不丢失。
- 添加基础 migration 机制（后续可接 drizzle 或 knex）。
