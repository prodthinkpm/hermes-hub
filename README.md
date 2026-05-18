# Hermes Hub

Hermes Agent 的 Web 控制台，可通过 `npx hermes-hub` 一键启动。聚合管理多个 Hermes 安装路径下的所有 profiles，提供列表、详情、配置、日志等操作入口。

## 架构

```
packages/
├── core/          @hermes-hub/core    共享类型 + API 客户端（零依赖）
├── web/           @hermes-hub/web     Vue 3 SPA 前端
└── cli/           hermes-hub          CLI + HTTP Server（可发布到 npm）
```

```
浏览器 (web)  →  CLI Server (:3000)  →  文件系统 (~/.hermes/profiles/)
                                    →  Hermes backend proxy (/api/*)
```

## 技术栈

- Vue 3 + TypeScript + Vite
- Tailwind CSS v4 + Pinia + Vue Router
- Node.js 内置 HTTP Server（零第三方依赖）
- pnpm workspace monorepo

## 快速开始

```bash
pnpm install
pnpm build            # core → web → cli 顺序构建
node packages/cli/dist/cli.js --no-open   # 启动 server (localhost:3000)
```

开发模式（前端热更新）：

```bash
# 终端 1: 启动 API server
node packages/cli/dist/cli.js --no-open

# 终端 2: 启动 Vite dev server（/api/* 自动代理到 :3000）
pnpm dev
```

## CLI 用法

```
npx hermes-hub                       # 默认 localhost:3000，自动打开浏览器
npx hermes-hub --port 8080           # 指定端口
npx hermes-hub --api localhost:8643  # 指定后端 API 代理地址
npx hermes-hub --no-open             # 不自动打开浏览器
```

## Server 路由

| 请求路径 | 行为 |
|---------|------|
| `/` | SPA index.html |
| `/assets/*` | 静态文件 |
| `/api/profiles` | 扫描所有配置路径下的 Hermes profiles |
| `/api/profiles/:id` | 单个 profile 详情 |
| `/api/profiles/:id/config.yaml` | 返回 config.yaml 原文 |
| `/api/profiles/:id/SOUL.md` | 返回 SOUL.md 原文 |
| `/api/profiles/:id/skills` | skills 文件列表 |
| `/api/config` | 获取/更新配置（多路径） |
| `/api/*` (其他) | 代理到 Hermes 后端 |
| 其他路径 | SPA fallback → index.html |

## 多路径扫描

在 Settings 页面配置多个 Hermes 安装路径，server 会汇总所有路径下的 profiles，按 id 去重：

```
默认:  ~/.hermes/profiles/           (始终扫描)
额外:  /mnt/server1/.hermes/         (用户配置)
```

配置保存在 `~/.hermes-hub/config.json`。

## 亮色/暗色主题

TopBar 右侧月亮/太阳图标切换，主题持久化到 localStorage。

## packages/web 目录

```
src/
  components/
    fleet/        # Profile 业务组件 (HeroBanner, ProfileTable)
    layout/       # AppShell, SidebarNav, TopBar, ToastNotice
    ui/           # 通用 UI 组件 (Button, Badge, Panel, Console...)
  data/           # 静态 mock 数据（API 不可用时的 fallback）
  pages/          # Dashboard, Profiles, ProfileDetail, Create, Logs, Services, Settings
  router/         # Vue Router
  stores/         # Pinia (hub, theme)
  types/          # TypeScript 类型 (web-only + re-export from core)
```
