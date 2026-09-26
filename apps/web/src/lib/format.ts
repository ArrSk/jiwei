/** 时间显示小工具（界面层专用，业务时间计算一律在 @jiwei/core）。 */
import { format } from 'date-fns'
import { parseDate, WEEKDAY_LABELS, type Occurrence } from '@jiwei/core'

/** `2025-09-24` → `09-24` */
export function shortDate(date: string): string {
  return date.slice(5)
}

/** `2025-09-24` → `9月24日` */
export function mediumDate(date: string): string {
  const d = parseDate(date)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

/** `2025-09-24` → `周三` */
export function weekdayLabel(date: string): string {
  const js = parseDate(date).getDay()
  const index = js === 0 ? 6 : js - 1
  return `周${WEEKDAY_LABELS[index]}`
}

/** 从 ISO 时刻取 `HH:mm` */
export function hhmm(iso: string): string {
  return iso.slice(11, 16)
}

/** 相对时间描述：`3 天后` / `2 小时前` */
export function relativeFromNow(target: string, now = new Date()): string {
  const targetDate = new Date(target)
  const diffMs = targetDate.getTime() - now.getTime()
  const mins = Math.round(diffMs / 60000)
  if (Math.abs(mins) < 60) {
    return mins >= 0 ? `${mins} 分钟后` : `${Math.abs(mins)} 分钟前`
  }
  const hours = Math.round(mins / 60)
  if (Math.abs(hours) < 24) {
    return hours >= 0 ? `${hours} 小时后` : `${Math.abs(hours)} 小时前`
  }
  const days = Math.round(hours / 24)
  return days >= 0 ? `${days} 天后` : `${Math.abs(days)} 天前`
}

/** 场次的展示标签：`第 3-4 节 10:00-11:40` */
export function occurrenceRangeLabel(occ: Occurrence, periodStart: number, periodEnd: number): string {
  const range =
    periodStart === periodEnd ? `第 ${periodStart} 节` : `第 ${periodStart}-${periodEnd} 节`
  return `${range} ${hhmm(occ.start)}-${hhmm(occ.end)}`
}

/** 今天的日期，用于"是否今天"判断 */
export function todayStr(): string {
  return format(new Date(), 'yyyy-MM-dd')
}
