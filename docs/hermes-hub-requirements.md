# Hermes Hub 需求文档

版本：v0.1  
日期：2026-05-18  
定位：多 Agent / 多 Profile / 多节点管理平台  
架构模式：Controller-Agent，类似 Jenkins Controller 与 Jenkins Agent

---

## 1. 背景

Hermes Agent 的多 Agent 能力本质上是通过 **Profile** 实现的。一个 Profile 是一个独立的 Hermes home directory，包含自己的 `config.yaml`、`.env`、`SOUL.md`、sessions、memory、skills、cron jobs、logs 和 gateway state。

创建一个名为 `coder` 的 Profile 后，Hermes 会生成对应命令别名，例如：

```bash
coder setup
coder chat
coder gateway start
```

因此在 Hermes Hub 的产品模型里：

```text
一个 Agent = 一个 Hermes Profile
```

但是仅靠 CLI 管理多个 Profile 会出现问题：

- 新建 Agent 需要手动执行命令。
- setup 过程需要手动进入终端。
- 10 个 Agent 需要分别启动、停止、查看日志。
- 本机、远程服务器、Docker 容器中的 Agent 无法统一管理。
- 多 Agent 状态、Gateway 状态、日志、异常和操作记录无法集中查看。
- 后续远程 / Docker / 多机器场景不能靠单机 Dashboard 覆盖。

因此需要 Hermes Hub。

---

## 2. 产品定位

Hermes Hub 是一个中心化的多 Agent 管理平台。

它采用 Controller-Agent 架构：

```text
Hermes Hub Server = Controller / 控制中心
Hermes Hub Agent  = Worker Node / 节点代理
Hermes Profile    = 被管理的 Agent 实例
Hermes Gateway    = Profile 对外服务进程
```

一句话：

```text
Hermes Hub 通过部署在本机、远程机器或 Docker 容器中的 Hermes Hub Agent，统一管理多个 Hermes Profiles。
```

---

## 3. 产品目标

### 3.1 核心目标

Hermes Hub 要解决：

- 多 Agent 新建
- 多 Agent setup
- 多 Agent 启动 / 停止 / 重启
- 多 Agent 状态监控
- 多 Agent 日志查看
- 多 Agent 配置编辑
- 多 Agent Gateway 管理
- 多机器 / Docker 接入
- 统一审计和操作记录

### 3.2 非目标

第一阶段不做：

- 替代 Hermes Agent runtime
- 重写 Hermes setup 全部逻辑
- 直接修改 Hermes Agent 源码
- 让 Hub 通过 SSH 主动控制所有机器
- 远程任意 shell 执行
- `.env` 明文展示
- 多租户复杂组织权限系统

---

## 4. 用户角色

### 4.1 管理员

负责：

- 安装 Hermes Hub Server
- 创建节点注册 Token
- 管理节点
- 管理全部 Agent
- 查看审计日志

### 4.2 Agent 运维者

负责：

- 新建 Agent / Profile
- 配置模型和 Gateway
- 执行 setup
- 启停 Gateway
- 查看日志和状态

### 4.3 普通使用者

负责：

- 查看有权限访问的 Agent 状态
- 查看有权限访问的会话 / 日志
- 使用 Agent 服务

---

## 5. 核心概念

## 5.1 Hermes Hub Server

中心端服务，包含：

- WebUI
- Node Registry
- Agent Registry
- Command Queue
- Heartbeat Monitor
- Log Center
- Event Center
- Audit Log
- API Server
- Database

## 5.2 Hermes Hub Agent

部署在本机、远程服务器或 Docker 容器中的节点端程序。

职责：

- 注册到 Hermes Hub
- 上报心跳
- 扫描本机 `HERMES_HOME`
- 发现 Hermes Profiles
- 读取 Profile 配置摘要
- 执行 Hub 下发的白名单任务
- 回传日志和执行结果
- 可选安装 Hermes hooks / plugin 采集事件

## 5.3 Node

一个运行 Hermes Hub Agent 的环境。

可能是：

- 本机 Mac
- 远程 Linux 服务器
- Docker 容器
- Kubernetes Pod
- Windows / WSL 环境

## 5.4 Managed Agent

Hub 中展示和管理的 Agent 实例。

```text
Managed Agent = Node + Hermes Profile
```

示例：

```text
local-mac:coder
server-a:researcher
docker-coder:default
```

## 5.5 Profile

Hermes 原生 Profile。

本机 / 远程服务器：

```text
~/.hermes
~/.hermes/profiles/coder
~/.hermes/profiles/researcher
```

Docker：

```text
/opt/data
```

Docker 场景建议一个容器一个 Hermes 数据目录。

---

## 6. 总体业务流程

## 6.1 节点接入流程

```text
管理员在 Hub 创建 Node 注册 Token
  ↓
在目标机器 / Docker 中安装 hermes-hub-agent
  ↓
配置 Hub URL 和 Token
  ↓
启动 hermes-hub-agent
  ↓
Agent 注册到 Hub
  ↓
Agent 扫描本机 HERMES_HOME
  ↓
Hub WebUI 显示节点和 Profiles
```

## 6.2 新建 Agent 流程

```text
用户打开 Hermes Hub
  ↓
选择目标节点
  ↓
点击新建 Agent
  ↓
填写 Profile 名称、描述、创建方式
  ↓
Hub 下发 profile.create 任务
  ↓
目标节点上的 Hub Agent 本地执行 Hermes Profile 创建
  ↓
Hub Agent 重新扫描 Profiles
  ↓
Hub WebUI 显示新 Agent
  ↓
用户进入 Setup 引导
```

## 6.3 Setup 流程

```text
新 Agent 创建成功
  ↓
进入 Setup Center
  ↓
用户选择：完整 setup / model setup / terminal setup / gateway setup / tools setup
  ↓
Hub 下发 profile.setup 任务
  ↓
Hub Agent 本地执行 Hermes setup
  ↓
执行过程日志实时回传
  ↓
完成后更新 Agent setup 状态
```

## 6.4 Gateway 管理流程

```text
用户选择一个或多个 Agent
  ↓
点击启动 Gateway / 停止 Gateway / 重启 Gateway
  ↓
Hub 下发 gateway.start / gateway.stop / gateway.restart
  ↓
Hub Agent 本地执行
  ↓
Hub Agent 回传结果和日志
  ↓
Hub 更新状态
```

---

## 7. 功能需求

# 7.1 Node 管理

## 7.1.1 Node 列表

展示字段：

- Node 名称
- Node ID
- 主机名
- OS
- Agent 版本
- Hermes 版本
- 在线状态
- 最后心跳时间
- Profiles 数量
- Gateway 运行数量
- CPU / Memory 摘要
- 最近错误

状态：

- online
- offline
- unhealthy
- version_mismatch
- unauthorized
- disabled

## 7.1.2 Node 注册

管理员可以生成注册 Token。

注册信息包括：

- Hub URL
- Token
- Node 名称
- HERMES_HOME
- 标签
- 节点描述

## 7.1.3 Node 操作

支持：

- 重新扫描 Profiles
- 查看 Node 日志
- 查看 Agent 版本
- 禁用 Node
- 删除 Node
- 重新生成 Token
- 标记维护中

---

# 7.2 Agent Fleet 总览

展示所有 Managed Agents。

字段：

- Agent 名称
- Profile 名称
- Node
- Profile Home
- Provider
- Model
- terminal.cwd
- Setup 状态
- Gateway 状态
- API Server 状态
- Sessions 数量
- Skills 数量
- Cron 数量
- 最后活动时间
- 最近错误

操作：

- 新建 Agent
- 批量 setup
- 批量 doctor
- 批量启动 Gateway
- 批量停止 Gateway
- 批量重启 Gateway
- 批量扫描
- 打开详情
- 查看日志

过滤：

- 按 Node
- 按 Profile 名称
- 按 Gateway 状态
- 按 Setup 状态
- 按 Provider / Model
- 按标签

---

# 7.3 新建 Agent / Profile

## 7.3.1 新建入口

用户点击：

```text
新建 Agent
```

第一步选择目标 Node。

第二步填写：

- Profile 名称
- Profile 描述
- 创建方式
- 来源 Profile
- 是否创建后 setup
- 是否创建后启动 Gateway
- terminal.cwd
- 标签

## 7.3.2 创建方式

支持：

```text
空白 Profile
克隆配置
克隆全部
从指定 Profile 克隆配置
从指定 Profile 克隆全部
```

## 7.3.3 创建后操作

支持：

- 仅创建
- 创建并打开 Setup
- 创建并 Quick Setup
- 创建并启动 Gateway
- 创建并进入详情页

---

# 7.4 Agent 详情

详情页 Tab：

```text
概览
基础信息
Setup
Config
Env
SOUL.md
Gateway
Sessions
Skills
Cron
Logs
操作记录
危险操作
```

## 7.4.1 概览

展示：

- Profile 路径
- Node
- Provider
- Model
- terminal.cwd
- Gateway 状态
- API Server 状态
- setup 状态
- 最近启动时间
- 最近错误
- sessions / skills / cron 统计

## 7.4.2 基础信息

支持编辑：

- 显示名称
- 描述
- 标签
- terminal.cwd
- 备注

## 7.4.3 Config

支持：

- 查看 `config.yaml`
- 可视化编辑常用字段
- 高级 YAML 编辑
- 保存前校验 YAML
- 保存后提示是否重启 Gateway

常用字段：

- model.provider
- model.model
- terminal.backend
- terminal.cwd
- gateway.enabled
- api_server.enabled
- api_server.host
- api_server.port
- memory.enabled
- approvals

## 7.4.4 Env

显示密钥状态，不显示明文。

示例：

```text
OPENAI_API_KEY         已设置
OPENROUTER_API_KEY    未设置
TELEGRAM_BOT_TOKEN    已设置
API_SERVER_KEY        已设置
```

支持：

- 新增 key
- 更新 key
- 删除 key
- 测试 key 状态

## 7.4.5 SOUL.md

支持：

- 查看
- 编辑
- 保存
- 版本历史
- 与模板对比

说明：

```text
SOUL.md 只用于 Agent 身份、语气、长期风格。
项目路径、端口、启动命令、仓库规则应放在项目 AGENTS.md。
```

## 7.4.6 Gateway

支持：

- 查看 Gateway 状态
- 启动
- 停止
- 重启
- 查看 PID
- 查看端口
- 查看 health
- 查看 gateway logs

## 7.4.7 Sessions

支持：

- 查看会话列表
- 按时间过滤
- 按平台过滤
- 按关键词搜索
- 查看会话详情

## 7.4.8 Skills

支持：

- 查看 skills 列表
- 启用 / 禁用 skill
- 安装 skill
- 删除 skill
- 跨 Agent 对比 skills

## 7.4.9 Cron

支持：

- 查看 cron jobs
- 启用 / 停用
- 手动触发
- 查看最近执行结果

## 7.4.10 Logs

支持：

- 查看 Agent 日志
- 查看 Gateway 日志
- 查看 setup 日志
- 实时 tail
- 下载日志
- 按级别过滤

---

# 7.5 Setup Center

用于集中查看哪些 Agent 需要 setup。

状态：

- ready
- needs_setup
- missing_provider
- missing_api_key
- missing_gateway_token
- setup_failed
- unknown

支持操作：

- setup all
- setup selected
- setup model
- setup terminal
- setup gateway
- setup tools
- setup agent
- quick setup
- doctor

交互式 setup 可通过 Web Terminal 执行。

---

# 7.6 Gateway Control

集中管理所有 Gateway。

展示：

- Agent
- Node
- Gateway 状态
- PID
- API Server 状态
- Port
- Health
- 最后启动时间
- 最近错误

支持：

- 启动选中
- 停止选中
- 重启选中
- 批量 health check
- 批量端口冲突检测

---

# 7.7 Logs Center

聚合所有 Node 和 Agent 日志。

日志来源：

- Hub Server 日志
- Hub Agent 日志
- Hermes Profile 日志
- Gateway 日志
- setup 任务日志
- command 执行日志

支持：

- 按 Node 过滤
- 按 Agent 过滤
- 按任务过滤
- 按级别过滤
- 按关键词搜索
- 实时滚动
- 暂停滚动
- 下载日志

---

# 7.8 Command Center

显示 Hub 下发给各 Hub Agent 的任务。

字段：

- Command ID
- 类型
- Node
- Agent
- 状态
- 创建时间
- 开始时间
- 完成时间
- 执行耗时
- stdout
- stderr
- 操作人

状态：

- pending
- dispatched
- running
- success
- failed
- timeout
- cancelled

支持：

- 查看详情
- 重试
- 取消
- 查看日志
- 查看审计

---

# 7.9 Audit Log

所有危险操作必须记录审计。

包括：

- 新建 Agent
- 删除 Agent
- 修改 config.yaml
- 修改 .env
- 修改 SOUL.md
- 启动 / 停止 Gateway
- setup
- doctor
- 删除 Node
- 更新 Hub Agent

审计字段：

- 操作人
- 时间
- IP
- Node
- Agent
- 操作类型
- 请求参数摘要
- 执行结果
- 错误信息

---

# 7.10 Web Terminal

用于交互式 setup 和调试。

支持：

- 对指定 Node 打开终端
- 对指定 Agent 设置 `HERMES_HOME`
- 执行 `hermes setup`
- 实时输入输出
- 操作审计
- 权限控制

默认禁用任意 shell，仅管理员可开启。

---

## 8. Hub Agent 功能需求

Hermes Hub Agent 是部署在被管理节点上的本地管理代理。

## 8.1 注册

启动后向 Hub 注册：

- node_id
- hostname
- os
- arch
- hermes_home
- hermes_version
- agent_version
- capabilities
- tags

## 8.2 心跳

定期上报：

- online 状态
- profiles 数量
- gateway 数量
- CPU / Memory
- 磁盘空间
- 最近错误
- 当前任务数

## 8.3 Profile 扫描

扫描：

- 默认 profile
- `profiles/*`
- Docker 模式下的 `/opt/data`

输出：

- profile_name
- profile_home
- config 摘要
- env 状态
- soul 状态
- sessions_count
- skills_count
- cron_count
- gateway 状态

## 8.4 任务执行

只执行白名单任务。

允许：

- profile.scan
- profile.create
- profile.rename
- profile.delete
- profile.setup
- profile.doctor
- config.read
- config.patch
- env.status
- env.set
- soul.read
- soul.update
- gateway.status
- gateway.start
- gateway.stop
- gateway.restart
- sessions.list
- skills.list
- cron.list
- logs.tail

禁止：

- 任意 shell
- 任意文件读取
- `.env` 明文读取
- 任意命令执行
- 任意目录删除

---

## 9. 安全需求

## 9.1 认证

- Hub WebUI 必须登录
- Hub Agent 注册必须使用 Token
- Token 可撤销
- Token 可过期
- Token 可绑定 Node 标签或来源

## 9.2 权限

角色：

- Admin
- Operator
- Viewer

权限：

- 查看 Agent
- 编辑 Config
- 编辑 Env
- 编辑 SOUL
- 执行 setup
- 控制 Gateway
- 使用 Web Terminal
- 删除 Agent
- 管理 Node

## 9.3 Secret 保护

- 不向前端返回 `.env` 明文
- 密钥字段默认脱敏
- 命令日志自动脱敏
- 审计日志不记录明文密钥
- 支持 secrets backend 扩展

## 9.4 命令白名单

Hub Agent 不支持远程任意 shell。

所有任务必须是声明式 command type。

## 9.5 网络安全

- Hub Agent 主动连接 Hub
- 默认不开放 Hub Agent 入站端口
- 支持 HTTPS
- 支持 mTLS 作为后续增强
- 支持反向代理部署

---

## 10. 部署需求

## 10.1 Hub Server

支持：

- Docker Compose
- 单机部署
- 反向代理
- SQLite / PostgreSQL

## 10.2 Hub Agent

支持：

- Linux systemd
- macOS launchd
- Docker sidecar
- Docker baked-in image
- Windows / WSL 后续支持

## 10.3 Docker 场景

推荐：

```text
一个 Docker 容器 = 一个 Hermes Agent 实例
```

容器内：

```text
HERMES_HOME=/opt/data
```

Hub Agent 可与 Hermes Agent 同容器运行，或作为 sidecar 管理同一个 volume。

---

## 11. 第一阶段交付范围

第一阶段目标：跑通 Controller-Agent 架构。

必须交付：

- Hub Server
- Hub WebUI
- Hub Agent
- Node 注册
- Node 心跳
- Profile 扫描
- Agent Fleet 总览
- 新建 Profile
- 编辑 SOUL.md
- 查看 Config
- Env 状态
- Gateway start / stop / restart
- Setup 命令执行
- 日志查看
- Command Center
- 基础审计

暂不交付：

- Connector plugin hooks
- 完整 sessions 搜索
- 完整 skills 管理
- 完整 cron 管理
- 多租户组织权限
- mTLS
- Kubernetes Operator

---

## 12. 参考依据

- Hermes Profiles：Profile 是独立 Hermes home directory，包含 config、env、SOUL、sessions、memory、skills、cron、gateway state。
- Hermes Docker：容器中用户数据挂载在 `/opt/data`，gateway 可通过 `gateway run` 运行。
- Hermes Hooks：Hooks 和 Plugin hooks 可用于事件观测，但不作为核心常驻管理服务。

参考链接：

- https://hermes-agent.nousresearch.com/docs/user-guide/profiles/
- https://hermes-agent.nousresearch.com/docs/user-guide/docker/
- https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks/
