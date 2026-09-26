/**
 * 学期语境下的时间查询：周次、作息表、某周日期。
 * 全部是纯函数，可被前端预览、后端落库、iCal 导出、提醒调度共用。
 */
import { Semester, Period } from './schema'
import { addDaysStr, combineDateTime, formatDate, isoWeekday, parseDate } from './date'

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
 * 生成一套常见作息（第 1~12 节）。
 * 这是**默认值**，允许用户在界面上改（M1 提供编辑界面）。
 */
export function buildDefaultPeriods(semesterId: string, now: string): Period[] {
  const spec: Array<[string, string, string | undefined]> = [
    ['08:00', '08:45', '上午'],
    ['08:55', '09:40', '上午'],
    ['10:00', '10:45', '上午'],
    ['10:55', '11:40', '上午'],
    ['14:00', '14:45', '下午'],
    ['14:55', '15:40', '下午'],
    ['16:00', '16:45', '下午'],
    ['16:55', '17:40', '下午'],
    ['19:00', '19:45', '晚上'],
    ['19:55', '20:40', '晚上'],
    ['20:50', '21:35', '晚上'],
    ['21:45', '22:30', '晚上'],
  ]
  // now 参数保留给将来"按创建时间戳派生 id"用；当前 id 由调用方保证唯一即可
  void now
  return spec.map(([start, end, label], i) => ({
    id: `${semesterId}_p${i + 1}`,
    semesterId,
    index: i + 1,
    start,
    end,
    ...(label ? { label } : {}),
  }))
}

/** 今天的日期字符串（本地时区） */
export function today(): string {
  return formatDate(new Date())
}

/** 该日期是周几的中文序号（1=周一） */
export function weekdayOf(date: string): number {
  return isoWeekday(date)
}
