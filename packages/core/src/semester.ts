/**
 * 学期语境下的时间查询：周次、作息表、某周日期。
 * 全部是纯函数，可被前端预览、后端落库、iCal 导出、提醒调度共用。
 */
import { defaultScheduleConfig, Period, Semester, type ScheduleConfig } from './schema'
import {
  addDaysStr,
  combineDateTime,
  formatDate,
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
  const sections: Array<{ label: string; start: string; count: number }> = [
    { label: '上午', start: config.morning.start, count: config.morning.count },
    { label: '下午', start: config.afternoon.start, count: config.afternoon.count },
    { label: '晚上', start: config.evening.start, count: config.evening.count },
  ]

  const periods: Period[] = []
  for (const section of sections) {
    const slots = generateSlots(
      section.start,
      section.count,
      config.periodMinutes,
      config.breakMinutes,
    )
    for (const slot of slots) {
      periods.push({
        id: `${semesterId}_p${periods.length + 1}`,
        semesterId,
        index: periods.length + 1,
        label: section.label,
        start: slot.start,
        end: slot.end,
      })
    }
  }
  return periods
}

/**
 * 生成一套常见作息（第 1~12 节）。
 * 保留这个入口是为了兼容旧调用；新代码请用 `buildPeriodsFromConfig`，
 * 它支持用户自定义时长/课间/起始时间。
 */
export function buildDefaultPeriods(semesterId: string, _now?: string): Period[] {
  return buildPeriodsFromConfig(semesterId, defaultScheduleConfig())
}

/** 今天的日期字符串（本地时区） */
export function today(): string {
  return formatDate(new Date())
}

/** 该日期是周几的中文序号（1=周一） */
export function weekdayOf(date: string): number {
  return isoWeekday(date)
}
