# 几微 · 项目接手说明

接手日期：2026-09-30（Asia/Shanghai）。代码基线：`main` / `6b076a64a0f332cfdcbb53829412b429be82e4ee`。接手前工作区干净。

本报告来自本地源码、配置、历史记录与重新执行的检查。本次完成分析和维护上下文建设；下列缺陷仍待修复。本次未核实线上部署状态或外部调研材料的时效性。

## 1. 项目判断

几微是面向大学生的课程表 PWA，当前是可继续维护的 M1 产品。现有架构适合在原仓库增量演进，暂没有必须重写、接后端或迁移存储的证据。接手后的首要任务是补齐数据恢复和时间展示的可靠性，再推进 M2/M3。

产品特点：手机优先、本地存储、无账号与服务器。运行时数据保存在浏览器 IndexedDB，不在源码仓库内；不同设备与不同 origin 的数据互不共享。

| 能力 | 实际状态 |
| --- | --- |
| 课程增删改、周/日视图、单双周/跳过周/连堂 | 已实现 |
| 多课表与独立作息 | 已实现 |
| 单次调课/停课、恢复调整、批量编辑 | 已实现；存在下文边界问题 |
| 今天/下一节 | 已实现；缺少时钟驱动更新 |
| JSON 全量备份与覆盖恢复 | 已实现；存在高优先级可靠性问题 |
| PWA manifest、SW 预缓存、深色模式、持久化存储申请 | 已实现；手机离线/安装需真机验收 |
| 日程 | 当前是课表模块内的占位页签 |
| CSV/WakeUp 导入、ICS 导出/订阅、任务、笔记、同步 | 尚无成品 |
| 原生 App/锁屏闹钟 | 尚未接入 Capacitor；platform 只有 Web 实现 |

## 2. 实测质量基线

本机：Node `24.18.0`，pnpm `11.19.0`。仓库声明 Node >=22、pnpm `11.8.0`；本次没有安装或升级依赖。

| 检查 | 本次结果 |
| --- | --- |
| `pnpm typecheck` | 5 个包全部通过 |
| `pnpm test` | 136/136：core 77，data 44，web 15 |
| `pnpm build` | 成功，含 manifest、SW 和 15 个预缓存资源 |
| `pnpm smoke` | 23/23 通过；README 原“14 项”计数已同步为 23 |
| 本地浏览器 | 构建产物首页能初始化 IndexedDB、显示空课表；视觉检查正常，捕获的 error/warn 日志为空 |
| 专项诊断 | 临时 Vitest 测试验证恢复失败后数据已替换，以及 40 周学期的备份被自身校验拒绝；临时文件已删除 |

构建产物主 JS 约 552 kB（gzip 169 kB），CSS 约 25 kB。构建有主 chunk 超过 500 kB、core 同时静态/动态导入、Zod 注释标记警告，未阻断构建。

覆盖边界：web 的 15 个测试全部来自 `lib/weeks.test.ts`，没有 React 组件或 Playwright 测试；smoke 只检查静态产物，不验证离线启动/交互。此次未做完整录课流程、手机视口、iOS/Android 安装、飞行模式、线上更新和多标签页一致性验收。

## 3. 代码导航与实际数据链路

| 层 | 关键入口 | 作用 |
| --- | --- | --- |
| 应用启动 | [main.tsx](../apps/web/src/main.tsx)、[bootstrap.ts](../apps/web/src/bootstrap.ts)、[JiweiContext.tsx](../apps/web/src/JiweiContext.tsx) | 装配仓储/平台，初始化学期，提供刷新信号 |
| 外壳与状态 | [App.tsx](../apps/web/src/App.tsx)、[modules.ts](../apps/web/src/modules.ts)、[store.ts](../apps/web/src/store.ts) | 模块渲染、主题、提示与选中课表/周次 |
| 课表业务 | [TimetablePage.tsx](../apps/web/src/features/timetable/TimetablePage.tsx) | 读取学期数据、映射网格、保存/删除/批量编辑、子界面装配 |
| 表单与调整 | `apps/web/src/features/timetable/components/` | CourseForm、AdjustSheet、BatchEditSheet、DayView、TodayCard |
| 设置 | `apps/web/src/shell/` | 课表管理、作息修改、备份恢复、共用 Sheet |
| 领域模型 | [schema.ts](../packages/core/src/schema.ts) | Zod 模型：Semester、Period、Block、Occurrence、Adjustment、Alert、Note |
| 时间展开 | [materialize.ts](../packages/core/src/materialize.ts)、[date.ts](../packages/core/src/date.ts)、[semester.ts](../packages/core/src/semester.ts) | 模板展开、确定性课次 ID、日期/周次/节次计算 |
| 存储契约 | [types.ts](../packages/data/src/types.ts)、[index.ts](../packages/data/src/index.ts) | Repos 接口与引擎装配 |
| Dexie | [db.ts](../packages/data/src/engine/dexie/db.ts)、[repos.ts](../packages/data/src/engine/dexie/repos.ts) | v2 表结构、仓储 CRUD、课次重建与备份写入 |
| 业务数据服务 | [semesters.ts](../packages/data/src/semesters.ts)、[schedule.ts](../packages/data/src/schedule.ts)、[backup.ts](../packages/data/src/backup.ts) | 学期管理、作息与备份格式 |
| 通用 UI/能力 | `packages/ui/src/`、`packages/platform/src/` | TimeGrid、图标、模块接口、文件/通知/存储适配 |

正常写入链路：表单 → 仓储写 Block/Adjustment → `rebuildOccurrences(semesterId)` → core 展开 → 写 Occurrence → `refresh()` 增加 dataVersion → 页面重新读取。`refresh()` 不会自行重建课次，相关注释应修正。

Occurrence ID 是 `occ_<blockId>#<date>#<periodStart>`，调整 ID 由原课程和原日期决定。正常课与调入课为 normal，调出课为 moved，停课为 cancelled；是否真正上课用 `isOccurrenceActive()` 判断。重建相同输入时 ID 稳定，改日期/开始节次则会改变 ID，不能据此承诺所有编辑后附件都不会失联。

## 4. 优先处理的已确认问题

### P1：恢复失败仍可能覆盖当前数据

位置：[repos.ts 的 restoreAll](../packages/data/src/engine/dexie/repos.ts)、[backup.ts](../packages/data/src/backup.ts)、[schema.ts 的 DateStr](../packages/core/src/schema.ts)。

`restoreAll()` 在事务内清库并写入原始记录，事务完成后才逐学期重建课次。`DateStr` 仅检查字符格式，`2026-99-99` 能通过 `parseBackup()`；重建中的日期转换随后抛错，旧数据却已经被新备份替换。

专项复现：导出已有课表，改备份中的学期名与 startDate=`2026-99-99`，校验成功，导入失败；回读仓储已是修改后的学期名与非法日期。现有“要么全成要么全不动”测试只覆盖非法 JSON 在写入前被拒绝，没有覆盖写入后失败。

修复目标：写入前完成真实日期、记录唯一性和跨表引用校验及课次预计算；原始记录与派生记录在同一恢复事务提交。测试覆盖多学期、预计算失败、写入失败、原库保持不变。

### P1：备份恢复后界面仍可能使用旧学期

位置：[BackupSettings.tsx](../apps/web/src/shell/BackupSettings.tsx)、[store.ts](../apps/web/src/store.ts)、[TimetablePage.tsx](../apps/web/src/features/timetable/TimetablePage.tsx)。

恢复成功只调用 `refresh()`，未重置 store 中的 Semester 快照。页面查询时优先使用 `semester`，导入另一设备的备份后旧学期 ID 已不存在，仍可能用它读取空课程/作息；同 ID 时名称/日期/周数也可能过时。这是代码路径确认，尚未执行完整 UI 导入复现。

修复目标：恢复后重新读取活跃学期并更新选中学期，重置周次/日视图与关联临时状态；长期可将 store 改为只保存学期 ID。

### P2：可创建的学期无法从自身备份恢复

位置：[SemesterSheet.tsx](../apps/web/src/shell/SemesterSheet.tsx)、[semesters.ts](../packages/data/src/semesters.ts)、[schema.ts](../packages/core/src/schema.ts)。

界面允许 1~60 周，data 创建/更新不做 Semester schema 校验，而 schema 限制最多 30 周。专项测试确认可创建 40 周学期、成功导出，但 `parseBackup()` 拒绝该备份。

修复目标：统一产品允许的周数，并在 data 边界校验；对已经存在的 31~60 周数据提供兼容策略，避免升级后无法备份恢复。

### P2：“今天/下一节”不会按时间推进

位置：[TimetablePage.tsx 的 todayCard](../apps/web/src/features/timetable/TimetablePage.tsx)。

时间从 `nowIso()` 获取，但计算包在 useMemo 中，依赖只有课次与周数。没有定时刷新或恢复前台事件，页面打开跨过上下课时刻时，卡片可能持续显示旧的“下一节/进行中”。即使发生普通界面重渲染，依赖未变仍会命中缓存；跨零点的今日日期也缺少主动刷新。

修复目标：加入可控时钟信号，并在 visibilitychange/focus 时刷新；用可注入时间验证开课、下课、跨日和重新进入前台。

### P2：调课后的周视图跨度沿用原节次

位置：[TimetablePage.tsx 的 gridBlocks](../apps/web/src/features/timetable/TimetablePage.tsx)。

周视图开始节次来自新课次 ID，结束节次却来自 Block 原始 anchor。把 1~2 节调到 5~6 节后，网格会得到 start=5、end=2；新课次时间正确，但周视图位置/跨度不正确。这是代码路径确认，尚未执行浏览器调课复现。

修复目标：从调整记录或课次位置数据统一得到开始与结束节次，覆盖新旧连堂长度不同的调课测试。

### P2：日期边界与未来日程能力不完整

位置：[repos.ts 的 endDateOf/belongsToSemester](../packages/data/src/engine/dexie/repos.ts)、[date.ts 的 nowIso](../packages/core/src/date.ts)、[materialize.ts](../packages/core/src/materialize.ts)。

- 学期最后一天用本地零点 Date 转 UTC 再截日期。UTC+8 示例：起始 2026-09-28、1 周，当前算法返回 2026-10-03，正确应为 2026-10-04；最后一天的 allDay/absolute 事件会被过滤，curriculum 课程不受这个筛选影响。
- `nowIso()` 使用设备本地钟点再附加 +08:00；设备不在中国时区时会与课次时刻错位。模型 timezone 字段目前不驱动时间换算。
- absolute 展开重拼同一天的 start/end，只取原时间的 HH:mm，跨日结束日期丢失；多学期重建非课程事件还需审查共享课次 ID 与归属覆盖。

修复目标：日期边界统一调用 core 的日历函数，明确固定学校时区语义；M4 前补跨天、时区、重复事件与多学期归属测试。

## 5. 工程与扩展欠账

| 项目 | 实际情况与影响 | 处理方向 |
| --- | --- | --- |
| 文档超前/过时 | ARCHITECTURE 列出 TanStack Query、Router、Radix、表单库、date-fns-tz、Playwright、ESLint/Lefthook，当前依赖/配置未落地；ENVIRONMENT 仍建议 git init，且记载旧测试数量与历史 EPERM | 区分“现状/计划/历史”，以本报告检查结果为接手基线 |
| 分层约束 | 业务未发现直接 import Dexie，但“ESLint 强制禁止”尚无规则实现 | 后续补可执行边界检查 |
| 引擎替换 | Engine.db 类型固定 JiweiDatabase，createRepos 无条件调用 Dexie 实现 | 当前仓储隔离有效，SQLite 接入仍需改造工厂/引擎契约，不能承诺完全只换一行 |
| 更新/重建原子性 | 课程写入、作息更新、学期创建与重建分多步；初始化读取异常缺少局部反馈 | 加业务事务/失败处理，覆盖中途失败与并发操作 |
| 删除引用 | 删除 Block 未清 Adjustment；学期删除未级联 Alert/Note | 当前未开放提醒/笔记，短期影响有限；M5/M7 前定义清理/保留策略 |
| 课次数统计 | summarizeSemesters 仅排除 cancelled，仍把 moved 算入 | 统一用 isOccurrenceActive，避免管理面板多计调课 |
| UI 错误/可访问性 | 部分异步读写没有 catch/finally；Sheet 缺 dialog 语义、焦点管理和 Escape 关闭 | 结合浏览器验收逐项改善 |
| CI | 仅 main push/manual 部署工作流，安装使用 --no-frozen-lockfile；无 PR 检查 | 后续加 PR 质量检查和锁文件一致性检查 |
| 本机验证脚本 | verify.ps1 漏 web 单测与 smoke | 与根命令对齐；修复前不视作完整验收 |
| 性能 | 单主 bundle 超 500 kB，界面上大量逻辑集中在 TimetablePage | 实测低端手机启动后按需拆设置/表单，避免只为消除警告调整阈值 |

## 6. 后续推进顺序

1. 先做数据可靠性小批次：恢复事务/验证、恢复后界面状态、周数边界；补失败回滚和完整备份往返回归。
2. 修复日常看课：时钟刷新、调课跨度、调出课次统计与错误反馈；加入录课→编辑→调课→刷新→恢复的浏览器验收。
3. 完成 M2 剩余内容：安装引导、字号/密度、存储状态；在 iOS/Android 真机验收离线启动和更新。
4. 推进 M3 的 CSV/ICS 文件进出与导入预览。现有静态无后端架构可先交付 ICS 文件导出；持续更新的订阅 URL 需明确托管/更新来源后再设计。
5. 再做 M4 日程与 M5 原生能力。先补现有时间模型边界，不以“模型已有”视作功能完成。

以上是维护优先级建议，本次没有新增里程碑功能。

## 7. 日常开发与发布

```powershell
pnpm dev
pnpm typecheck
pnpm test
pnpm build
pnpm smoke
```

开发端口 5273，构建目录 `apps/web/dist`，静态预览可用 `node scripts/serve-dist.mjs 4173`。构建验证与 smoke 要先后执行，避免检查旧产物。

发布机制：GitHub Actions 在 main 推送后跑检查并部署 Pages；远程为 `https://github.com/ArrSk/jiwei.git`。本次未提交、推送或部署。`pnpm save` 会自动提交并推送，不是只保存文件。

根目录 [AGENTS.md](../AGENTS.md) 保存后续维护约定。每次解决问题后更新本报告的未完成项与验证范围；历史诊断结论不要误写成已修复。

## 8. 2026-09-30：iOS 主屏幕启动 404 处理

- 线上实查：`/jiwei/manifest.webmanifest` 的 start_url 仍为 `/`，域名根目录返回 HTTP 404。
- 本地 `6b076a6` 已包含 start_url/scope=`./` 的修复，但接手时比 origin/main 多三个未推送提交，因此线上仍为旧配置。
- 已推送现有修复提交到 main，Pages 工作流 [36722265061](https://github.com/ArrSk/jiwei/actions/runs/36722265061) 已 completed/success；线上重新读取 manifest 确认 start_url/scope 均为 `./`，maskable 图标也已切换为独立文件。
- 安装恢复步骤已更新到 `使用说明.md`：Safari 打开完整 `/jiwei/` 页面后重新添加，先保留旧图标与课表数据，不要求在 iOS 的域名显示处编辑路径，不建议清除网站数据。
- 本次没有改动课程模型或存储逻辑；修复版本沿用本报告第 2 节已完成的类型/单测/构建检查。

## 9. 2026-10-01：课程可靠性与“今天”第一批修复

用户确认先专注课程表和今日功能，其他生活学习模块暂时只保留入口。本批已完成：

- 备份恢复在清库前完成日期、引用和 `Occurrence` 预计算；恢复失败不会覆盖旧数据，派生课次与原始记录在同一恢复事务提交。
- 恢复备份后重置选中学期、周次、日视图和页签，避免继续使用另一台设备的旧学期快照。
- 学期创建/编辑与界面统一限制为 1~30 周，数据边界开始校验真实日期。
- `nowIso()` 与 `today()` 按学校时区 `Asia/Shanghai` 生成，不跟随设备错误时区；“今天/下一节”每 30 秒、获得焦点和回到前台时刷新。
- 调课到新节次时，周视图跨度使用调整后的结束节次，不再沿用课程模板的原结束节次。
- 新增非法日期恢复回滚回归测试和实际日期校验测试。

本批检查：`pnpm typecheck`、`pnpm test` 138/138、`pnpm build`、`pnpm smoke` 通过（core 78、data 45、web 15，smoke 23 项）。本地浏览器启动页能初始化 IndexedDB；载入示例课表后显示 9 门课程，“下一节 体育（篮球）”卡片与今日日期正确显示。尚未完成完整录课/调课交互和手机真机验收；M2~M8 路线图暂未修改。

## 10. 2026-10-01：今天首页与手机状态提示

用户要求先把应用真正做起来，当前优先级是课程表和“今天”，记账、笔记、待办与 AI 先保留扩展位置。本批完成：

- 默认打开“今天”首页：按学校时区显示日期、当前/下一节课和当天全部课程；点课程仍可编辑，点“调/停”仍可处理单次调课。
- 底部导航拆成“今天 / 课程表 / 日程”，课程表保留原来的周视图、日视图和编辑能力，日程继续明确标为后续功能。
- 平台层新增应用状态适配器：页面统一显示在线/离线状态，并在浏览器提供安装入口时显示“安装到手机”；没有入口时给出添加到主屏幕的操作提示，为后续原生外壳保留同一接口。

本批检查：`pnpm typecheck`、`pnpm test`（78 + 45 + 15 = 138）、`pnpm build`、`pnpm smoke` 通过。浏览器实测首页显示示例课表的“进行中 体育（篮球）”、当天课程列表和离线/安装提示；切换到课程表后仍显示 9 门课、周视图和底部导航。未做手机真机验收，安装按钮是否出现取决于浏览器是否发出 PWA 安装事件。

## 11. 2026-10-01：用户确认后续路线

用户确认继续按“今天首页 + 课程表入口 + 离线/安装提示”的方向推进。本轮只更新产品路线与架构决策文档：M2 聚焦手机可靠性，M3 做数据进出和课程表图片导入，M4 做日程与官方模块开关，M5 做提醒和 AI 待确认草稿，M6 做待办与基础记账，M7 做文字/手写笔记与识图，M8 再评估同步和受控开发者插件。以上阶段尚未宣称已实现。

## 12. 2026-10-01：移除日程占位入口

用户要求暂时删掉未实现的“日程”栏目。本次移除底部导航中的日程按钮和对应占位页，只保留“今天 / 课程表”；日程仍保留在 M4 路线中，等功能真实可用后再加入入口。`pnpm typecheck`、`pnpm test`（138）、`pnpm build`、`pnpm smoke`（23 项）通过。

## 13. 2026-10-04：M2 手机体验第一步

- 设置页新增“阅读与显示”：可切换标准/大字模式和紧凑/宽松课表密度，偏好保存到本地 `meta`，重新打开后仍保留；不改变课程数据。
- “今天”页的安装入口改为打开完整安装说明，覆盖 iPhone/iPad、安卓和电脑；浏览器提供安装能力时再显示实际安装按钮。说明同时提醒离线使用、HTTPS 和不同网址之间数据独立。
- 新增外观偏好的默认值、正常保存读取和坏数据回退测试。

本批检查：`pnpm typecheck`、`pnpm test`（core 78、data 48、web 15，共 141）、`pnpm build`、`pnpm smoke`（23 项）通过。浏览器本地实测“今天”页、安装说明弹窗、设置中的字号/密度控制均可用；尚未完成 iOS/Android 真机和飞行模式验收。当前未提交、推送或部署。

## 14. 2026-10-04：M3 课程 CSV 导入第一步（仅本地）

- 设置页新增课程表导入入口，可下载 CSV 模板并选择课程文件。
- 导入先解析中文/英文表头、星期、节次和周次，展示逐行预览；有错误的行会明确标出，用户确认后才新增课程，不覆盖已有课程。
- 写入课程后统一重建当前学期的课次；批量写入失败时尝试恢复导入前的数据快照。图片识别暂未接入，后续复用同一份课程草稿和预览流程。

本批检查：`pnpm typecheck`、`pnpm test`（core 78、data 51、web 15，共 144）、`pnpm build`、`pnpm smoke`（23 项）通过。浏览器本地实测设置页能显示“课程表导入”“下载模板”“选择课程 CSV”。本批只保留在本地工作区，未提交或推送 GitHub。

## 17. 2026-10-04：M3 课程 CSV 导出（仅本地）

- 课程表设置新增“导出当前”，把当前学期的课程导出为可再次导入的 CSV。
- 导入和导出共用同一套字段：课程名、教师、教室、星期、节次、周次和颜色；课程名含逗号时会正确转义。

本批检查：`pnpm typecheck`、`pnpm test`（core 78、data 52、web 15，共 145）、`pnpm build`、`pnpm smoke`（23 项）通过。浏览器本地确认“下载模板 / 导出当前 / 选择文件”均显示。未提交或推送 GitHub。

## 18. 2026-10-04：M3 日历导出与图片预览（仅本地）

- 课程表设置新增“导出到日历”，按已生成的具体课次导出 ICS；停课课次不会写入，调课后的日期和覆盖地点会使用实际结果。
- 新增课程表图片选择和本地预览，当前不会自动识别或写入课程；后续 AI/OCR 接入时仍必须先显示草稿并由用户确认。

本批检查：`pnpm typecheck`、`pnpm test`（core 78、data 53、web 15，共 146）、`pnpm build`、`pnpm smoke`（23 项）通过。浏览器本地确认课程表设置内的 CSV、ICS 和图片入口可见。未提交或推送 GitHub。

## 15. 2026-10-04：简化“今天”顶部

- “今天”页面顶部移除课程表页的学期切换按钮，只保留居中的“今天”和设置入口。
- 课程表页面仍保留学期切换、周次切换、添加课程和设置等完整控件。

本次只改界面布局；`pnpm typecheck` 和 `pnpm test`（144 项）通过，浏览器本地确认“今天”顶部已不再显示学期下拉。未提交或推送 GitHub。

## 16. 2026-10-04：拆分课表设置与通用设置（仅本地）

- 课程表页顶部新增小日历按钮“课表设置”，集中放置当前课表管理、作息时间和课程 CSV 导入。
- 通用“设置”保留阅读显示、安装离线、备份恢复、平台能力和本地数据；底部新增“课表功能设置”入口，方便需要时跳转。
- “今天”页仍只显示通用设置入口，不会出现课程表专属控件。

本批检查：`pnpm typecheck`、`pnpm test`（144 项）、`pnpm build`、`pnpm smoke`（23 项）通过。浏览器本地确认课表顶部小日历按钮、课表设置面板和通用设置底部入口均可用。未提交或推送 GitHub。
