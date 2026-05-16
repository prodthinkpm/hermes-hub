# Hermes Hub  PRD v1.5

## 1. 文档信息

| 字段 | 内容 |
|---|---|
| 文档名称 | Hermes Hub 产品需求文档 |
| 产品名称 | Hermes Hub |
| 中文名 | Hermes 中枢 / Hermes 管理中心 |
| 文档版本 | v1.5 |
| 文档类型 | PRD |
| 目标阶段 | Alpha 前产品定义与验收口径 |
| 适用对象 | 产品、前端、后端、Codex 执行、测试、内测用户 |
| 核心技术路线 | Node.js CLI + 本地 Fastify Server + React + Material UI + Hermes Runtime Adapter |
| 分发目标 | `npx hermes-hub` |
| 默认访问地址 | `http://127.0.0.1:8899` |
| 默认安全策略 | 本地优先，默认仅监听 `127.0.0.1` |

---

## 2. 背景与问题

### 2.1 背景

Hermes Agent 支持 Profile 机制，用户可以维护多个不同用途的 Agent。随着 Profile 数量增加，Profile、`config.yaml`、`SOUL.md`、Gateway、Logs、备份和运行状态会分散在本地目录与 CLI 操作中，管理成本逐渐升高。

Hermes Hub 的目标是把这些分散能力整合成一个本地优先的可视化控制台。

### 2.2 关键问题

| 问题 | 影响 |
|---|---|
| 多个 Profile 分散管理 | 用户不知道本机有哪些 Agent，也不知道配置是否完整 |
| 新增 / 克隆 Profile 麻烦 | 需要手动复制目录、配置文件和 SOUL.md，容易出错 |
| 修改配置风险高 | YAML 写错、误保存、密钥覆盖、无备份 |
| SOUL.md 管理不直观 | Agent 身份文件缺失、为空或修改困难 |
| Gateway 状态不清楚 | 不知道某个 Profile 是否正在运行 |
| 日志查看分散 | 排查错误需要手动找日志目录 |
| 健康问题不可见 | 用户不知道 Profile 为什么不可用 |
| UI 产品感不足 | 简单表格页无法承载后续 Gateway、Logs、Health、Templates 等能力 |

### 2.3 产品机会

Hermes Hub 可以把原本分散的 CLI、目录、配置文件、Gateway 和日志管理抽象为统一流程：

```text
启动 Hub → 扫描 Profile → 查看状态 → 编辑配置 → 管理 Gateway → 查看日志 → 诊断问题
```

---

## 3. 产品定位与目标用户

### 3.1 产品定位

**Hermes Hub 是用于统一管理多个 Hermes Agent Profile 的本地开发者控制台。**

它不是传统“多进程监控面板”，而是围绕 Hermes Agent Profile 的本地状态目录和配置文件建立的可视化管理中心。

### 3.2 目标用户

| 用户类型 | 核心需求 |
|---|---|
| Hermes Agent 重度用户 | 统一查看和管理多个 Profile |
| AI Agent 开发者 | 快速创建、克隆、调试不同用途 Agent |
| 本地工具开发者 | 通过 UI 管理配置、日志、Gateway |
| 自动化 / 运维用户 | 关注 Gateway、Logs、健康状态和错误定位 |
| 新手用户 | 不熟悉 HERMES_HOME、Profile 和 SOUL.md，需要可视化引导 |

---

## 4. 产品目标

### 4.1 业务目标

| 目标 | 描述 |
|---|---|
| 降低多 Profile 管理成本 | 用户无需频繁手工切目录、复制文件、执行命令 |
| 降低配置修改风险 | 保存前校验、备份、原子写入、密钥脱敏 |
| 提高 Agent 可用性 | Profile、Gateway、Logs、Health 状态统一可见 |
| 提高新用户上手效率 | 通过 `npx hermes-hub` 快速启动本地管理后台 |
| 建立后续扩展基础 | 支持 Doctor、Diff、回滚、MCP、Skills、Cron、Alpha 发布 |

### 4.2 产品目标

1. 用户可通过 `npx hermes-hub` 启动本地 Web 控制台。
2. 系统可探测 Hermes CLI、版本和 HERMES_HOME。
3. 用户可查看本机所有 Hermes Profile。
4. 用户可安全编辑 `config.yaml` 和 `SOUL.md`。
5. 系统在保存前自动备份，并在保存失败时不破坏原文件。
6. 用户可创建、克隆、导入 Profile。
7. 用户可查看 Gateway 状态并执行基础启停。
8. 用户可查看基础 Logs。
9. 用户可查看 Profile 的 Config / Runtime / Health 状态。
10. 后续可扩展 Health Check、Diff、版本历史、MCP、Skills、Cron。

---

## 5. 核心用户路径

### 5.1 启动路径

```text
用户执行 npx hermes-hub
  ↓
CLI 启动本地 Server
  ↓
默认监听 127.0.0.1
  ↓
自动打开浏览器
  ↓
进入 Hermes Hub
```

### 5.2 Profile 查看路径

```text
进入 Hermes Hub
  ↓
系统探测 Hermes CLI / HERMES_HOME
  ↓
扫描 Profiles
  ↓
展示 Profiles List
  ↓
用户查看 Config / SOUL / Runtime / Health 状态
```

### 5.3 配置编辑路径

```text
进入 Profile Detail
  ↓
打开 config.yaml
  ↓
编辑 YAML
  ↓
YAML 校验
  ↓
保存前自动备份
  ↓
原子写入
  ↓
展示保存结果和备份路径
```

### 5.4 SOUL.md 编辑路径

```text
进入 Profile Detail
  ↓
打开 SOUL.md
  ↓
编辑 Markdown
  ↓
空内容校验 / 提示
  ↓
保存前自动备份
  ↓
保存成功
```

### 5.5 Profile 创建 / 克隆 / 导入路径

```text
New Profile / Clone / Import
  ↓
填写基础信息或选择来源
  ↓
生成或注册 Profile
  ↓
回到 Profile List
  ↓
进入 Profile Detail 继续配置
```

### 5.6 Gateway / Logs 路径

```text
进入 Profile Detail
  ↓
查看 Gateway 状态
  ↓
执行 Start / Stop
  ↓
查看基础 Logs
```

### 5.7 Health Check 路径

```text
进入 Profile Detail
  ↓
点击 Run Check
  ↓
检查 CLI / HERMES_HOME / config / SOUL / Gateway / Logs / Backups
  ↓
展示问题和修复建议
```

---

## 6. 功能需求

## 6.1 CLI 启动

### 功能说明

Hermes Hub 通过 Node.js CLI 启动本地服务。

### 需求清单

| 功能 | 描述 |
|---|---|
| `hermes-hub` | 启动本地服务 |
| `--port` | 指定端口，默认 8899 |
| `--host` | 指定 host，默认 127.0.0.1 |
| `--no-open` | 启动后不自动打开浏览器 |
| `--mock` | 使用 mock HERMES_HOME |
| 端口冲突处理 | 自动选择可用端口 |
| 安全提示 | 使用 `0.0.0.0` 时提示风险 |

### 验收标准

1. 默认启动成功。
2. 默认绑定 `127.0.0.1`。
3. `--no-open` 生效。
4. 端口冲突可自动切换。
5. `/health` 可访问。

---

## 6.2 Runtime 探测

### 需求清单

| 功能 | 描述 |
|---|---|
| Hermes CLI 探测 | 检测是否存在 hermes 命令 |
| Hermes 版本探测 | 执行 `hermes --version` |
| HERMES_HOME 探测 | 支持 CLI 参数、`hermes config home`、环境变量、fallback |
| Runtime Rescan | 手动重新扫描 |

### 验收标准

1. 能展示 Hermes CLI version。
2. 能展示 HERMES_HOME。
3. CLI 不存在时不崩溃。
4. HERMES_HOME 不存在时有明确提示。

---

## 6.3 Profile List

### 需求清单

| 功能 | 描述 |
|---|---|
| Profile 扫描 | 扫描 HERMES_HOME 与 profiles 子目录 |
| Profile 表格 | 展示 Name、HERMES_HOME、Config、SOUL、Runtime、Health、Last Updated |
| Summary Cards | Total、Ready、Missing SOUL、Runtime Unknown、Last Scan |
| 操作区 | New Profile、Import、Rescan |
| 状态 Chip | Config / SOUL / Runtime / Health 分开展示 |

### 状态模型

#### Config Status

| 状态 | 含义 |
|---|---|
| ready | 配置存在且基础有效 |
| incomplete | 缺少配置或 SOUL |
| invalid | YAML 无效 |
| permission_error | 权限错误 |
| unknown | 无法判断 |

#### Runtime Status

| 状态 | 含义 |
|---|---|
| running | 已确认运行 |
| stopped | 已确认停止 |
| degraded | 运行异常 |
| unknown | 无法判断 |

#### Health Status

| 状态 | 含义 |
|---|---|
| healthy | 健康 |
| warning | 存在警告 |
| error | 存在错误 |
| unknown | 未检查 |

### 验收标准

1. 有 App Shell、Sidebar、Page Header。
2. 有 Runtime Status Card。
3. 有 Summary Cards。
4. Profile Table 使用 MUI 风格。
5. Config / Runtime / Health 分开展示。
6. Runtime 无法判断时展示 Unknown，不能默认 Stopped。

---

## 6.4 Profile Detail

### 需求清单

1. 展示 Profile 基础信息。
2. 展示 HERMES_HOME。
3. 展示 config.yaml 路径、状态、更新时间。
4. 展示 SOUL.md 路径、状态、更新时间。
5. 展示 Gateway 状态。
6. 展示 Logs 入口。
7. 展示 Health Summary。

### 验收标准

1. 从 Profile List 可进入 Detail。
2. 配置解析失败不导致页面崩溃。
3. 缺少 SOUL.md 时有明确提示。
4. Gateway / Logs / Health 入口可访问。

---

## 6.5 config.yaml 编辑

### 需求清单

| 功能 | 描述 |
|---|---|
| 查看完整内容 | 可查看当前 YAML |
| 编辑 | 使用 textarea，后续升级 Monaco |
| 校验 | 保存前 YAML 校验 |
| 保存 | 保存前自动备份 |
| 原子写入 | 临时文件 + rename |
| 错误提示 | YAML 错误、权限错误、保存失败 |
| 脱敏保护 | 阻止脱敏占位符写回敏感字段 |

### 验收标准

1. 合法 YAML 可保存。
2. 非法 YAML 阻止保存。
3. 保存前生成备份。
4. 保存失败不破坏原文件。
5. 保存成功显示备份路径。

---

## 6.6 SOUL.md 编辑

### 需求清单

1. 查看 SOUL.md。
2. 编辑 SOUL.md。
3. 不存在时允许创建并提示。
4. 空内容阻止或强警告。
5. 保存前备份。
6. 保存成功显示结果。

### 验收标准

1. 可保存 SOUL.md。
2. 不存在时可创建。
3. 空内容有明确处理。
4. 保存失败不破坏原文件。

---

## 6.7 Create / Clone / Import Profile

### Create Profile

| 功能 | 描述 |
|---|---|
| New Profile | 新建 Profile |
| 基础信息 | 名称、路径、配置 |
| SOUL 初始内容 | 可填写或使用默认 |
| 创建结果 | 创建后进入列表或详情 |

### Clone Profile

| 功能 | 描述 |
|---|---|
| Clone | 从已有 Profile 克隆 |
| 安全策略 | 默认不复制 `.env`、auth、sessions、logs |
| 命名 | 新 Profile 名称不可冲突 |

### Import Profile

| 功能 | 描述 |
|---|---|
| Import | 导入已有目录 |
| 校验 | 检查 config / SOUL 状态 |
| 结果 | 加入 Profile List |

---

## 6.8 Gateway

### 需求清单

1. 查看 Gateway 状态。
2. Start Gateway。
3. Stop Gateway。
4. 显示执行结果。
5. 执行失败时显示错误。

### 验收标准

1. Gateway status 可展示。
2. Start / Stop 可触发。
3. 不误杀非 Hermes 进程。
4. 错误状态可读。

---

## 6.9 Logs

### 需求清单

1. 基础 Logs viewer。
2. 查看最近日志。
3. 错误状态提示。
4. 不做实时日志流。

### 验收标准

1. Logs 页面可访问。
2. 日志为空时有空状态。
3. 日志读取失败有错误提示。

---

## 6.10 Health Check

### 需求清单

| 检查项 | 描述 |
|---|---|
| Hermes CLI | 是否存在 |
| HERMES_HOME | 是否存在、可读、可写 |
| Profile 目录 | 是否存在、可读、可写 |
| config.yaml | 是否存在、YAML 是否有效 |
| SOUL.md | 是否存在、是否为空 |
| Gateway | 状态是否可探测 |
| Logs | 是否存在 |
| Backups | 备份目录是否可写 |
| 密钥风险 | 是否存在脱敏占位符写回风险 |

### 输出字段

```text
id
profileId
checkType
status: pass / warn / fail / unknown
severity: info / warning / error
message
suggestion
details
checkedAt
```

### 验收标准

1. 可运行检查。
2. 可看到 warning / error。
3. 每个问题有建议。
4. 不自动修复。
5. 不修改任何文件。

---

## 7. 非功能需求

### 7.1 性能

| 项目 | 要求 |
|---|---|
| 启动时间 | 本地启动尽量小于 3 秒 |
| Profile 扫描 | 20 个 Profile 内尽量小于 2 秒 |
| 页面响应 | 主操作反馈小于 1 秒 |
| 日志读取 | 基础日志读取不阻塞页面 |

### 7.2 安全

1. 默认只监听 `127.0.0.1`。
2. 使用 `0.0.0.0` 时必须提示风险。
3. 不上传用户数据。
4. 不默认联网。
5. API 响应摘要不明文暴露密钥。
6. 保存前自动备份。
7. 写入失败不破坏原文件。
8. 不将脱敏占位符写回敏感字段。
9. 删除、回滚等危险操作必须二次确认。

### 7.3 兼容性

| 项目 | 要求 |
|---|---|
| Node.js | >= 20 |
| OS | macOS / Linux 优先，Windows best effort |
| 浏览器 | Chrome / Edge / Safari 最新版 |
| Hermes CLI | 通过 Runtime Adapter 兼容命令差异 |

### 7.4 可维护性

1. 前端使用 React + Material UI。
2. 后端 Runtime Adapter 与 Server API 解耦。
3. shared types 统一前后端类型。
4. 所有 API 使用统一 ApiResponse。
5. 每个阶段通过小 PR 递进。

---

## 8. 数据埋点

Hermes Hub 是本地优先工具，默认不上传数据。埋点优先采用本地事件日志。后续如需远程遥测，必须用户显式同意。

### 8.1 本地事件

| 事件 | 触发时机 | 字段 |
|---|---|---|
| app_started | Hub 启动 | version、mode、host、port |
| runtime_detected | Runtime 探测完成 | cliFound、homeFound、source |
| profiles_scanned | Profile 扫描完成 | count、duration、errorCount |
| profile_opened | 打开 Profile Detail | profileIdHash |
| config_validated | YAML 校验 | valid、errorCount |
| config_saved | 保存 config.yaml | success、hasBackup |
| soul_saved | 保存 SOUL.md | success、hasBackup |
| profile_created | 创建 Profile | success |
| profile_cloned | 克隆 Profile | success |
| profile_imported | 导入 Profile | success |
| gateway_action | Gateway 操作 | action、success |
| logs_viewed | 查看 Logs | success |
| health_check_run | 运行 Health Check | status、issueCount |
| error_shown | 显示错误 | code、surface |

### 8.2 数据原则

1. 不记录 config.yaml / SOUL.md 原文。
2. 不记录 API Key / Token。
3. 不记录敏感日志内容。
4. 本地日志可关闭。
5. 远程遥测必须 opt-in。

---

## 9. 权限与异常处理

### 9.1 权限模型

Alpha 阶段不做多用户权限，默认本机用户即管理员。

后续可扩展权限：

| 权限 | 说明 |
|---|---|
| read_profile | 查看 Profile |
| edit_config | 编辑 config.yaml |
| edit_soul | 编辑 SOUL.md |
| manage_gateway | 启停 Gateway |
| view_logs | 查看日志 |
| run_health_check | 运行诊断 |
| restore_backup | 从备份回滚 |

### 9.2 文件权限异常

| 异常 | 处理 |
|---|---|
| HERMES_HOME 不存在 | 提示设置路径或 Import |
| Profile 不存在 | 重新扫描或移除无效项 |
| config.yaml 不可读 | 显示权限错误 |
| config.yaml 不可写 | 禁用保存 |
| SOUL.md 不存在 | 允许创建并提示 |
| 备份目录不可写 | 阻止保存 |
| 原子写入失败 | 删除临时文件，保留原文件 |

### 9.3 Runtime 异常

| 异常 | 处理 |
|---|---|
| Hermes CLI 不存在 | 显示安装提示，不阻塞 mock 模式 |
| version 探测失败 | 显示 unknown，不崩溃 |
| `hermes config home` 失败 | fallback 到 env / 默认路径 |
| Gateway 命令失败 | 显示错误和日志线索 |
| Logs 不存在 | 展示空状态或提示路径 |

### 9.4 保存异常

保存必须满足：

1. 校验失败不保存。
2. 备份失败不保存。
3. 写入失败不破坏原文件。
4. 成功后返回备份路径。
5. 失败时提供 message 和 suggestion。

---

## 10. 验收标准

### 10.1 MVP 验收

1. `npx hermes-hub` 可启动。
2. 默认监听 `127.0.0.1`。
3. Web UI 可打开。
4. Runtime 信息可展示。
5. Profile 列表可展示。
6. 可进入 Profile Detail。
7. 可编辑并保存 `config.yaml`。
8. 非法 YAML 阻止保存。
9. 可编辑并保存 `SOUL.md`。
10. 保存前创建备份。
11. 保存失败不破坏原文件。
12. API 和 UI 摘要不暴露明显密钥。

### 10.2 P1 验收

1. 可创建 Profile。
2. 可克隆 Profile。
3. 克隆默认不复制敏感文件。
4. 可导入 Profile。
5. 列表刷新后展示新 Profile。

### 10.3 P2 验收

1. Gateway 状态可展示。
2. Gateway start / stop 可执行。
3. 基础 Logs 可查看。
4. Gateway / Logs 错误可读。
5. README 与当前能力一致。

### 10.4 UI 验收

1. 使用 React + Material UI。
2. 有 App Shell。
3. 有 Sidebar。
4. 有 Page Header。
5. 有 Summary Cards。
6. Profile Table 使用 MUI 风格。
7. Config / Runtime / Health 状态分开。
8. 深色主题一致。
9. 不是简单 demo 表格页。

### 10.5 P3 验收

1. Health Check API 可运行。
2. Profile List / Detail 可展示 Health Summary。
3. 常见问题有 suggestion。
4. 不做一键修复。
5. 不自动修改文件。

### 10.6 Alpha 验收

1. `pnpm build` 通过。
2. `pnpm typecheck` 通过。
3. npm pack 通过。
4. npx 本地验证通过。
5. Demo Mode 可用。
6. README 完整。
7. manual test checklist 完整。
8. Known Limitations 与当前功能一致。

---

## 11. 上线计划

### 11.1 阶段计划

| 阶段 | 目标 | 状态 |
|---|---|---|
| PR1-PR8 | MVP 最小安全编辑闭环 | 已完成 |
| PR9-PR11 | MVP 联调、README、mock | 已完成 |
| PR12-PR14 | Create / Clone / Import | 已完成 |
| PR15-PR17 | Gateway / Logs | 已完成 |
| PR18 | React + MUI 技术栈统一 | 已完成 |
| PR19 | UI Shell 与 Profiles 页面重构 | 下一步 |
| PR20 | P3 前置收尾检查 | 待做 |
| PR21-PR23 | Doctor / Health Check | 待做 |
| PR24-PR29 | 配置体验增强 | 待做 |
| PR30-PR33 | MCP / Skills / Cron | 待做 |
| PR34-PR38 | npm/npx Alpha 发布 | 待做 |

### 11.2 Alpha 发布前必须完成

1. PR19 UI 达标。
2. PR20 build/typecheck 通过。
3. README 更新。
4. Known Limitations 正确。
5. Health Check 基础能力完成。
6. Demo Mode 可用。
7. npm pack 验证。
8. npx 本地安装验证。
9. Alpha release checklist 完成。

### 11.3 内测计划

| 阶段 | 内容 |
|---|---|
| 内部自测 | 使用 mock 和真实 Hermes Profile 验证 |
| 小范围内测 | 3~5 个 Hermes 用户 |
| 反馈收集 | 启动、扫描、编辑、Gateway、Logs、Health |
| 修复迭代 | 只修核心问题，不扩范围 |
| Alpha 发布 | 通过 npm/npx 提供试用 |

---

## 12. 风险与应对

### 12.1 Hermes CLI 命令差异

| 风险 | 应对 |
|---|---|
| 不同版本命令不同 | Runtime Adapter 封装 |
| 输出格式不稳定 | 优先结构化输出，失败则 fallback |
| profile 路径差异 | 支持手动 Import 和 mock |

### 12.2 文件写入风险

| 风险 | 应对 |
|---|---|
| 保存破坏配置 | 保存前备份、原子写入 |
| YAML 无效 | 保存前校验 |
| 备份失败 | 阻止保存 |
| 权限不足 | 禁用保存并提示 |

### 12.3 密钥泄露风险

| 风险 | 应对 |
|---|---|
| API Key 明文展示 | 摘要脱敏 |
| 脱敏占位符写回 | 保存前检测并阻止 |
| 日志泄露 | 日志展示脱敏，后续增强 |

### 12.4 Gateway 风险

| 风险 | 应对 |
|---|---|
| 误杀非 Hermes 进程 | 只操作确认归属的 Gateway |
| 状态不准确 | Runtime Status 可为 unknown |
| 命令失败 | 错误提示和日志线索 |

### 12.5 UI 体验风险

| 风险 | 应对 |
|---|---|
| MUI 接入但界面仍像 demo | PR19 UI Shell 重构 |
| 状态表达混乱 | Config / Runtime / Health 分层 |
| 功能堆叠 | App Shell + Sidebar + Summary Cards |

### 12.6 范围膨胀风险

| 风险 | 应对 |
|---|---|
| 过早做 MCP / Skills / Cron | 放到 P5 |
| 过早做 AI 智能排障 | Alpha 前不做 |
| 过早做 Electron / Tauri | Alpha 前不做 |
| 过早做多用户权限 | Alpha 前不做 |

---

## 13. 附录：PR 路线图

```text
PR19：UI Shell 与 Profiles 页面重构
PR20：P3 前置收尾检查
PR21：Health Check 规则引擎
PR22：Profile Health Summary
PR23：常见问题修复建议
PR24：保存前 Diff UI
PR25：配置版本历史与备份浏览
PR26：从备份回滚
PR27：Monaco Editor 接入
PR28：基础表单配置
PR29：SOUL 模板
PR30：MCP Server 列表与状态
PR31：MCP 配置编辑与连接测试
PR32：Skills 列表与权限风险
PR33：Cron 任务列表
PR34：npm package files 与 bin 验证
PR35：npx 安装体验测试
PR36：hermes-hub --version / doctor
PR37：Demo Mode
PR38：Alpha Release Checklist
```

---

## 14. 一句话总结

Hermes Hub 是一个本地优先的 Hermes Agent Profile 管理中心，通过 `npx hermes-hub` 启动，帮助用户统一管理 Profile、配置、SOUL、Gateway、Logs 和健康状态，让多个 Hermes Agent 的创建、修改、运行和排障从分散手工操作变成可视化、安全、可追踪的标准流程。
