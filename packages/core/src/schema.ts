/**
 * 几微（jiwei）领域模型
 *
 * 设计要点（详见 docs/ARCHITECTURE.md 第 4 节）：
 * - `Block` 是唯一"占时间"的实体，`kind` 决定它是课 / 日程 / 任务 / 考试。
 *   课表只是 `kind='course'` 的一个视图，不是模型的中心。
 * - `Block.anchor` 是判别联合：`curriculum`（教学周×星期×节次，时刻由作息表派生）、
 *   `absolute`（自带真实时刻）、`allDay`（全天）。
 * - `Occurrence` 是展开后的"具体一次"，有自己的确定性 ID，是闹钟/提醒/笔记的挂载点。
 * - `Alert` 统一闹钟与提醒，`mode` 区分；`Note` 用 `ownerType` 支持四种粒度。
 *
 * 约束：本包不得依赖 DOM、Node API 或任何存储引擎（见 ARCHITECTURE 第 6 节依赖方向）。
 */
import { z } from 'zod'

// ─────────────────────────────────────────────────────────────
// 基础标量
// ─────────────────────────────────────────────────────────────

/** 真实日期，`YYYY-MM-DD`（本地语义，避免 UTC 偏移把周一算成周日） */
export const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD')

/** 一天内的钟点，`HH:mm` */
export const TimeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, '时间格式应为 HH:mm')

/** 带时区的完整时刻（ISO 8601）；为空表示"全天"或"由作息表派生" */
export const DateTimeStr = z.string().min(1)

/** 本地 id 生成策略见 docs/ARCHITECTURE.md：允许注入 id 生成器，服务端可换 uuid */
export const Id = z.string().min(1)

/** 周几：1 = 周一 …… 7 = 周日（ISO 8601，与 JS getDay() 的 0=周日不同，注意转换） */
export const Weekday = z.number().int().min(1).max(7)

/** 节次下标，从 1 开始 */
export const PeriodIndex = z.number().int().min(1)

export const Timezone = z.string().default('Asia/Shanghai')

// ─────────────────────────────────────────────────────────────
// 学期与作息表
// ─────────────────────────────────────────────────────────────

/**
 * 学期。`startDate` 必须是**第 1 教学周的周一**——整个周次计算都基于它。
 */
export const Semester = z.object({
  id: Id,
  name: z.string().min(1, '学期名称不能为空'),
  startDate: DateStr,
  totalWeeks: z.number().int().min(1).max(30).default(20),
  timezone: Timezone,
  isActive: z.boolean().default(true),
  createdAt: DateTimeStr,
  updatedAt: DateTimeStr,
})
export type Semester = z.infer<typeof Semester>

/**
 * 作息时间表：第 N 节几点到几点。
 * 做成数据而非硬编码——不同学校作息不同，且用户可能自定义。
 */
export const Period = z.object({
  id: Id,
  semesterId: Id,
  index: PeriodIndex,
  label: z.string().optional(),
  start: TimeStr,
  end: TimeStr,
})
export type Period = z.infer<typeof Period>

/** 一个学期 + 它的作息表，展开 Occurrence 所需的最小上下文 */
export const SemesterConfig = z.object({
  semester: Semester,
  periods: z.array(Period),
})
export type SemesterConfig = z.infer<typeof SemesterConfig>

/**
 * 作息参数：生成作息表的"配方"。
 *
 * 为什么不直接让用户填每一节的起止时间：真实学校的作息就是
 * `节数 × (每节时长 + 课间休息)` 连续排下去的。给四个参数比给 12 组时间好填得多，
 * 且改「每节时长」时全部节次会一起变。
 *
 * 上午 / 下午 / 晚上各自有独立的开始时间与节数，中间的空档（午休）不用显式声明 ——
 * 它就是"上一段结束"到"下一段开始"之间的间隔。
 */
export const ScheduleConfig = z.object({
  /** 每节课时长（分钟）。默认 45 */
  periodMinutes: z.number().int().min(20).max(120).default(45),
  /** 课间休息（分钟）。默认 5 */
  breakMinutes: z.number().int().min(0).max(60).default(5),
  morning: z
    .object({
      start: TimeStr.default('08:00'),
      count: z.number().int().min(0).max(8).default(4),
    })
    .default({ start: '08:00', count: 4 }),
  afternoon: z
    .object({
      start: TimeStr.default('13:45'),
      count: z.number().int().min(0).max(8).default(4),
    })
    .default({ start: '13:45', count: 4 }),
  evening: z
    .object({
      start: TimeStr.default('19:00'),
      count: z.number().int().min(0).max(6).default(4),
    })
    .default({ start: '19:00', count: 4 }),
})
export type ScheduleConfig = z.infer<typeof ScheduleConfig>

/** 与产品默认值一致的作息参数（测试与首次启动都用它） */
export function defaultScheduleConfig(): ScheduleConfig {
  return ScheduleConfig.parse({})
}

// ─────────────────────────────────────────────────────────────
// Block：唯一"占时间"的实体
// ─────────────────────────────────────────────────────────────

export const BlockKind = z.enum(['course', 'event', 'task', 'exam'])
export type BlockKind = z.infer<typeof BlockKind>

/**
 * 时间锚点。
 * - `curriculum`：教学语境。时刻不写在这里，由 `Period` 表派生，所以只有 weekday + 节次 + 教学周。
 * - `absolute`：日程/任务。自带真实时刻。
 * - `allDay`：全天事件。
 */
export const BlockAnchor = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('curriculum'),
    semesterId: Id,
    weekday: Weekday,
    periods: z
      .tuple([PeriodIndex, PeriodIndex])
      .refine(([a, b]) => b >= a, { message: '结束节次不能早于开始节次' }),
    weeks: z.array(z.number().int().min(1)).min(1, '至少要有一周'),
  }),
  z.object({
    type: z.literal('absolute'),
    // 用 ISO 字符串而非 Date，保持可序列化、可比较、可存 IndexedDB
    start: DateTimeStr,
    end: DateTimeStr,
  }),
  z.object({
    type: z.literal('allDay'),
    date: DateStr,
  }),
])
export type BlockAnchor = z.infer<typeof BlockAnchor>

/**
 * 重复规则。
 * - `once`：只发生一次（absolute / allDay 用）
 * - `weekly`：每 N 周重复到 until（绝对时间用）
 * - `curriculum`：按教学周集合重复（课表用；weeks 与 anchor.weeks 保持一致）
 */
export const Repeat = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('once') }),
  z.object({
    mode: z.literal('weekly'),
    interval: z.union([z.literal(1), z.literal(2)]).default(1),
    until: DateStr,
  }),
  z.object({
    mode: z.literal('curriculum'),
    semesterId: Id,
    weeks: z.array(z.number().int().min(1)).min(1),
  }),
])
export type Repeat = z.infer<typeof Repeat>

/** 课 / 考专有字段 */
export const BlockDetail = z.object({
  teacher: z.string().optional(),
  location: z.string().optional(),
  credits: z.number().optional(),
  courseCode: z.string().optional(),
})
export type BlockDetail = z.infer<typeof BlockDetail>

export const Block = z.object({
  id: Id,
  kind: BlockKind,
  title: z.string().min(1, '名称不能为空'),
  /** 用于网格上的色块；留空则由界面按标题哈希分配 */
  color: z.string().optional(),
  note: z.string().optional(),
  anchor: BlockAnchor,
  repeat: Repeat.default({ mode: 'once' }),
  /** 仅 kind 为 course / exam 时有意义 */
  detail: BlockDetail.optional(),
  /** 仅 kind 为 task 时有意义 */
  done: z.boolean().optional(),
  createdAt: DateTimeStr,
  updatedAt: DateTimeStr,
})
export type Block = z.infer<typeof Block>

// ─────────────────────────────────────────────────────────────
// Occurrence：展开后的"具体一次"
// ─────────────────────────────────────────────────────────────

export const OccurrenceStatus = z.enum(['normal', 'cancelled', 'moved'])
export type OccurrenceStatus = z.infer<typeof OccurrenceStatus>

/**
 * `id` 是**确定性**的：`occ_${blockId}#${date}#${periodStart|0}`。
 * 全面重建后 ID 不变 ⇒ 挂在上面的闹钟与笔记永不丢失（docs/ARCHITECTURE.md 4.3 第 2 条）。
 */
export const Occurrence = z.object({
  id: Id,
  blockId: Id,
  semesterId: Id.optional(),
  date: DateStr,
  start: DateTimeStr,
  end: DateTimeStr,
  status: OccurrenceStatus.default('normal'),
  /** 单次调整：改了时间/地点但没改模板 */
  override: z
    .object({
      start: DateTimeStr.optional(),
      end: DateTimeStr.optional(),
      location: z.string().optional(),
      title: z.string().optional(),
    })
    .optional(),
})
export type Occurrence = z.infer<typeof Occurrence>

// ─────────────────────────────────────────────────────────────
// Adjustment：调课 / 停课 / 补课
// ─────────────────────────────────────────────────────────────

export const AdjustmentAction = z.enum(['cancel', 'move', 'add'])
export type AdjustmentAction = z.infer<typeof AdjustmentAction>

export const Adjustment = z.object({
  id: Id,
  semesterId: Id,
  date: DateStr,
  action: AdjustmentAction,
  blockId: Id,
  newDate: DateStr.optional(),
  newPeriods: z.tuple([PeriodIndex, PeriodIndex]).optional(),
  reason: z.string().optional(),
})
export type Adjustment = z.infer<typeof Adjustment>

// ─────────────────────────────────────────────────────────────
// 附件型资源：提醒 / 闹钟、笔记、日历订阅
// ─────────────────────────────────────────────────────────────

export const AlertOwnerType = z.enum(['occurrence', 'block', 'semester', 'note'])
export type AlertOwnerType = z.infer<typeof AlertOwnerType>

/** `mode='alarm'` 需要原生能力（Capacitor）；Web 端只提供 notify 与 ical。详见 docs/ALARM-STUDY.md */
export const AlertMode = z.enum(['notify', 'alarm'])
export type AlertMode = z.infer<typeof AlertMode>

export const AlertChannel = z.enum(['inapp', 'webpush', 'ical', 'local'])
export type AlertChannel = z.infer<typeof AlertChannel>

export const Alert = z.object({
  id: Id,
  ownerType: AlertOwnerType,
  ownerId: Id,
  /** 提前量（分钟）。0 = 准点 */
  leadMinutes: z.number().int().min(0).max(1440).default(10),
  mode: AlertMode.default('notify'),
  channels: z.array(AlertChannel).default(['inapp']),
  repeat: z.enum(['once', 'weekly', 'always']).default('always'),
  enabled: z.boolean().default(true),
  createdAt: DateTimeStr,
})
export type Alert = z.infer<typeof Alert>

/** 推送去重队列（M5 使用），dedupeKey 保证同一提醒不重复打扰 */
export const AlertQueue = z.object({
  id: Id,
  alertId: Id,
  occurrenceId: Id,
  fireAt: DateTimeStr,
  sentAt: DateTimeStr.optional(),
  dedupeKey: z.string(),
})
export type AlertQueue = z.infer<typeof AlertQueue>

export const NoteOwnerType = z.enum(['occurrence', 'block', 'semester', 'standalone'])
export type NoteOwnerType = z.infer<typeof NoteOwnerType>

export const Note = z.object({
  id: Id,
  ownerType: NoteOwnerType,
  ownerId: Id.optional(),
  title: z.string().default(''),
  /** Markdown 原文的存放路径；空表示正文尚未落盘 */
  bodyPath: z.string().optional(),
  tags: z.array(z.string()).default([]),
  createdAt: DateTimeStr,
  updatedAt: DateTimeStr,
})
export type Note = z.infer<typeof Note>

/** iCal 订阅令牌（单用户，无 User 表） */
export const CalendarFeed = z.object({
  token: z.string().min(1),
  semesterId: Id,
  createdAt: DateTimeStr,
})
export type CalendarFeed = z.infer<typeof CalendarFeed>

/** 键值元数据：schemaVersion / storageEngine / 设备 ID / 偏好 */
export const Meta = z.object({
  key: z.string().min(1),
  value: z.string(),
})
export type Meta = z.infer<typeof Meta>

// ─────────────────────────────────────────────────────────────
// 常量的中文展示名
// ─────────────────────────────────────────────────────────────

export const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const

export const BLOCK_KIND_LABELS: Record<BlockKind, string> = {
  course: '课程',
  event: '日程',
  task: '任务',
  exam: '考试',
}
