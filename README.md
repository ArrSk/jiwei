# 几微 · jiwei

> **大学生日常生活 App。**首版只做课程表，架构从第一天起就按"多模块"设计，
> 让日程表、重要事件提醒、闹钟、笔记、待办等模块后续能**嵌入而不用重构**。

**「几微」**（jī wēi）取自《易·系辞下》——「**几者，动之微，吉之先见者也**」「**知几其神乎**」。
「几」是事情将要发动而未发动的那个临界点。这个 App 的价值不在记录了多少事，
而在**在对的那一瞬让人知道该做什么**：上课前十分钟、截止前一夜、事情还没耽误的最后一刻。
→ 完整释义与备选名称留档见 [`docs/NAMING.md`](docs/NAMING.md)

- 架构与模块设计：[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- 闹钟可行性研究（Web 做不到，怎么做）：[`docs/ALARM-STUDY.md`](docs/ALARM-STUDY.md)
- 路线图：[`docs/ROADMAP.md`](docs/ROADMAP.md)
- 决策记录（ADR）：[`docs/DECISIONS.md`](docs/DECISIONS.md)
- 名称释义：[`docs/NAMING.md`](docs/NAMING.md)

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
│  ├─ data/               # ★ 仓储接口 + Dexie 引擎（可替换）+ 迁移
│  ├─ ui/                 # 通用 UI 组件 + 时间网格基座
│  └─ platform/           # ★ 能力适配层（通知/闹钟/存储/文件，Capacitor 就绪）
├─ docs/                  # 架构、闹钟研究、路线图、决策记录、名称释义
├─ pnpm-workspace.yaml
└─ README.md
```

带 ★ 的三个包是"加功能不用重构"的关键：`core` 定模型、`data` 定存储、`platform` 定能力边界。
每个未来功能 = `apps/web/src/features/<name>/` + 一个模块注册项，**feature 之间禁止互相 import**。

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
| 前置设计（8 条 ADR + 5 份文档） | ✅ | 见 `docs/` |
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

**前置设计全部确认完毕，代码尚未生成。**

- ✅ 七条 ADR 均已确认：见 [`docs/DECISIONS.md`](docs/DECISIONS.md)
- ✅ 项目名已定：**几微 / jiwei**，含义记录在 [`docs/NAMING.md`](docs/NAMING.md)
- ⏭ 下一步：按 [`docs/ROADMAP.md`](docs/ROADMAP.md) 初始化 **M0 · 最小可用课表**
  （地基 + 完整模型 + 手动录课 + 周视图），目标是尽快让你在电脑和手机上真实看到自己的课表
