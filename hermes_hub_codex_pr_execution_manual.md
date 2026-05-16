# Hermes Hub MVP Codex PR 执行手册

> 用途：把 Hermes Hub MVP 的所有 PR 拆分、实现指令和自检指令整理成一份可直接交给 Codex 执行的文档。
>
> 规则：每次只执行一个 PR；每个 PR 完成后先跑自检；自检通过后再进入下一个 PR。
>
> 范围：PR1 ~ PR8，另附前置 Runtime Research 与 MVP 收尾任务。
>
> 产品：Hermes Hub。
>
> MVP 目标：通过 `npx hermes-hub` 启动本地管理后台，扫描已有 Hermes Profile，查看并安全编辑 `config.yaml` 与 `SOUL.md`。

---

## 0. 全局执行原则

Codex 每次执行必须遵守：

1. 每次只做一个 PR 级别任务。
2. 不允许一次性实现多个 PR。
3. 不允许主动扩大范围。
4. 不允许实现“暂不实现清单”里的功能。
5. 每个 PR 完成后必须输出：修改文件列表、新增依赖列表、实现说明、运行过的命令、验证结果、已知问题、是否严格未触碰非本 PR 范围。
6. 每个 PR 完成后先执行自检指令，不要直接进入下一个 PR。
7. 涉及文件写入的 PR，必须说明备份、失败回滚和安全策略。
8. 如果发现 PRD、当前代码和本手册冲突，先停止并说明冲突，不要自行猜测。

MVP 期间明确不要实现：

```text
创建 Profile 向导
Profile 克隆
Profile 删除
Gateway 启动 / 停止 / 重启
Gateway service 管理
实时日志流
Doctor Health Center
Skills 管理
MCP 管理
Cron 管理
模板系统
配置版本历史 UI
Diff UI
回滚 UI
智能排障
一键修复
资源监控大盘
多用户权限
多节点管理
Electron / Tauri
SQLite / better-sqlite3
Monaco Editor
```

---

## 1. 前置任务：Hermes Runtime Research

这个任务不是代码 PR，但建议在 PR4 前完成。目标是确认真实 Hermes CLI 命令和目录结构，避免 Runtime Adapter 返工。

### 1.1 实现指令

```text
请执行 Hermes Runtime Research。

目标：
确认当前开发环境中的 Hermes CLI 命令、HERMES_HOME 语义和 Profile 目录结构，为 PR4 Runtime Adapter detect 和 PR5 Profile 扫描提供依据。

要求：
1. 只做调研，不修改业务代码。
2. 可以创建 docs/research/hermes-cli-research.md。
3. 记录每条命令的完整输出。
4. 如果某条命令不存在或失败，也要记录错误。
5. 不要实现 Runtime Adapter。
6. 不要实现 Profile 扫描。
7. 不要实现 Web UI。

需要执行并记录的命令：

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

建议输出到：

docs/research/hermes-cli-research.md

请在文档中总结：
1. hermes CLI 是否存在
2. hermes 版本
3. hermes profile list 是否可用
4. hermes config home 返回含义
5. HERMES_HOME 的真实位置
6. Profile 是多目录结构还是单目录 registry
7. config.yaml 与 SOUL.md 的真实路径
8. 后续 Runtime Adapter 的建议探测顺序
9. 未确认或有风险的问题

输出要求：
完成后请输出：执行过的命令、生成或修改的文件、关键发现、风险与待确认项、是否建议进入 PR4。
```

### 1.2 自检指令

```text
请检查 Hermes Runtime Research 是否完成。

检查项：
1. 是否记录了 which hermes
2. 是否记录了 hermes --version
3. 是否记录了 hermes --help
4. 是否记录了 hermes profile --help
5. 是否记录了 hermes profile list
6. 是否记录了 hermes config --help
7. 是否记录了 hermes config home
8. 是否记录了 hermes doctor --help
9. 是否记录了 hermes gateway --help
10. 是否记录了 hermes logs --help
11. 是否说明 HERMES_HOME 的真实语义
12. 是否说明 Profile 目录结构
13. 是否说明 config.yaml 与 SOUL.md 的位置
14. 是否没有实现 Runtime Adapter、Profile 扫描或 UI 业务
15. 是否没有修改非调研相关代码

请输出：检查结果、发现的问题、是否建议进入 PR4。
```

---

# PR1：初始化 pnpm workspace 与 TypeScript 包边界

## PR1 实现指令

```text
请执行 PR1：初始化 pnpm workspace 与 TypeScript 包边界。

目标：
搭建 Hermes Hub MVP 的基础工程骨架。

要求：
1. 只做工程骨架，不实现业务逻辑。
2. 新增根 package.json。
3. 新增 pnpm-workspace.yaml。
4. 新增 tsconfig.base.json。
5. 新增 packages/cli。
6. 新增 packages/server。
7. 新增 packages/web。
8. 新增 packages/core。
9. 新增 packages/shared。
10. 每个 package 只放最小 package.json、tsconfig.json、src/index.ts。
11. 可以配置基础 build/typecheck/dev 脚本。
12. 不实现 Runtime Adapter。
13. 不实现 Profile 扫描。
14. 不实现 Web UI 页面。
15. 不实现 Config / SOUL 编辑。
16. 不安装非必要业务依赖。
17. 不引入 SQLite、Monaco、Gateway、Doctor、MCP、Cron。

推荐目录结构：

hermes-hub
├─ package.json
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ packages
│  ├─ cli
│  │  ├─ package.json
│  │  ├─ tsconfig.json
│  │  └─ src/index.ts
│  ├─ server
│  │  ├─ package.json
│  │  ├─ tsconfig.json
│  │  └─ src/index.ts
│  ├─ web
│  │  ├─ package.json
│  │  ├─ tsconfig.json
│  │  └─ src/index.ts
│  ├─ core
│  │  ├─ package.json
│  │  ├─ tsconfig.json
│  │  └─ src/index.ts
│  └─ shared
│     ├─ package.json
│     ├─ tsconfig.json
│     └─ src/index.ts

验收命令建议：
1. pnpm install
2. pnpm build 或 pnpm typecheck

输出要求：
完成后请输出：修改文件列表、新增依赖列表、实现说明、运行过的命令、验证结果、是否严格未触碰非 PR1 范围。
```

## PR1 自检指令

```text
请检查 PR1 是否符合要求。

检查项：
1. 根目录是否存在 package.json
2. 根目录是否存在 pnpm-workspace.yaml
3. 根目录是否存在 tsconfig.base.json
4. 是否存在 packages/cli
5. 是否存在 packages/server
6. 是否存在 packages/web
7. 是否存在 packages/core
8. 是否存在 packages/shared
9. 每个 package 是否有 package.json
10. 每个 package 是否有 tsconfig.json
11. 每个 package 是否有 src/index.ts
12. 是否没有实现 Runtime Adapter
13. 是否没有实现 Profile 扫描
14. 是否没有实现 UI 页面业务
15. 是否没有实现 Config / SOUL 编辑
16. 是否没有引入 SQLite
17. 是否没有引入 Monaco
18. 是否没有实现 Gateway、Doctor、MCP、Cron 等非 MVP 功能
19. pnpm install 是否成功
20. pnpm build 或 pnpm typecheck 是否成功

请输出：检查结果、问题列表、建议修复项、是否建议进入 PR2。
不要继续实现 PR2。
```

---

# PR2：实现 CLI + Fastify 本地启动闭环

## PR2 实现指令

```text
请执行 PR2：实现 CLI + Fastify 本地启动闭环。

背景：
Hermes Hub MVP 当前已完成 PR1 工程骨架。现在只做 PR2，不要实现 Runtime Adapter、Profile 扫描、Config 编辑、SOUL 编辑、UI 页面业务逻辑。

目标：
实现用户可以通过 CLI 启动本地 Hermes Hub Server，并自动打开浏览器。

范围：
1. 在 packages/cli 中实现 hermes-hub 启动入口
2. 支持参数：--port，默认 8899；--host，默认 127.0.0.1；--no-open，启动后不自动打开浏览器
3. 默认监听 127.0.0.1，不允许默认使用 0.0.0.0
4. 如果用户传入 --host 0.0.0.0，需要在终端输出安全风险提示
5. 端口被占用时，自动寻找下一个可用端口
6. 在 packages/server 中实现最小 Fastify Server
7. 提供 GET /health API，返回 ok、name、version、timestamp
8. Server 启动后，CLI 输出访问地址，例如 Hermes Hub is running at http://127.0.0.1:8899
9. 默认自动打开浏览器访问该地址
10. 如果传入 --no-open，则只输出地址，不打开浏览器

限制：
1. 不要实现 /api/runtime
2. 不要实现 Hermes CLI 探测
3. 不要实现 HERMES_HOME 探测
4. 不要实现 Profile 扫描
5. 不要实现 Web UI 页面
6. 不要引入 SQLite
7. 不要引入 Monaco
8. 不要做 Gateway / Logs / Doctor / Skills / MCP / Cron
9. 不要扩大 PR2 范围

建议依赖：commander、fastify、open、get-port 或自实现端口检测。

验收命令建议：
1. pnpm install
2. pnpm build 或 pnpm typecheck
3. pnpm --filter @hermes-hub/cli dev -- --no-open
4. pnpm --filter @hermes-hub/cli dev -- --port 8899 --no-open
5. curl http://127.0.0.1:8899/health
6. 占用 8899 后再次启动，确认自动切换端口

输出要求：
完成后请输出：修改文件列表、新增依赖列表、实现说明、运行过的命令、验证结果、尚未完成事项、是否严格未触碰非 PR2 范围。
```

## PR2 自检指令

```text
请检查 PR2 是否符合要求。

检查项：
1. CLI 是否支持 --port、--host、--no-open
2. 默认 host 是否为 127.0.0.1
3. 用户传入 --host 0.0.0.0 时是否输出安全风险提示
4. 端口 8899 被占用时是否自动选择下一个可用端口
5. Server 是否基于 Fastify 启动
6. GET /health 是否返回 ok、name、version、timestamp
7. 默认是否会打开浏览器
8. --no-open 是否不会打开浏览器
9. 是否没有实现 /api/runtime
10. 是否没有实现 Hermes CLI 探测
11. 是否没有实现 HERMES_HOME 探测
12. 是否没有实现 Profile 扫描
13. 是否没有实现 Config / SOUL 编辑
14. 是否没有引入 SQLite、Monaco、Gateway、Logs、Doctor、Skills、MCP、Cron

请输出：检查结果、运行过的命令、发现的问题、是否建议进入 PR3。
不要继续实现 PR3。
```

---

# PR3：实现 Shared Types 与 API 错误模型

## PR3 实现指令

```text
请执行 PR3：实现 Shared Types 与 API 错误模型。

背景：
Hermes Hub 已完成 PR1 工程骨架和 PR2 CLI + Fastify 本地启动闭环。现在只做 PR3，不要实现 Runtime Adapter detect、Profile 扫描、Config 编辑、SOUL 编辑或 Web UI 业务页面。

目标：
建立前后端共享的数据类型、API 响应格式和错误模型，为后续 /api/runtime、/api/profiles、config、soul 接口打基础。

范围：
1. 在 packages/shared 中定义共享类型
2. 在 packages/server 中接入统一 API 错误模型
3. 更新 /health 的返回结构，使其符合统一 API 响应风格，但不要改变 PR2 的核心行为
4. 增加最小测试或类型检查，确保 shared 类型可以被 server / cli / web 引用

需要定义的类型至少包括：
1. 通用 API 响应：ApiSuccess<T>、ApiFailure、ApiResponse<T>、ApiErrorCode、ApiError
2. Runtime 类型：RuntimeInfo、HermesCliInfo、HermesHomeInfo
3. Profile 类型：ProfileSummary、ProfileDetail、ProfileFileStatus、ProfileHealthStatus
4. 文件编辑类型：EditableFileType、EditableFileResult、ValidateFileRequest、ValidateFileResponse、SaveFileRequest、SaveFileResponse、BackupInfo
5. 错误码：UNKNOWN_ERROR、VALIDATION_ERROR、NOT_FOUND、PERMISSION_DENIED、FILE_READ_FAILED、FILE_WRITE_FAILED、YAML_INVALID、HERMES_CLI_NOT_FOUND、HERMES_HOME_NOT_FOUND、PROFILE_NOT_FOUND、UNSAFE_HOST_WARNING

统一 API 响应格式：
成功：{ "ok": true, "data": ... }
失败：{ "ok": false, "error": { "code": "ERROR_CODE", "message": "Human readable message", "details": {}, "suggestion": "Optional next action" } }

要求：
1. shared 包必须导出所有类型
2. server 不要各自定义重复类型
3. server 需要有统一 error handler
4. /health 可以返回 { "ok": true, "data": { "name": "hermes-hub", "version": "dev", "timestamp": "..." } }
5. 不要新增 /api/runtime
6. 不要新增 /api/profiles
7. 不要探测 hermes CLI
8. 不要读写本地 HERMES_HOME
9. 不要引入 zod，除非当前项目已经使用；PR3 先以 TypeScript 类型为主
10. 不要引入数据库

验收命令建议：
1. pnpm install
2. pnpm build 或 pnpm typecheck
3. 启动 server
4. curl http://127.0.0.1:8899/health
5. 确认返回统一 API success 格式

输出要求：
完成后请输出：修改文件列表、新增类型列表、新增错误码列表、新增依赖列表、运行过的命令、验证结果、是否严格未触碰非 PR3 范围。
```

## PR3 自检指令

```text
请检查 PR3 是否符合要求。

检查项：
1. packages/shared 是否定义并导出通用 API 类型
2. 是否包含 ApiSuccess<T>、ApiFailure、ApiResponse<T>、ApiErrorCode、ApiError
3. 是否包含 RuntimeInfo、HermesCliInfo、HermesHomeInfo
4. 是否包含 ProfileSummary、ProfileDetail、ProfileFileStatus、ProfileHealthStatus
5. 是否包含 EditableFileResult、ValidateFileRequest、ValidateFileResponse、SaveFileRequest、SaveFileResponse、BackupInfo
6. server 是否接入统一 error handler
7. /health 是否返回统一格式 { ok: true, data: ... }
8. server / cli / web 是否可以正常引用 shared 类型
9. pnpm build 或 pnpm typecheck 是否通过
10. 是否没有实现 /api/runtime
11. 是否没有实现 Hermes CLI 探测
12. 是否没有实现 HERMES_HOME 探测
13. 是否没有实现 Profile 扫描
14. 是否没有实现 Config / SOUL 编辑
15. 是否没有引入 SQLite、Monaco、Gateway、Doctor、MCP、Cron

请输出：检查结果、修改文件列表、运行过的命令、发现的问题、是否建议进入 PR4。
不要继续实现 PR4。
```

---

# PR4：实现 Runtime Adapter detect

## PR4 实现指令

```text
请执行 PR4：实现 Runtime Adapter detect。

背景：
Hermes Hub 已完成 PR1 工程骨架、PR2 CLI + Fastify 本地启动闭环、PR3 Shared Types 与 API 错误模型。

现在只做 PR4，不要实现 Profile 扫描、Config 编辑、SOUL 编辑、Gateway 管理、Doctor、Logs、Skills、MCP、Cron。

目标：
实现 Hermes Runtime 探测能力，并提供 /api/runtime 接口，让 Web UI 能看到当前机器的 Hermes CLI 与 HERMES_HOME 状态。

范围：
1. 在 packages/core 中实现 Hermes CLI 探测
2. 在 packages/core 中实现 Hermes 版本探测
3. 在 packages/core 中实现 HERMES_HOME 探测
4. 在 packages/server 中新增 GET /api/runtime
5. 在 packages/server 中新增 POST /api/runtime/rescan
6. 在 packages/web 中新增最小 Runtime Banner 或 Runtime 状态区域
7. 探测失败不能导致 server 或 web 崩溃
8. 所有错误使用 PR3 定义的统一 ApiError 格式

Runtime detect 需要返回的信息：
- nodeVersion
- platform
- arch
- hermesCli: found、path、version、error
- hermesHome: found、path、source、error
- checkedAt

Hermes CLI 探测策略：
1. 优先使用 which hermes 或跨平台等价方式寻找 hermes
2. 找到后执行 hermes --version
3. 如果 hermes 不存在，返回 HERMES_CLI_NOT_FOUND，不要抛出未处理异常
4. 如果 hermes --version 执行失败，返回明确错误信息

HERMES_HOME 探测策略：
1. 如果 CLI 参数传入 --home，则优先使用该路径
2. 其次尝试执行 hermes config home
3. 再尝试环境变量 HERMES_HOME
4. 最后 fallback 到 ~/.hermes
5. 检查路径是否存在、是否可读
6. 返回 source，例如 cli-arg、hermes-config-home、env、fallback

API：
GET /api/runtime：返回当前缓存或即时探测结果。
POST /api/runtime/rescan：强制重新探测。

失败也不要让接口整体 500，除非 server 自身异常。例如 Hermes CLI 不存在时应返回 ok=true 但 hermesCli.found=false，并附带 HERMES_CLI_NOT_FOUND 错误。

Web UI：
1. 只做最小 Runtime Banner
2. 显示 Hermes CLI found / missing
3. 显示 Hermes version
4. 显示 HERMES_HOME path / missing
5. 提供 Rescan 按钮
6. 不做复杂页面设计

限制：
1. 不要实现 Profile 扫描
2. 不要读取 config.yaml
3. 不要读取 SOUL.md
4. 不要写入任何 Hermes 文件
5. 不要实现 Gateway 启停
6. 不要实现 Doctor
7. 不要实现 Logs
8. 不要引入 SQLite
9. 不要引入 Monaco
10. 不要扩大 PR4 范围

建议依赖：execa；可以使用 Node 内置 fs/path/os；不要引入重型依赖。

验收命令建议：
1. pnpm install
2. pnpm build 或 pnpm typecheck
3. pnpm --filter @hermes-hub/cli dev -- --no-open
4. curl http://127.0.0.1:8899/api/runtime
5. curl -X POST http://127.0.0.1:8899/api/runtime/rescan
6. 在没有 hermes CLI 的环境下确认接口不会崩溃
7. 如果本机有 hermes CLI，确认能展示 path、version、HERMES_HOME

输出要求：
完成后请输出：修改文件列表、新增依赖列表、新增 API 列表、Runtime 探测策略说明、运行过的命令、验证结果、已知问题、是否严格未触碰非 PR4 范围。
```

## PR4 自检指令

```text
请检查 PR4 是否符合要求。

检查项：
1. packages/core 是否实现 Hermes CLI 探测
2. 是否能探测 hermes 路径
3. 是否能执行 hermes --version
4. hermes 不存在时是否返回 HERMES_CLI_NOT_FOUND，而不是崩溃
5. 是否实现 HERMES_HOME 探测
6. HERMES_HOME 探测顺序是否为：--home > hermes config home > HERMES_HOME env > ~/.hermes fallback
7. 是否检查 HERMES_HOME 是否存在、是否可读
8. 是否返回 source，例如 cli-arg、hermes-config-home、env、fallback
9. 是否新增 GET /api/runtime
10. 是否新增 POST /api/runtime/rescan
11. API 是否使用统一 ApiResponse 格式
12. 探测失败是否不会导致 server 500 或 Web 崩溃
13. Web 是否只新增最小 Runtime Banner
14. Runtime Banner 是否显示 hermes found/missing、version、HERMES_HOME、Rescan
15. 是否没有实现 Profile 扫描
16. 是否没有读取 config.yaml
17. 是否没有读取 SOUL.md
18. 是否没有写入任何 Hermes 文件
19. 是否没有实现 Gateway、Doctor、Logs、Skills、MCP、Cron
20. 是否没有引入 SQLite 或 Monaco

请输出：检查结果、修改文件列表、运行过的命令、发现的问题、是否建议进入 PR5。
不要继续实现 PR5。
```

---

# PR5：实现 Profile 扫描和 Profile List 页面

## PR5 实现指令

```text
请执行 PR5：实现 Profile 扫描和 Profile List 页面。

背景：
Hermes Hub 已完成 PR1、PR2、PR3、PR4。
现在只做 PR5，不要实现 Profile Detail 文件编辑、Config 编辑、SOUL 编辑、保存、备份、Gateway、Doctor、Logs、Skills、MCP、Cron。

目标：
基于 PR4 探测到的 HERMES_HOME，实现已有 Hermes Profile 的扫描 API，并在 Web 中展示最小 Profile List 页面。

范围：
1. 在 packages/core 中实现 Profile 扫描逻辑
2. 在 packages/server 中新增 GET /api/profiles
3. 在 packages/web 中新增 Profile List 页面或区域
4. 列表展示已有 Profile 的基础状态
5. 处理空状态、错误状态、扫描失败状态
6. 不读取完整 config.yaml 内容，只允许解析必要摘要字段
7. 不读取完整 SOUL.md 内容，只检测存在性、mtime、大小、权限
8. 不写入任何 Hermes 文件

Profile 扫描规则：
1. 使用 PR4 的 HERMES_HOME 作为扫描入口
2. 优先根据 Runtime Research 确认的真实 Profile 结构扫描
3. 如果结构未确认，采用保守策略：当前 HERMES_HOME 本身可作为一个 Profile；如果存在 profiles/ 子目录，则扫描 profiles/* 作为 Profile 候选
4. 每个候选 Profile 检测：profileId、name、hermesHome、configPath、soulPath、hasConfig、hasSoul、configMtime、soulMtime、lastUpdated、readable、errors

ProfileSummary 至少包含：id、name、hermesHome、config 状态、soul 状态、lastUpdated、status、warnings、errors。

Web Profile List：
1. 显示 Runtime Banner
2. 显示 Profile 表格
3. 表格字段：Name、HERMES_HOME、config.yaml 状态、SOUL.md 状态、Last Updated、Status
4. 提供 Refresh / Rescan Profiles 按钮
5. 没有 Profile 时显示空状态
6. 扫描失败时显示明确错误

API：
GET /api/profiles 返回 profiles、scannedAt、sourceHermesHome。

限制：
1. 不要实现 GET /api/profiles/:id
2. 不要实现 Profile Detail 页面
3. 不要实现 config.yaml 编辑
4. 不要实现 SOUL.md 编辑
5. 不要实现保存和备份
6. 不要实现 Gateway / Doctor / Logs / Skills / MCP / Cron
7. 不要引入 SQLite
8. 不要引入 Monaco
9. 不要做复杂 UI，只做可用的最小列表

建议依赖：Node 内置 fs/path/crypto；可以使用 yaml 只解析 config 摘要，解析失败不能影响列表展示。

验收命令建议：
1. pnpm install
2. pnpm build 或 pnpm typecheck
3. pnpm --filter @hermes-hub/cli dev -- --no-open
4. curl http://127.0.0.1:8899/api/runtime
5. curl http://127.0.0.1:8899/api/profiles
6. 用至少一个真实或模拟 HERMES_HOME 验证 Profile 列表
7. 验证无 Profile 时的空状态
8. 验证权限不足或结构异常时的错误提示

输出要求：
完成后请输出：修改文件列表、新增依赖列表、新增 API 列表、Profile 扫描规则说明、Web 展示说明、运行过的命令、验证结果、已知问题、是否严格未触碰非 PR5 范围。
```

## PR5 自检指令

```text
请检查 PR5 是否符合要求。

检查项：
1. 是否实现 GET /api/profiles
2. 是否基于 HERMES_HOME 扫描 Profile
3. 是否支持当前 HERMES_HOME 作为单 Profile
4. 是否支持 profiles/* 作为候选 Profile
5. 是否使用规范化绝对路径 hash 作为 profileId
6. 是否检测 config.yaml 是否存在、可读、mtime
7. 是否检测 SOUL.md 是否存在、可读、mtime
8. 是否返回 lastUpdated
9. 是否返回 ready / warning / error / unknown 状态
10. 是否处理空状态
11. 是否处理扫描失败状态
12. Web 是否展示 Profile List
13. 表格是否展示 Name、HERMES_HOME、config 状态、SOUL 状态、Last Updated、Status
14. 是否提供 Refresh / Rescan Profiles
15. 是否没有实现 GET /api/profiles/:id
16. 是否没有实现 Profile Detail
17. 是否没有实现 Config / SOUL 编辑
18. 是否没有写入任何 Hermes 文件
19. 是否没有实现 Gateway、Doctor、Logs、Skills、MCP、Cron
20. 是否没有引入 SQLite 或 Monaco

请输出：检查结果、修改文件列表、运行过的命令、发现的问题、是否建议进入 PR6。
不要继续实现 PR6。
```

---

# PR6：实现 Profile Detail 与文件状态读取

## PR6 实现指令

```text
请执行 PR6：实现 Profile Detail 与文件状态读取。

背景：
Hermes Hub 已完成 PR1 ~ PR5。
现在只做 PR6，不要实现 Config 编辑保存、SOUL 编辑保存、备份、Gateway、Doctor、Logs、Skills、MCP、Cron。

目标：
用户点击 Profile 后，可以进入 Profile Detail，查看 Profile 的基础详情、config.yaml 状态、SOUL.md 状态、权限状态和基础配置摘要。

范围：
1. 在 packages/core 中实现 readProfile(profileId)
2. 在 packages/server 中新增 GET /api/profiles/:id
3. 在 packages/web 中实现 Profile Detail 页面或详情区域
4. 从 PR5 的扫描结果或路径索引中解析 profileId
5. 展示文件状态和基础配置摘要
6. 允许读取 config.yaml 的少量摘要字段，例如 model/provider/workspace
7. 不展示完整 config.yaml 内容
8. 不展示完整 SOUL.md 内容
9. 不写入任何 Hermes 文件

Profile Detail 返回字段至少包括：
- id、name、hermesHome
- config: path、exists、readable、writable、size、mtime、parseStatus、summary(model/provider/workspace)
- soul: path、exists、readable、writable、size、mtime、empty
- status、warnings、errors

Web Detail 页面：
1. 从 Profile List 点击进入或选择 Profile
2. 展示 HERMES_HOME
3. 展示 config.yaml 路径和状态
4. 展示 SOUL.md 路径和状态
5. 展示权限状态
6. 展示 model/provider/workspace 摘要
7. 如果 config 解析失败，显示“无法解析”，页面不崩溃
8. 如果 SOUL.md 不存在，显示“文件不存在，可在后续编辑页创建”
9. 提供返回列表入口
10. 可以预留 Open Config 和 Open SOUL 按钮，但不要实现编辑保存

限制：
1. 不要实现 GET /api/profiles/:id/config
2. 不要实现 PUT /api/profiles/:id/config
3. 不要实现 GET /api/profiles/:id/soul
4. 不要实现 PUT /api/profiles/:id/soul
5. 不要实现保存和备份
6. 不要实现 Gateway / Doctor / Logs / Skills / MCP / Cron
7. 不要引入 SQLite
8. 不要引入 Monaco
9. 不要做复杂 UI

建议依赖：Node 内置 fs/path；yaml 如果 PR5 已引入则复用，否则可在 PR6 引入用于摘要解析。

验收命令建议：
1. pnpm install
2. pnpm build 或 pnpm typecheck
3. pnpm --filter @hermes-hub/cli dev -- --no-open
4. curl http://127.0.0.1:8899/api/profiles
5. curl http://127.0.0.1:8899/api/profiles/:id
6. Web 中从 Profile List 进入 Profile Detail
7. 验证 config 解析失败时页面不崩溃
8. 验证 SOUL.md 不存在时有明确提示

输出要求：
完成后请输出：修改文件列表、新增依赖列表、新增 API 列表、Profile Detail 读取策略说明、Web 展示说明、运行过的命令、验证结果、已知问题、是否严格未触碰非 PR6 范围。
```

## PR6 自检指令

```text
请检查 PR6 是否符合要求。

检查项：
1. 是否实现 GET /api/profiles/:id
2. 是否能通过 profileId 找到对应 Profile
3. 是否展示 HERMES_HOME
4. 是否展示 config.yaml 路径、存在性、可读、可写、大小、mtime
5. 是否展示 SOUL.md 路径、存在性、可读、可写、大小、mtime
6. 是否解析 config.yaml 基础摘要
7. 摘要是否至少包含 model/provider/workspace，无法解析时是否不崩溃
8. 是否检测 SOUL.md 是否为空
9. Web 是否可以从 Profile List 进入 Profile Detail
10. Web Detail 是否有返回列表入口
11. 是否没有实现 config.yaml 完整内容编辑
12. 是否没有实现 SOUL.md 完整内容编辑
13. 是否没有实现保存和备份
14. 是否没有写入任何 Hermes 文件
15. 是否没有实现 Gateway、Doctor、Logs、Skills、MCP、Cron
16. 是否没有引入 SQLite 或 Monaco

请输出：检查结果、修改文件列表、运行过的命令、发现的问题、是否建议进入 PR7。
不要继续实现 PR7。
```

---

# PR7：实现 config.yaml 查看、编辑与 YAML 校验

## PR7 实现指令

```text
请执行 PR7：实现 config.yaml 查看、编辑与 YAML 校验。

背景：
Hermes Hub 已完成 PR1 ~ PR6。
现在只做 PR7，不要实现 SOUL.md 编辑保存、保存前备份、原子写入、密钥脱敏、Gateway、Doctor、Logs、Skills、MCP、Cron。

注意：
PR7 只实现 config.yaml 读取、编辑、校验和最小保存入口。如果保存动作需要写文件，请只实现无备份的草稿或阻止实际保存；真正保存前备份和原子写入放到 PR8。若团队决定 PR7 必须支持保存，则保存必须调用 PR8 之前的临时安全保护并明确标注技术债。

目标：
用户可以打开某个 Profile 的 config.yaml，查看完整内容，在 textarea 中编辑，并执行 YAML 语法校验。非法 YAML 必须阻止进入保存流程。

范围：
1. 在 packages/core 中实现 readEditableFile(profileId, "config")
2. 在 packages/core 中实现 validateYaml(content)
3. 在 packages/server 中新增 GET /api/profiles/:id/config
4. 在 packages/server 中新增 POST /api/profiles/:id/config/validate
5. 在 packages/web 中实现 Config 编辑区域
6. 使用 textarea，不引入 Monaco
7. 显示 YAML 校验结果
8. 显示文件路径、mtime、readonly 状态
9. 不实现真正安全保存，除非当前 PR 明确包含最小保存入口但不破坏原文件

GET /api/profiles/:id/config 返回 type、profileId、path、exists、readable、writable、content、mtime、size。

POST /api/profiles/:id/config/validate 入参：{ "content": "yaml content" }
返回 valid 和 errors；非法 YAML 返回 valid=false 和错误 message，若可用则返回 line/column。

限制：
1. 不要实现 SOUL.md API
2. 不要实现 PUT /api/profiles/:id/config，除非明确只做禁用状态或占位
3. 不要实现保存前备份
4. 不要实现原子写入
5. 不要实现密钥脱敏写回
6. 不要实现 Gateway / Doctor / Logs / Skills / MCP / Cron
7. 不要引入 SQLite
8. 不要引入 Monaco
9. 不要做复杂表单配置

建议依赖：yaml。

验收命令建议：
1. pnpm install
2. pnpm build 或 pnpm typecheck
3. pnpm --filter @hermes-hub/cli dev -- --no-open
4. curl http://127.0.0.1:8899/api/profiles/:id/config
5. curl -X POST http://127.0.0.1:8899/api/profiles/:id/config/validate
6. 用合法 YAML 验证 valid=true
7. 用非法 YAML 验证 valid=false 且有错误信息
8. Web 中打开 config.yaml，编辑后可看到校验结果

输出要求：
完成后请输出：修改文件列表、新增依赖列表、新增 API 列表、YAML 校验策略说明、Web 展示说明、运行过的命令、验证结果、已知问题、是否严格未触碰非 PR7 范围。
```

## PR7 自检指令

```text
请检查 PR7 是否符合要求。

检查项：
1. 是否实现 GET /api/profiles/:id/config
2. 是否实现 POST /api/profiles/:id/config/validate
3. 是否可以读取完整 config.yaml 内容
4. 是否显示 config.yaml path、mtime、size、readable、writable
5. 是否实现 YAML 语法校验
6. 合法 YAML 是否返回 valid=true
7. 非法 YAML 是否返回 valid=false 且包含错误 message
8. 如果能获取 line/column，是否返回 line/column
9. Web 是否用 textarea 展示和编辑 config.yaml
10. Web 是否展示 YAML 校验结果
11. 非法 YAML 是否被阻止进入保存流程
12. 是否没有实现 SOUL.md API
13. 是否没有实现真正安全保存和备份
14. 是否没有实现原子写入
15. 是否没有把脱敏内容写回文件
16. 是否没有实现 Gateway、Doctor、Logs、Skills、MCP、Cron
17. 是否没有引入 SQLite 或 Monaco

请输出：检查结果、修改文件列表、运行过的命令、发现的问题、是否建议进入 PR8。
不要继续实现 PR8。
```

---

# PR8：实现 SOUL.md 编辑、保存前备份、原子写入、密钥脱敏

## PR8 实现指令

```text
请执行 PR8：实现 SOUL.md 编辑、保存前备份、原子写入、密钥脱敏，并补齐 config.yaml 的安全保存闭环。

背景：
Hermes Hub 已完成 PR1 ~ PR7。
现在只做 PR8，不要实现 Gateway、Doctor、Logs、Skills、MCP、Cron、模板系统、配置版本历史 UI、Diff UI、回滚 UI。

目标：
完成 MVP 最小安全编辑闭环：
1. 用户可编辑并保存 config.yaml
2. 用户可编辑并保存 SOUL.md
3. 每次保存前自动备份
4. 写入失败不破坏原文件
5. config.yaml 保存前必须通过 YAML 校验
6. SOUL.md 空内容必须警告或阻止
7. UI 和 API 摘要不明文暴露明显密钥
8. 禁止将脱敏占位符误写回真实配置

范围：
1. 在 packages/core 中实现 saveWithBackup
2. 在 packages/core 中实现 atomicWrite
3. 在 packages/core 中实现 redactSecrets
4. 在 packages/core 中实现 detectRedactedPlaceholder
5. 在 packages/server 中新增 PUT /api/profiles/:id/config
6. 在 packages/server 中新增 GET /api/profiles/:id/soul
7. 在 packages/server 中新增 POST /api/profiles/:id/soul/validate
8. 在 packages/server 中新增 PUT /api/profiles/:id/soul
9. 在 packages/web 中补齐 Config 保存按钮和保存结果反馈
10. 在 packages/web 中新增 SOUL.md 编辑区域
11. 保存成功后显示备份路径
12. 保存失败显示明确错误，不破坏原文件

备份策略：
1. 默认备份到 ~/.hermes-hub/backups/<profileId>/<timestamp>/
2. 备份文件名保留原文件名，例如 config.yaml、SOUL.md
3. 备份响应返回 backupPath、createdAt、originalPath
4. 如果原文件不存在，例如 SOUL.md 不存在，则不创建文件备份，但记录 new-file 备份状态或创建 metadata 记录
5. 备份失败时阻止保存

原子写入策略：
1. 写入临时文件，例如 config.yaml.tmp-<timestamp>
2. fsync 或尽可能 flush
3. rename 替换原文件
4. 如果写入失败，删除临时文件，不破坏原文件
5. 权限不足时返回 PERMISSION_DENIED

config.yaml 保存规则：
1. 保存前必须执行 YAML 校验
2. YAML 无效时返回 YAML_INVALID，阻止保存
3. 如果内容包含明显脱敏占位符，例如 ********、••••••、REDACTED、<redacted>，并且疑似出现在 key/token/secret/password/auth 字段，阻止保存，避免覆盖真实密钥
4. 保存成功返回 SaveFileResponse

SOUL.md 保存规则：
1. 如果 SOUL.md 不存在，允许创建，但 UI 必须提示“该文件不存在，将新建”
2. 空内容保存策略：MVP 建议阻止保存；如团队选择允许保存，必须弹出强警告
3. SOUL.md 保存前也要备份已有文件
4. 保存失败不能破坏原文件

密钥脱敏规则：
1. API 摘要默认脱敏明显密钥字段
2. UI 状态摘要不明文展示 token/key/secret/password/auth
3. Raw 编辑器中显示真实文件内容，但必须显示本地安全提示
4. 禁止将已经脱敏的占位符内容写回真实配置

限制：
1. 不要实现 Gateway 启停
2. 不要实现 Doctor
3. 不要实现 Logs
4. 不要实现 Skills / MCP / Cron
5. 不要实现模板系统
6. 不要实现配置版本历史 UI
7. 不要实现 Diff UI
8. 不要实现回滚 UI
9. 不要引入 SQLite
10. 不要引入 Monaco
11. 不要实现多用户权限
12. 不要实现多节点管理

验收命令建议：
1. pnpm install
2. pnpm build 或 pnpm typecheck
3. pnpm --filter @hermes-hub/cli dev -- --no-open
4. curl http://127.0.0.1:8899/api/profiles/:id/config
5. curl -X PUT http://127.0.0.1:8899/api/profiles/:id/config
6. curl http://127.0.0.1:8899/api/profiles/:id/soul
7. curl -X PUT http://127.0.0.1:8899/api/profiles/:id/soul
8. 验证合法 YAML 保存成功
9. 验证非法 YAML 保存失败且原文件不变
10. 验证保存前创建备份
11. 验证 SOUL.md 保存成功
12. 验证 SOUL.md 不存在时可创建并有提示
13. 验证空 SOUL.md 被阻止或强警告
14. 验证含脱敏占位符的敏感字段保存被阻止
15. 验证写入失败不破坏原文件

输出要求：
完成后请输出：修改文件列表、新增依赖列表、新增 API 列表、备份策略说明、原子写入策略说明、密钥脱敏与占位符阻止策略说明、Web 展示说明、运行过的命令、验证结果、已知问题、是否严格未触碰非 PR8 范围。
```

## PR8 自检指令

```text
请检查 PR8 是否符合要求。

检查项：
1. 是否实现 PUT /api/profiles/:id/config
2. config.yaml 保存前是否强制执行 YAML 校验
3. 非法 YAML 是否阻止保存
4. config.yaml 保存前是否自动备份
5. 是否实现 GET /api/profiles/:id/soul
6. 是否实现 POST /api/profiles/:id/soul/validate
7. 是否实现 PUT /api/profiles/:id/soul
8. SOUL.md 保存前是否自动备份已有文件
9. SOUL.md 不存在时是否允许创建并明确提示
10. SOUL.md 空内容是否阻止或强警告
11. 备份目录是否默认为 ~/.hermes-hub/backups/<profileId>/<timestamp>/
12. 保存响应是否包含 backupPath、createdAt、originalPath
13. 是否采用临时文件 + rename 的原子写入策略
14. 写入失败是否不破坏原文件
15. 备份失败是否阻止保存
16. 权限不足是否返回 PERMISSION_DENIED
17. API 摘要是否脱敏明显密钥字段
18. Raw 编辑器是否显示本地安全提示
19. 是否阻止将 ********、••••••、REDACTED、<redacted> 等脱敏占位符写回敏感字段
20. Web Config 编辑页是否有 Save 按钮和保存结果反馈
21. Web SOUL.md 编辑页是否可读取、编辑、保存
22. 保存成功是否显示备份路径
23. 保存失败是否显示明确错误和 suggestion
24. 是否没有实现 Gateway、Doctor、Logs、Skills、MCP、Cron
25. 是否没有实现模板系统、版本历史 UI、Diff UI、回滚 UI
26. 是否没有引入 SQLite 或 Monaco

请输出：检查结果、修改文件列表、运行过的命令、发现的问题、MVP 是否达到最小安全编辑闭环、是否建议进入 MVP 联调与 README 阶段。
```

---

# MVP 联调与 README 收尾

## 收尾实现指令

```text
请执行 MVP 联调与 README 收尾。

目标：
验证 Hermes Hub MVP 是否达成最小安全编辑闭环，并补齐 README 和手动验收清单。

范围：
1. 使用至少 1 个真实或模拟 Hermes Profile 完成全链路验证
2. 验证 npx / CLI 启动
3. 验证 Runtime 探测
4. 验证 Profile 扫描
5. 验证 Profile Detail
6. 验证 config.yaml 查看、校验、保存、备份
7. 验证 SOUL.md 查看、校验、保存、备份
8. 验证错误状态
9. 补充 README MVP 使用说明
10. 补充 docs/manual-test-checklist.md

不要实现新功能。

README 至少包含：项目简介、MVP 功能、安装与启动、CLI 参数、HERMES_HOME 说明、安全说明、已知限制、暂不支持功能、手动验收步骤。

验收 checklist 至少包含：
- npx hermes-hub 可启动
- 默认监听 127.0.0.1
- --no-open 生效
- /health 正常
- /api/runtime 正常
- /api/profiles 正常
- config.yaml 合法保存成功
- config.yaml 非法 YAML 保存失败
- SOUL.md 保存成功
- 每次保存前创建备份
- 保存失败不破坏原文件
- 敏感字段摘要不明文展示
- 脱敏占位符不会被写回敏感字段

输出要求：
1. 修改文件列表
2. 运行过的命令
3. 手动验收结果
4. README 更新摘要
5. 已知限制
6. 后续建议
```

## 收尾自检指令

```text
请检查 MVP 联调与 README 收尾是否完成。

检查项：
1. README 是否包含项目简介
2. README 是否包含启动命令
3. README 是否包含 CLI 参数
4. README 是否说明 HERMES_HOME
5. README 是否说明安全策略
6. README 是否列出暂不支持功能
7. 是否存在手动验收清单
8. 是否用至少 1 个真实或模拟 Profile 完成全链路验证
9. npx / CLI 启动是否验证通过
10. Runtime 探测是否验证通过
11. Profile 扫描是否验证通过
12. config.yaml 合法保存是否验证通过
13. config.yaml 非法 YAML 阻止保存是否验证通过
14. SOUL.md 保存是否验证通过
15. 保存前备份是否验证通过
16. 写入失败不破坏原文件是否验证通过
17. 是否没有新增非 MVP 功能

请输出：检查结果、手动验收结果、未完成项、是否可以标记 MVP 内测版。
```

---

# 附录 A：PR 执行顺序

```text
前置任务：Hermes Runtime Research
PR1：初始化 pnpm workspace 与 TypeScript 包边界
PR2：实现 CLI + Fastify 本地启动闭环
PR3：实现 Shared Types 与 API 错误模型
PR4：实现 Runtime Adapter detect
PR5：实现 Profile 扫描和 Profile List 页面
PR6：实现 Profile Detail 与文件状态读取
PR7：实现 config.yaml 查看、编辑与 YAML 校验
PR8：实现 SOUL.md 编辑、保存前备份、原子写入、密钥脱敏
收尾：MVP 联调与 README
```

---

# 附录 B：MVP 最小闭环

```text
用户执行 npx hermes-hub
  ↓
本地服务启动
  ↓
浏览器打开
  ↓
UI 展示 Hermes CLI 探测状态
  ↓
UI 展示 HERMES_HOME
  ↓
扫描至少 1 个真实 Profile
  ↓
进入 Profile Detail
  ↓
查看 config.yaml / SOUL.md
  ↓
编辑合法 config.yaml 并保存成功
  ↓
编辑 SOUL.md 并保存成功
  ↓
每次保存前自动备份
  ↓
保存失败不破坏原文件
  ↓
错误状态有明确提示
```

---

# 附录 C：人工确认项

| 问题 | 建议决策 |
|---|---|
| `hermes profile list` 是否存在 / 是否支持 JSON | 前置 Runtime Research 或 PR4 前确认 |
| `hermes config home` 返回语义 | 前置 Runtime Research 或 PR4 前确认 |
| Profile 是多目录还是单目录 registry | 前置 Runtime Research 或 PR5 前确认 |
| Raw config 是否显示真实密钥 | MVP 显示真实文件内容，但摘要脱敏，保存时阻止脱敏占位符写回 |
| 备份目录位置 | `~/.hermes-hub/backups/<profileId>/<timestamp>/` |
| Windows 支持范围 | MVP 优先 macOS / Linux，Windows best effort |
| 软链接处理 | MVP 默认谨慎读取，遇到软链接提示风险 |
| `SOUL.md` 不存在时是否允许创建 | MVP 允许创建，但必须明确提示 |
| Profile ID 生成策略 | 使用规范化绝对路径 hash，UI 显示 name/path |
