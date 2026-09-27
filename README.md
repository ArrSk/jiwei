# 几微 · jiwei

> **面向大学生的课程表应用。**手机优先、离线可用、数据只存在你自己设备上。
> 架构从第一天起就按"多模块"设计，让日程表、提醒、闹钟、笔记等模块后续能**嵌入而不用重构**。

- 不懂技术？看 [`docs/新手使用说明.md`](docs/新手使用说明.md)（从装环境到日常使用）
- 架构与模块设计：[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- 路线图：[`docs/ROADMAP.md`](docs/ROADMAP.md)
- 决策记录（ADR）：[`docs/DECISIONS.md`](docs/DECISIONS.md)
- 闹钟可行性研究（为什么浏览器做不到）：[`docs/ALARM-STUDY.md`](docs/ALARM-STUDY.md)

---

## 一句话架构

> **本地优先（Local-first）的 React PWA + 模块化功能外壳**；
> 数据用一个可扩展的 `Block`（时间块）模型，课表只是 `kind='course'` 的视图；
> 需要系统级能力（闹钟、后台响铃）时，用 **Capacitor 把同一份代码打成原生 App**。

三个决定性的设计选择：

| 选择 | 为什么 |
| --- | --- |
| **本地优先，先不做服务器** | 单用户、离线可用、零运维；数据模型与存储接口与将来接同步时**保持一致**，届时只加一层，不重写 |
| **`Block` + `Occurrence` 锚点模型** | 课表、日程、任务共用一张表；闹钟/提醒/笔记挂到稳定的 `occurrenceId` 上，**加功能 = 加视图 + 加附件，不动核心** |
| **存储引擎藏在仓储接口后面** | 首版用 IndexedDB（实现快），将来换 SQLite 或接服务端同步时，**只换 `@jiwei/data` 的实现层**，业务代码零改动 |
| **Capacitor 原生外壳** | 闹钟必须调用系统级调度（Android AlarmManager / iOS 本地通知），纯 Web 在后台无法响铃；Capacitor 让同一份代码产出 PWA + Android/iOS 原生包 |

---

## 首版做什么

**只做课程表，但骨架是模块化的，且第一步就让你真实用上。**

| 阶段 | 你能体验到 |
| --- | --- |
| **M0 · 最小可用课表** | 建学期 → 添几门课 → **看到周视图课表**；手机打开同一地址也能看；关掉重开数据还在 |
| **M1 · 课表完整版** | 单双周、跳过周、连堂、调课、表格批量编辑、日视图 + "今天/下一节"卡片 |
| **M2 · 手机可用** | PWA 加到桌面像原生 App，飞行模式下也能看 |

> M0 是**垂直切片**：地基 + **完整数据模型** + 最小可用界面。模型一次做全（最贵的部分），
> 功能分批交付（最便宜的部分）——所以第一周就能验证"模型 → 存储 → 渲染"整条链路。

**课表阶段明确不做**：日程表、提醒、闹钟、笔记、账号、教务抓取。
但代码里会留好模块注册机制与 `Block` 数据模型 —— 后续模块是"插进来"，不是"改架构"。

---

## 平台能力边界（重要，先看懂这张表）

| 能力 | 网页 (PC 浏览器) | PWA (手机加到桌面) | 原生 (Capacitor 打包) |
| --- | --- | --- | --- |
| 课表/日程/笔记 | ✅ | ✅ | ✅ |
| 离线使用 | ✅ | ✅ | ✅ |
| 系统日历订阅 (iCal) | ✅ | ✅ | ✅ |
| 应用内提醒 | ✅ | ✅ | ✅ |
| 后台推送提醒 | — | ⚠️ Android 可以；iOS 需 iOS≥16.4 且已装到桌面 | ✅ |
| **闹钟（锁屏响铃/震动）** | ❌ | ❌ | ✅ |
| 后台定时任务 | ❌ | ❌ | ✅ |
| 上应用商店 | — | ❌ | ✅ |

> **结论**：纯网页能覆盖课表、日程、笔记、日历订阅、应用内提醒；**"闹钟"必须先有原生外壳**。
> 详细论证与实现方案见 [`docs/ALARM-STUDY.md`](docs/ALARM-STUDY.md)。

---

## 技术栈一览

| 层 | 选型 |
| --- | --- |
| 语言 / 仓库 | TypeScript + pnpm workspace 单仓多包 |
| 前端 | React 19 + Vite + Tailwind CSS v4 + Radix UI/shadcn + TanStack Query + Zustand |
| 本地数据库 | **IndexedDB（Dexie）**；仓储接口隔离，将来可换浏览器内 SQLite（见 ADR-003/007） |
| 数据契约 | `@jiwei/core` 用 Zod 定义模型 + 时间计算纯函数（与存储引擎解耦） |
| 提醒/闹钟 | Web Notifications + iCal 导出 → Capacitor Local Notifications（原生调度） |
| 原生外壳 | Capacitor（复用 `apps/web`，不新建 UI 工程） |
| 服务端（可选，后期） | Hono + Drizzle + SQLite（WAL + FTS5），独立实现，后期接入同步/推送 |
| 测试 | Vitest（纯函数/数据层）+ Playwright（端到端，含手机视口） |

---

## 仓库结构

```
jiwei/
├─ apps/
│  ├─ web/                # 唯一的客户端应用（React PWA）
│  ├─ api/                # 可选：同步服务（M 后期才启用，初期不跑）
│  └─ native/             # Capacitor 外壳（壳工程，代码复用 apps/web）
├─ packages/
│  ├─ core/               # ★ Zod 模型 + 时间/周次/冲突纯函数（唯一时间真相）
│  ├─ data/               # ★ 仓储接口 + Dexie 引擎（可替换）+ 备份恢复
│  ├─ ui/                 # 通用 UI 组件 + 时间网格基座
│  └─ platform/           # ★ 能力适配层（通知/闹钟/存储/文件，Capacitor 就绪）
├─ scripts/               # 开发与检查脚本（见下表）
├─ docs/                  # 架构、新手说明、调研、路线图、决策记录
├─ pnpm-workspace.yaml
└─ README.md
```

带 ★ 的三个包是"加功能不用重构"的关键：`core` 定模型、`data` 定存储、`platform` 定能力边界。
每个未来功能 = `apps/web/src/features/<name>/` + 一个模块注册项，**feature 之间禁止互相 import**。

---

## 文档索引

| 文档 | 给谁看 | 内容 |
| --- | --- | --- |
| [`docs/新手使用说明.md`](docs/新手使用说明.md) | **不懂技术的人** | 从装环境到日常使用的完整步骤，含排错 |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | 开发者 | 架构、数据模型、目录结构、风险 |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | 开发者 | 7 条 ADR，每条都写清"为什么" |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | 所有人 | 接下来做什么，分 M0~M8 阶段 |
| [`docs/DESIGN-VERSIONS.md`](docs/DESIGN-VERSIONS.md) | 开发者 | 界面改过几版、如何回退、踩过的坑 |
| [`docs/ALARM-STUDY.md`](docs/ALARM-STUDY.md) | 决策参考 | 为什么浏览器做不了闹钟 |
| [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md) | 本机环境 | 网络/沙箱/编码等环境问题的诊断 |
| [`docs/MOBILE-ARCHITECTURE.md`](docs/MOBILE-ARCHITECTURE.md) | 开发者 | 手机端架构评估与调试方案 |
| [`docs/正式版存储与调试调研.md`](docs/正式版存储与调试调研.md) | 决策参考 | 打包成手机 App 后存储可靠性与调试（含出处） |

## 脚本索引

| 脚本 | 用途 |
| --- | --- |
| `pnpm dev` | 启动开发服务器（改代码自动刷新） |
| `pnpm build` | 打包正式版本到 `apps/web/dist` |
| `node scripts/serve-dist.mjs 4173` | 把打包结果开成服务（**绑定 0.0.0.0，手机可访问**） |
| `pnpm typecheck` | 类型检查（5 个包） |
| `pnpm test` | 单元测试（core 52 + data 20） |
| `node scripts/smoke.mjs` | **构建产物冒烟检查**：资源是否齐全、关键样式类是否生成、PWA 文件与 manifest |
| `node scripts/check-classes.mjs "<类名>"` | 检查某个 Tailwind 类有没有真的进产物（本项目踩过跨包扫描的坑） |
| `node scripts/check-encoding.mjs <文件...>` | 检查文件有没有被写成乱码/BOM/注释与标签并成一行 |
| `node scripts/install-retry.mjs 12` | 网络不稳时反复 install 直到成功 |

---

## 环境要求

- Node.js ≥ 20（本机 24.18 ✅）
- pnpm ≥ 9（本机 11.8 ✅）
- 注意：PowerShell 下 `npm.ps1` 被执行策略拦截，请统一使用 `pnpm` 或 `npm.cmd`
- 后续做原生外壳时需要 Android Studio / Xcode（M5 之前不需要）

### 本机网络说明（重要）

这台机器到 `registry.npmjs.org` 的 TLS 连接**不稳定**（间歇性 ECONNRESET，元数据请求常在 60 秒被掐断）。
已做两件事对冲：

1. `.npmrc` 里把 `fetch-retries` / `fetch-timeout` 调高、并发调低；
2. 提供 `scripts/install-retry.mjs`——反复执行 install 直到成功。
   已下载的包会进 pnpm store 被复用，所以**每轮都会往前推进**，多跑几轮即可收敛。

```bash
node scripts/install-retry.mjs 12
```

## 本地开发

```bash
pnpm install          # 网络不稳时改用：node scripts/install-retry.mjs 12
pnpm dev              # 启动 Web（默认 http://localhost:5273，已开 host 允许手机局域网访问）
pnpm test             # 跑 core 与 data 的单测
pnpm typecheck        # 全仓类型检查
pnpm build            # 产出 PWA 静态资源
```

手机上看效果：`pnpm dev` 后终端会打印 `Network:` 局域网地址，手机浏览器直接打开即可
（同一 Wi-Fi 下，Windows 防火墙可能需要放行 Node）。

## 当前进度

| 里程碑 | 状态 | 说明 |
| --- | --- | --- |
| 前置设计（7 条 ADR + 多份文档） | ✅ | 见 `docs/` |
| **M0 · 最小可用课表** | ✅ 已完成并验证 | 单仓骨架 / 完整数据模型 / Dexie 仓储 / 周视图 / 录课表单 / PWA 配置 |
| M1 课表完整版 | ⏭ | 单双周与跳周录入界面、连堂拖拽、表格批量编辑、日视图、调课 |
| M2 手机可用 | ⏭ | PWA 安装引导、离线、深色模式完善 |
| M3~M7 | ⏭ | 见 `docs/ROADMAP.md` |

### M0 验证结果

| 项 | 结果 |
| --- | --- |
| 类型检查（5 个包） | ✅ 全部通过 |
| `@jiwei/core` 单测 | ✅ 44 / 44（单双周、跳过周、连堂、调课、冲突、跨年、闰年） |
| `@jiwei/data` 单测 | ✅ 11 / 11（迁移、CRUD、幂等重建、**重建后附件不丢**） |
| 生产构建 | ✅ 468 模块，产出 PWA 资源（`sw.js` + `manifest.webmanifest`） |

### 已知局限（有意为之，非缺陷）

- **课程块在手机上很窄**：7 天塞进一屏，每列约 40px，只能显示标题与缩略的地点。若想看清细节，M1 的**日视图**会解决这个问题。
- **闹钟不可用**：Web 端 `canAlarm = false`，设置面板会如实告知（见 `docs/ALARM-STUDY.md`）。
- **单双周/跳过周暂无录入界面**：模型与展开逻辑**已完整支持并有单测**，只是表单还没暴露（排在 M1）。

## 当前状态

**M0（最小可用课表）已完成并通过验证**，可以正常使用。

| 能力 | 状态 |
| --- | --- |
| 课程表（周视图、增删课程、单双周/跳周、连堂） | ✅ |
| 作息时间逐节可编辑 | ✅ |
| 手机端适配（PWA 可装到桌面、安全区、触摸目标） | ✅ |
| 深色模式 | ✅ |
| 本地数据备份与恢复（导出/导入 JSON） | ✅ |
| 日程表 / 笔记 / 待办 / 闹钟 | ⏭ 排在后续里程碑，见 [`docs/ROADMAP.md`](docs/ROADMAP.md) |

**质量基线**：类型检查 5 个包全过 · 单元测试 72 个（core 52 + data 20）· 构建产物冒烟检查 14 项。

**下一步**：按 [`docs/ROADMAP.md`](docs/ROADMAP.md) 推进 M1（课表完整版：表格批量编辑、日视图、调课界面）。
