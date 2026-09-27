# 几微（jiwei）架构设计

> 定位：**面向大学生的课程表应用**。首版只有课程表，但架构按"多模块长期演进"设计。
> 本文档是唯一的技术权威；决策理由见 [`DECISIONS.md`](DECISIONS.md)，闹钟专题见 [`ALARM-STUDY.md`](ALARM-STUDY.md)。

---

## 1. 产品与技术原则

这五条决定了后面所有选型，冲突时以它们为准：

| # | 原则 | 含义 | 反面案例（我们不这么做） |
| --- | --- | --- | --- |
| P1 | **模块化外壳** | 每个功能是一个自注册模块；外壳只管导航/主题/数据/能力 | 把课表写进 `App.tsx` 里，加功能时到处改 |
| P2 | **本地优先** | 数据先落本地库，离线完整可用；服务器是"增强"不是"前提" | 没网就白屏 |
| P3 | **数据模型面向"时间"而非"课"** | 课表是视图，不是模型 | 以后加日程时再造一张并行表 |
| P4 | **能力走适配层** | 通知/闹钟/文件/震动一律经 `platform`，不做平台假设 | 直接 `new Notification()`，将来原生端失效 |
| P5 | **同一份代码多端** | 一个 React 应用同时产出 PWA 与原生包 | 为手机另写一套 RN |

---

## 2. 技术栈

### 2.1 客户端（唯一重点）

| 用途 | 选型 | 说明 |
| --- | --- | --- |
| 仓库 / 语言 | **pnpm workspace + TypeScript 5** | 单仓多包，前后端与多端共享类型 |
| 框架 | **React 19 + Vite 7** | 生态最大；Vite 构建快、产物纯静态（利于 Capacitor 打包） |
| 样式 | **Tailwind CSS v4** + CSS 变量主题 | 深色模式、多主题成本低 |
| 组件 | **Radix UI / shadcn**（按需复制进仓库） | 无样式基座，无障碍开箱即用 |
| 异步/缓存 | **TanStack Query** | 查询缓存、乐观更新、离线重试 |
| 本地 UI 状态 | **Zustand** | 只放"当前周 / 选中日 / 主题"，不放业务数据 |
| 路由 | React Router v7 | 模块注册时挂载路由 |
| 表单校验 | react-hook-form + **Zod** | Zod schema 与 `@jiwei/core` 共用一份 |
| 日期时间 | **date-fns v4 + date-fns-tz** | 所有计算锁 `Asia/Shanghai`；纯函数、可测 |
| 手势 | @use-gesture/react | 手机左右滑切周、长按拖拽调课 |

### 2.2 数据层

| 用途 | 选型 | 说明 |
| --- | --- | --- |
| 存储引擎（**首版**） | **IndexedDB，经 Dexie 封装** | 实现成本低，先把手表功能做出来（ADR-003） |
| 访问方式 | **仓储接口**（`SemesterRepo`/`BlockRepo`/`OccurrenceRepo`/`AlertRepo`/`NoteRepo`） | 业务代码只依赖接口，**禁止直接 import Dexie**（ADR-007） |
| 领域模型 | `@jiwei/core` 的 Zod schema | 与存储引擎完全解耦，换引擎不动模型 |
| 内容存储 | 笔记原文存 IndexedDB Blob，另支持导出 Markdown 文件夹 | 可被 Obsidian/git 管理 |
| 全文搜索（M7） | 内存倒排索引 + 分词（数据量小够用） | 迁移 SQLite 后换成 FTS5 |
| 迁移路径 | `packages/data/src/engines/{dexie → sqlite}` | 换引擎 = 换 `createRepos(engine)` 的入参，上层零改动 |

> **为什么首版不直接上 SQLite**：WASM 加载、OPFS 兼容、Worker 异步边界三类成本会拖慢首个可用版本。
> 课表数据量极小（一学期几百条），IndexedDB 的复合索引足够。
> **风险已用接口隔离**：迁移时改动被限制在 `packages/data/src/engines/` 内，`features/*` 一行不改。
> **触发迁移的条件**：① 跨模块复杂查询变难写 ② 笔记搜索要求变高 ③ 数据量/查询复杂度让手写索引吃力 ④ 决定接服务端同步。

### 2.3 提醒 / 闹钟 / 原生

| 用途 | 选型 |
| --- | --- |
| 应用内提醒 | Web Notifications + Web Audio（页面开着时精确） |
| 后台推送 | Web Push（`web-push` + VAPID），**需要服务器，且 iOS 不可靠** → 定位为增强 |
| 系统日历 | iCal 订阅导出（`ical-generator`），锁屏小组件/手表可用 |
| **原生闹钟** | **Capacitor + @capacitor/local-notifications**（系统级调度） |
| 原生其他能力 | @capacitor/filesystem / share / app / haptics / badge |

### 2.4 服务端（**后期可选，M1~M4 不跑**）

| 用途 | 选型 |
| --- | --- |
| 框架 / 运行时 | Hono + Node 20+ |
| 数据库 | Drizzle + SQLite(WAL) → 可换 Postgres；**服务端是独立实现，不复用浏览器端 Dexie 引擎** |
| 用途 | 仅两件事：① 多设备同步（后期） ② Web Push 推送服务 |
| 认证 | 真需要时再引入 better-auth；**本地优先意味着没有它也完整可用** |

> 注意：由于首版选了 IndexedDB（ADR-003），"浏览器与服务端共用同一份 ORM schema"这一收益**暂不成立**；
> 将来接同步时，`@jiwei/data` 需要新增一个"远程仓储实现"，但**仓储接口不变**，上层零改动。

### 2.5 工程

ESLint + Prettier + `tsc --noEmit` + Vitest（纯函数/数据层）+ Playwright（端到端，含手机视口）+ Lefthook pre-commit。

---

## 3. 平台能力矩阵（决定了功能怎么实现）

| 能力 | Web (PC) | PWA | Native (Capacitor) |
| --- | --- | --- | --- |
| 课表 / 日程 / 任务 / 笔记 | ✅ | ✅ | ✅ |
| 离线读写 | ✅ | ✅ | ✅ |
| 应用内提醒 | ✅ | ✅ | ✅ |
| 系统日历订阅 (iCal) | ✅ | ✅ | ✅ |
| 后台推送 | — | ⚠️ Android ✅ / iOS 受限 | ✅ |
| **锁屏闹钟（必响）** | ❌ | ❌ | ✅ |
| 震动 / 角标 / 后台任务 | ❌ | ❌ | ✅ |

**因此**：`packages/platform` 暴露 `capabilities = { canAlarm, canBackgroundPush, canVibrate, canBadge, canFilesystem }`，
UI 依据能力**降级展示**（Web 上"闹钟"按钮 → "提醒 + 加入系统日历"）。详细论证见 [`ALARM-STUDY.md`](ALARM-STUDY.md)。

---

## 4. 数据模型（核心）

### 4.1 设计思路

```
用户视角                       数据模型
─────────────                 ────────────────────────────
"这学期我是第 3 周"      →     Semester（学期 + 起始日 + 总周数）
"第 3 节是 10:00"        →     Period（作息时间表）
"周三 3-4 节有高数"      →     Block（时间块，kind='course'）
"10 月 8 日那次课"       →     Occurrence（展开后的具体一次，稳定 ID）
"提前 20 分钟叫我"       →     Alert（闹钟/提醒，挂 occurrence/block/note）
"这门课我想记点东西"      →     Note（挂 occurrence/block/semester/独立）
```

**核心取舍**：`Block` 是唯一"占时间"的实体，课表/日程/任务只是它的不同 `kind` 视图；
`Occurrence` 是展开出的具体一次，拥有**确定性 ID**，是所有"锚定到某一次"的东西（闹钟、提醒、笔记）的挂载点。

### 4.2 Schema（`packages/core/src/schema.ts`，Zod）

```ts
// ── 语境 ───────────────────────────────────────────────────────
Semester { id, name, startDate:'YYYY-MM-DD', totalWeeks, timezone:'Asia/Shanghai' }
Period   { id, semesterId, index, start:'HH:mm', end:'HH:mm' }   // 作息表：第1节 08:00-08:45

// ── 唯一占时间的实体 ────────────────────────────────────────────
Block {
  id, kind: 'course'|'event'|'task'|'exam', title, color, note?,
  anchor:                                        // 判别联合：时间语义
    | { type:'curriculum', semesterId, weekday:1..7, periods:[start,end], weeks:number[] }
    | { type:'absolute',   start:ISO, end:ISO }
    | { type:'allDay',     date:'YYYY-MM-DD' },
  repeat: { mode:'once' }
        | { mode:'weekly', interval:1|2, until:ISO }
        | { mode:'curriculum', semesterId, weeks:number[] },
  detail?: { teacher?, location?, credits?, courseCode? },   // course/exam 专有
  done?: boolean,                                            // task 专有
  createdAt, updatedAt
}

Occurrence {                                     // 展开后的"具体一次"
  id,                                            // ★ 确定性：`${blockId}#${date}#${periods[0]}`
  blockId, semesterId?, date:'YYYY-MM-DD',
  start:ISO, end:ISO,
  status: 'normal'|'cancelled'|'moved',
  override?: { start?, end?, location?, title? }  // 单次调整
}

Adjustment { id, semesterId, date, action:'cancel'|'move'|'add', blockId, newDate?, newPeriod? }

// ── 附件型资源（与 kind 无关，可挂任意锚点）─────────────────────
Alert {                                          // 闹钟 + 提醒 统一建模
  id,
  ownerType: 'occurrence'|'block'|'semester'|'note',
  ownerId,
  leadMinutes: number,                           // 提前量，0 = 准点
  mode: 'notify' | 'alarm',                      // 提醒 or 闹钟（闹钟需原生能力）
  channels: ('inapp'|'webpush'|'ical'|'local')[],
  repeat: 'once'|'weekly'|'always',
  enabled
}
AlertQueue { id, alertId, occurrenceId, fireAt, sentAt, dedupeKey }   // 去重 + 幂等

Note {
  id, ownerType:'occurrence'|'block'|'semester'|'standalone', ownerId,
  title, bodyPath,                               // 原文落文件 data/notes/<id>.md
  tags:string[], createdAt, updatedAt
}

// ── 其他 ───────────────────────────────────────────────────────
CalendarFeed { token, semesterId, createdAt }    // iCal 订阅令牌
Meta { key, value }                              // schemaVersion、storageEngine、设备 ID、偏好
```

### 4.3 关键约束

1. **`anchor` 是判别联合，不是万能结构**：`curriculum` 的时刻由 `Period` 派生，`absolute` 自带真实时刻，语义不混。
2. **`Occurrence` 落库 + 确定性 ID**：闹钟要扫"未来 instances"，笔记要绑"某一次课"；ID 稳定 ⇒ 重建后附件不丢。
3. **`weeks` 用显式数组**：真实课表会是"3-15 周但跳过第 8 周"，数组最不易错，导出 iCal 时再压缩成规则。
4. **重建是幂等的**：学期/作息/课程/Adjustment 任一变更 → 重算整学期 Occurrence（毫秒级，几百行）。
5. **`Alert` 统一闹钟与提醒**：两者只差 `mode` 与可用通道，避免两套调度逻辑。

### 4.4 时间真相唯一

> `@jiwei/core` 里的 `materialize()` 是**唯一**允许把"模板"变成"具体时刻"的地方。
> 前端预览、落库、iCal 导出、闹钟排程、提醒调度**全部调用它**，任何地方都不得自己算日期。

纯函数清单（全部带单测）：`expandWeeks()` · `materialize()` · `currentWeek()` · `nextOccurrence()` ·
`detectConflicts()` · `toICS()` · `parseWakeUp()` / `parseCSV()`。

---

## 5. 模块系统（"以后加很多功能"的落地机制）

### 5.1 模块契约

```ts
// packages/ui/src/module.ts
export interface FeatureModule {
  id: string                     // 'timetable'
  title: string                  // '课程表'
  icon: ComponentType
  order: number
  routes?: RouteObject[]         // 独立页面（/timetable）
  widgets?: WidgetDef[]          // 可放到首页的卡片
  setup?(ctx: AppContext): void  // 注册查询、迁移、后台任务
}
```

- 每个模块在 `apps/web/src/features/<name>/index.tsx` 导出一个 `FeatureModule`；
- `apps/web/src/modules.ts` **静态导入**全部模块（保持类型安全与 tree-shaking，不用动态扫描）；
- 外壳据此生成**底部导航 / 侧边栏**，并渲染首页的 widget 网格；
- **feature 之间禁止互相 import**：跨模块协作一律走 `@jiwei/core` 类型与 `@jiwei/data` 仓储。

### 5.2 为什么首版就要有它

首版只有课表一个模块，模块系统看似"多余"。但它的成本是**一个 20 行的注册表 + 一个外壳组件**，
收益是：加日程表 = 加一个目录 + 加一行注册，**不用碰课表代码**。这正是用户"以后会加很多功能"的直接回答。

### 5.3 首页 = 模块化仪表盘

首页由 widget 拼装（课表模块提供"今天/下一节课"，日程模块提供"今日日程"，任务模块提供"待交作业"…）。
课表阶段首页只有课表模块的一个 widget；后续模块把自己的 widget 插进来，**首页不需要重写**。

---

## 6. 分层与目录

```
jiwei/
├─ apps/
│  ├─ web/                          # ★ 唯一客户端应用（React PWA）
│  │  └─ src/
│  │     ├─ shell/                  # 外壳：导航、路由、主题、模块注册
│  │     ├─ features/
│  │     │  └─ timetable/           # 首版唯一模块
│  │     │     ├─ index.tsx         # 导出 FeatureModule
│  │     │     ├─ views/            # 周视图、日视图
│  │     │     ├─ components/       # 课程块、周条、课程编辑表单
│  │     │     └─ queries.ts        # 该模块的数据查询
│  │     ├─ modules.ts              # 模块注册表
│  │     └─ main.tsx
│  ├─ api/                          # 可选同步服务（后期启用，初期不跑）
│  └─ native/                       # Capacitor 壳工程（复用 apps/web 产物）
├─ packages/
│  ├─ core/                         # ★ Zod 模型 + materialize + 纯函数（唯一时间真相）
│  ├─ data/                         # ★ 仓储接口 + Dexie 引擎实现（可替换）+ 迁移
│  ├─ ui/                           # ★ 通用组件 + 通用时间网格 + FeatureModule 契约
│  └─ platform/                     # ★ capabilities + notifications/alarm/fs 适配器
├─ docs/
├─ pnpm-workspace.yaml
└─ README.md
```

**依赖方向（严格单向，禁止反向/循环）**

```
features  ──►  shell / ui / data / platform / core
shell     ──►  ui / data / platform / core
data      ──►  core
platform  ──►  core
core      ──►  （无依赖：不碰 DOM、不碰 Node、不碰 Capacitor）
```

> `core` 必须能在 Node、浏览器、原生容器里**无差别运行**，这是多端共享的前提。

---

## 7. 关键路径

### 7.1 课表渲染（M0 起）
- 数据源：`Block(kind='course', anchor.type='curriculum')` 展开出的 `Occurrence`。
- 网格：`grid-template-columns: 56px repeat(7,1fr)`，行 = 节次；课程块 `grid-column: weekday+1`、`grid-row: periodStart / periodEnd+1`，天然支持连堂跨节。
- **网格是通用组件**（`@jiwei/ui` 的 `TimeGrid`）：传"列=星期、行=节次、块=occurrence"，课表与日程共用，只是筛选条件不同。
- 移动端默认**日视图 + 周条**（可左右滑切周），PC 端默认周视图；同一组件按断点切布局。日视图排在 M1，M0 先出周视图。
- 性能：一学期几百条 occurrence，无需虚拟滚动。

### 7.2 存储与初始化
```
main.tsx
  └─ 初始化 platform.capabilities
  └─ createRepos(createDexieEngine())        # 打开 IndexedDB，跑 schema 版本迁移（幂等）
  └─ 载入模块注册表 → 渲染外壳 + 首页 widgets
```

> 将来换 SQLite：`createRepos(createSqliteEngine())` —— 上层代码一行不改（ADR-007）。

### 7.3 导入导出（M3）
- 导入：`parsers/{wakeup,shiguang,csv,json}.ts` 只输出**标准 `Block[]`**；导入向导负责预览与冲突提示。
- 导出：iCal（`CalendarFeed` 令牌 URL）、CSV、JSON 全量备份（**备份 = 一个 JSON 文件**，本地优先的关键保障）。
- 教务抓取**不做**（ADR-001），仅保留 parser 接口。

---

## 8. 测试与质量

| 对象 | 手段 | 重点 |
| --- | --- | --- |
| `@jiwei/core` 纯函数 | Vitest **穷举** | 单双周、跳过周、跨月跨年、闰年、调课、时区、iCal 往返一致性 |
| `@jiwei/data` 仓储 | Vitest（fake-indexeddb） | 迁移、CRUD、Occurrence 重建后附件不丢、仓储接口契约测试 |
| 交互 | Testing Library | 课程编辑、导入向导预览 |
| 端到端 | Playwright（含手机视口） | 录课→周视图→日视图→导出 iCal 全链路 |
| 原生 | 真机手测清单 | 杀掉应用后闹钟是否仍响（M5） |

---

## 9. 风险与对策

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| **过度设计**（首版只有课表却搭大架子） | 交付变慢 | 只落地"模型 + 数据层 + 能力层 + 20 行模块注册"，**不写任何未来功能的逻辑**；M1 范围严格锁死 |
| **存储引擎被业务代码渗透**（换引擎时返工） | 迁移即重构 | 仓储接口 + ESLint 禁止 `features/*` import Dexie（ADR-007）；接口契约测试固定行为 |
| IndexedDB 无事务语义 | Occurrence 重建可能写坏 | 单个 Dexie 事务内"先删后写"，失败自动回滚；重建后校验引用完整性 |
| IndexedDB 数据被浏览器清理 | 数据丢失 | M3 提供一键 JSON 备份 + `navigator.storage.persist()` + UI 提示 |
| 时间/周次算错 | 展示错误、信任崩塌 | `materialize()` 单点实现 + 穷举单测 + iCal 往返校验 |
| 实例重建丢附件 | 闹钟/笔记挂空 | 确定性 `occurrenceId` + 重建后引用完整性校验 |
| 闹钟在 Web 端做不到 | 用户预期落空 | 能力探测 + UI 降级（提醒/系统日历），文案不承诺；原生外壳作为正式方案（M5） |
| 范围膨胀 | 做不完 | 严守 [`ROADMAP.md`](ROADMAP.md) 里程碑，一次只加一个模块 |
| 隐私 | 泄露 | 数据只在本地；本就不抓取教务，无学号/密码入库 |

---

## 10. 决策状态

| ADR | 决策 | 状态 |
| --- | --- | --- |
| ADR-001 | 定位 = 大学生生活 App；首版只做课表，不做账号/教务抓取 | ✅ |
| ADR-002 | 本地优先，首版不做服务器 | ✅ |
| ADR-003 | 首版 IndexedDB（Dexie），存储引擎可替换 | ✅ |
| ADR-004 | `Block` + `Occurrence` 锚点模型；`Alert` 统一闹钟与提醒 | ✅ |
| ADR-005 | 模块化外壳 + `platform` 能力适配层 | ✅ |
| ADR-006 | Capacitor 原生外壳承载闹钟（排期 M5） | ✅ |
| ADR-007 | 存储实现与访问接口分离（仓储模式） | ✅ |

**前置设计已全部确认**，无待定项。下一步：按 [`ROADMAP.md`](ROADMAP.md) 初始化 **M0 地基**。
