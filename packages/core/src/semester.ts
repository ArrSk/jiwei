/**
 * 学期语境下的时间查询：周次、作息表、某周日期。
 * 全部是纯函数，可被前端预览、后端落库、iCal 导出、提醒调度共用。
 */
import {
  defaultScheduleConfig,
  Period,
  Semester,
  type PeriodTimeSpec,
  type ScheduleConfig,
} from './schema'
import {
  addDaysStr,
  combineDateTime,
  generateSlots,
  isoWeekday,
  parseDate,
} from './date'

/** 按 index 排好序的作息表 */
export function orderPeriods(periods: Period[]): Period[] {
  return [...periods].sort((a, b) => a.index - b.index)
}

/** 取某学期第 `week` 周、星期 `weekday` 的日期（week 从 1 开始） */
export function dateForWeek(semester: Semester, week: number, weekday: number): string {
  return addDaysStr(semester.startDate, (week - 1) * 7 + (weekday - 1))
}

/** 某周 7 天的日期（周一 → 周日） */
export function weekDates(semester: Semester, week: number): string[] {
  return Array.from({ length: 7 }, (_, i) => dateForWeek(semester, week, i + 1))
}

/**
 * 该日期处于第几教学周。
 * 早于开学返回 0，超出总周数返回 `totalWeeks + 1`（便于界面区分"未开学 / 已放假"）。
 */
export function currentWeek(semester: Semester, date: string): number {
  const days = Math.round(
    (parseDate(date).getTime() - parseDate(semester.startDate).getTime()) / 86_400_000,
  )
  if (days < 0) return 0
  const week = Math.floor(days / 7) + 1
  return week > semester.totalWeeks ? semester.totalWeeks + 1 : week
}

/** 某日期落在该学期内的第几天（0 起）；不在学期内返回 -1 */
export function dayOffsetInSemester(semester: Semester, date: string): number {
  const days = Math.round(
    (parseDate(date).getTime() - parseDate(semester.startDate).getTime()) / 86_400_000,
  )
  return days < 0 || days >= semester.totalWeeks * 7 ? -1 : days
}

/**
 * 取一段节次对应的起止时刻。
 * 时刻**只从作息表派生**——这是 `anchor.type==='curriculum'` 不写时间的原因。
 */
export function periodRange(
  periods: Period[],
  date: string,
  fromIndex: number,
  toIndex: number,
): { start: string; end: string } | null {
  const ordered = orderPeriods(periods)
  const startPeriod = ordered.find((p) => p.index === fromIndex)
  const endPeriod = ordered.find((p) => p.index === toIndex)
  if (!startPeriod || !endPeriod) return null
  return {
    start: combineDateTime(date, startPeriod.start),
    end: combineDateTime(date, endPeriod.end),
  }
}

/**
 * 依据作息参数生成完整作息表。
 *
 * 节次 id 是**确定性**的（`${semesterId}_p${index}`），因此修改作息后重建，
 * 节次不会"换身份"，`Occurrence` 的 id（依赖 blockId + date + periodStart）也不受影响。
 *
 * 段落标签由上午/下午/晚上自动带出，界面据此做分组显示。
 */
export function buildPeriodsFromConfig(semesterId: string, config: ScheduleConfig): Period[] {
  // 优先用逐条列出的时刻（真实作息，非等间隔）
  const specs =
    config.presetTimes.length > 0
      ? [...config.presetTimes].sort((a, b) => a.index - b.index)
      : generateSpecsFromSections(config)

  return specs.map((spec, i) => ({
    id: `${semesterId}_p${i + 1}`,
    semesterId,
    index: i + 1,
    start: spec.start,
    end: spec.end,
    ...(spec.label ? { label: spec.label } : {}),
  }))
}

/** 由"上午/下午/晚上 + 时长 + 课间"等间隔生成（presetTimes 为空时的回退路径） */
function generateSpecsFromSections(config: ScheduleConfig): PeriodTimeSpec[] {
  const sections: Array<{ label: string; start: string; count: number }> = [
    { label: '上午', start: config.morning.start, count: config.morning.count },
    { label: '下午', start: config.afternoon.start, count: config.afternoon.count },
    { label: '晚上', start: config.evening.start, count: config.evening.count },
  ]

  const specs: PeriodTimeSpec[] = []
  for (const section of sections) {
    const slots = generateSlots(
      section.start,
      section.count,
      config.periodMinutes,
      config.breakMinutes,
    )
    for (const slot of slots) {
      specs.push({
        index: specs.length + 1,
        label: section.label,
        start: slot.start,
        end: slot.end,
      })
    }
  }
  return specs
}

/**
 * 由当前作息表反推配置（用户逐条改完时间后保存时使用）。
 * 把 `Period[]` 转成 `presetTimes`，保证"所见即所存"。
 */
export function buildScheduleConfigFromPeriods(
  periods: Period[],
  base: ScheduleConfig,
): ScheduleConfig {
  const ordered = [...periods].sort((a, b) => a.index - b.index)
  return {
    ...base,
    presetTimes: ordered.map((p, i) => ({
      index: i + 1,
      start: p.start,
      end: p.end,
      ...(p.label ? { label: p.label } : {}),
    })),
  }
}

/**
 * 生成一套默认作息（第 1~12 节，与参考课表一致）。
 * 保留这个入口是为了兼容旧调用；新代码请用 `buildPeriodsFromConfig`。
 */
export function buildDefaultPeriods(semesterId: string, _now?: string): Period[] {
  return buildPeriodsFromConfig(semesterId, defaultScheduleConfig())
}

/** 今天的日期字符串（本地时区） */
export function today(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

/** 该日期是周几的中文序号（1=周一） */
export function weekdayOf(date: string): number {
  return isoWeekday(date)
}
