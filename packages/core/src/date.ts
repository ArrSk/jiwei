/**
 * 日期与日期时间纯函数。
 *
 * 两条铁律（docs/ARCHITECTURE.md 4.4）：
 * 1. 本文件是**唯一**允许做日期运算的地方，其它模块不得自己算日期。
 * 2. 全部按"本地日历语义"处理：用 `YYYY-MM-DD` 字符串而非 `Date` 传递日期，
 *    避免 UTC 偏移把周一算成周日。钟点用 `HH:mm`，只在生成 `start`/`end` 时拼成带偏移的 ISO。
 */
import { addDays, differenceInCalendarDays, format, parse, startOfDay } from 'date-fns'

/** 从 `YYYY-MM-DD` 解析为本地零点 Date */
export function parseDate(date: string): Date {
  return startOfDay(parse(date, 'yyyy-MM-dd', new Date()))
}

/** 该日期所在周的周一 */
export function mondayOf(date: string): string {
  return addDaysStr(date, -(isoWeekday(date) - 1))
}

/** 生成带时区偏移的当前时刻字符串，格式与 `Occurrence.start` 一致，可直接做字符串比较 */
export function nowIso(): string {
  return `${formatDate(new Date())}T${format(new Date(), 'HH:mm:ss')}+08:00`
}

/** Date → `YYYY-MM-DD` */
export function formatDate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

/** 该日期是周几（1 = 周一 …… 7 = 周日，ISO 8601）。JS 的 getDay() 里周日是 0，这里统一成 7。 */
export function isoWeekday(date: Date | string): number {
  const d = typeof date === 'string' ? parseDate(date) : date
  const js = d.getDay()
  return js === 0 ? 7 : js
}

/** 日期加减天数 */
export function addDaysStr(date: string, days: number): string {
  return formatDate(addDays(parseDate(date), days))
}

/** `b - a` 的整日差（按本地日历计） */
export function diffDays(a: string, b: string): number {
  return differenceInCalendarDays(parseDate(b), parseDate(a))
}

/**
 * 两个 `HH:mm` 之间的分钟数（b - a）。
 * 结束早于开始视为跨零点，自动 +24h（用于晚间课跨天这种边界）。
 */
export function minutesBetween(a: string, b: string): number {
  const toMin = (t: string): number => {
    const [h = '0', m = '0'] = t.split(':')
    return Number(h) * 60 + Number(m)
  }
  const raw = toMin(b) - toMin(a)
  return raw < 0 ? raw + 24 * 60 : raw
}

/** `HH:mm` → 当天分钟数 */
export function timeToMinutes(time: string): number {
  const [h = '0', m = '0'] = time.split(':')
  return Number(h) * 60 + Number(m)
}

/** 当天分钟数 → `HH:mm`（跨零点自动取模） */
export function minutesToTime(total: number): string {
  const wrapped = ((total % 1440) + 1440) % 1440
  const h = Math.floor(wrapped / 60)
  const m = wrapped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** 在 `HH:mm` 上加减分钟 */
export function addMinutesToTime(time: string, minutes: number): string {
  return minutesToTime(timeToMinutes(time) + minutes)
}

/**
 * 生成一串节次时刻（等间隔）。
 *
 * 适合"每节时长与课间都统一"的快速生成；真实作息往往不是等间隔
 * （例如第 3 节前休息 15 分钟、午休、下午第一节前休息 15 分钟），
 * 那种情况应直接给出每节的起止时间，见 `PeriodTimeSpec` 用法。
 *
 * @example 默认（45 分钟一节课、课间 5 分钟、上午 08:00 起、上午 4 节）
 *   → 08:00-08:45、08:50-09:35、09:40-10:25、10:30-11:15
 */
export function generateSlots(
  start: string,
  count: number,
  durationMinutes: number,
  breakMinutes: number,
): Array<{ start: string; end: string }> {
  const slots: Array<{ start: string; end: string }> = []
  if (count <= 0 || durationMinutes <= 0) return slots
  let cursor = timeToMinutes(start)
  for (let i = 0; i < count; i += 1) {
    const slotStart = cursor
    const slotEnd = cursor + durationMinutes
    slots.push({ start: minutesToTime(slotStart), end: minutesToTime(slotEnd) })
    cursor = slotEnd + Math.max(0, breakMinutes)
  }
  return slots
}

/**
 * 在每节时长固定的前提下，由开始时间推算结束时间。
 * 用于"用户填了开始时间，结束时间自动补上"，也用于校验。
 */
export function inferEndTime(start: string, durationMinutes: number): string {
  return addMinutesToTime(start, durationMinutes)
}

/** `HH:mm` 是否合法（用于表单校验，避免写入 25:00 这类值） */
export function isValidTime(time: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
}

/**
 * 拼出带时区偏移的 ISO 时刻（用于 `start` / `end`）。
 * 固定用 Asia/Shanghai（UTC+8，无夏令时）——本项目单用户，且学校作息以本地时间为准。
 * 若将来要支持其它时区，改这里一处即可。
 */
export function combineDateTime(date: string, time: string): string {
  return `${date}T${time}:00+08:00`
}

/** 从 ISO 时刻里取出日期部分 */
export function dateOfDateTime(iso: string): string {
  return iso.slice(0, 10)
}

/** 从 ISO 时刻里取出 `HH:mm` */
export function timeOfDateTime(iso: string): string {
  return iso.slice(11, 16)
}
