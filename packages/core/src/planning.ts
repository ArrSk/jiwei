import { Block as BlockSchema, type Block, type PlanType } from './schema'
import { dateOfDateTime, isoWeekday, isValidDateStr, timeOfDateTime, combineDateTime } from './date'

export const PLAN_TYPE_LABELS: Record<PlanType, string> = {
  deadline: '截止事项', longterm: '长期 / 无期限', range: '区间计划', weekly: '每周重复', event: '事件 / 考试',
}

export function planTypeOf(block: Block): PlanType {
  const anchor = block.anchor
  if (anchor.type === 'deadline') return 'deadline'
  if (anchor.type === 'floating') return 'longterm'
  if (anchor.type === 'range') return 'range'
  if (anchor.type === 'weekly') return 'weekly'
  return 'event'
}

export function planSortKey(block: Block): string {
  const anchor = block.anchor
  if (anchor.type === 'floating') return '9999-12-31'
  if (anchor.type === 'curriculum') return ''
  if (anchor.type === 'deadline' || anchor.type === 'allDay') return anchor.date
  if (anchor.type === 'weekly') return anchor.startDate
  return anchor.start
}

export function isPlanComplete(block: Block, date: string): boolean {
  return block.anchor.type === 'weekly' ? (block.completedDates ?? []).includes(date) : block.done === true
}

export function isPlanOverdue(block: Block, now: string): boolean {
  if (block.done || block.anchor.type !== 'deadline') return false
  return combineDateTime(block.anchor.date, block.anchor.time ?? '23:59') < now
}

/** 今天摘要使用这个规则，独立于学期、模块开关和派生课次。 */
export function isPlanOnDate(block: Block, date: string): boolean {
  if (isPlanComplete(block, date)) return false
  const anchor = block.anchor
  if (anchor.type === 'allDay') return anchor.date === date
  if (anchor.type === 'deadline') return anchor.date <= date
  if (anchor.type === 'absolute') return date >= dateOfDateTime(anchor.start) && date <= dateOfDateTime(anchor.end)
  if (anchor.type === 'range') return date >= anchor.start && date <= anchor.end
  if (anchor.type === 'weekly') return date >= anchor.startDate && (!anchor.until || date <= anchor.until) && anchor.weekdays.includes(isoWeekday(date))
  return false
}

export function describePlan(block: Block): string {
  const anchor = block.anchor
  if (anchor.type === 'floating') return '没有截止日期，按自己的节奏推进'
  if (anchor.type === 'deadline') return `${anchor.date}${anchor.time ? ` ${anchor.time}` : ''} 截止`
  if (anchor.type === 'range') return `${anchor.start} 至 ${anchor.end}`
  if (anchor.type === 'weekly') {
    const days = [...anchor.weekdays].sort((a, b) => a - b).map((day) => ['一','二','三','四','五','六','日'][day - 1]).join('、')
    return `每周${days}${anchor.startTime ? ` · ${anchor.startTime}–${anchor.endTime}` : ''} · ${anchor.startDate} 起${anchor.until ? `，至 ${anchor.until}` : ''}`
  }
  if (anchor.type === 'allDay') return `${anchor.date} · 全天`
  if (anchor.type === 'absolute') return `${dateOfDateTime(anchor.start)} ${timeOfDateTime(anchor.start)} 至 ${dateOfDateTime(anchor.end)} ${timeOfDateTime(anchor.end)}`
  return '按教学周安排'
}

/** 写入和恢复共用校验；拒绝不存在的日期与倒置区间。 */
export function validatePlan(block: Block): void {
  BlockSchema.parse(block)
  if (block.kind === 'course' || block.anchor.type === 'curriculum') throw new Error('课程请通过课程表编辑')
  const anchor = block.anchor
  const dates: string[] = [...(block.completedDates ?? [])]
  if (anchor.type === 'allDay' || anchor.type === 'deadline') dates.push(anchor.date)
  if (anchor.type === 'range') dates.push(anchor.start, anchor.end)
  if (anchor.type === 'weekly') {
    dates.push(anchor.startDate)
    if (anchor.until) {
      dates.push(anchor.until)
      if (anchor.until < anchor.startDate) throw new Error('重复结束日期不能早于开始日期')
    }
    if ((anchor.startTime === undefined) !== (anchor.endTime === undefined)) throw new Error('请完整填写起止时间')
    if (anchor.startTime && anchor.endTime && anchor.endTime <= anchor.startTime) throw new Error('结束时间要晚于开始时间')
    if (new Set(anchor.weekdays).size !== anchor.weekdays.length) throw new Error('重复星期不能重复')
  }
  if (anchor.type === 'absolute') {
    dates.push(dateOfDateTime(anchor.start), dateOfDateTime(anchor.end))
    if (!Number.isFinite(Date.parse(anchor.start)) || !Number.isFinite(Date.parse(anchor.end))) throw new Error('事项的起止时间无效')
    if (Date.parse(anchor.end) <= Date.parse(anchor.start)) throw new Error('结束时间要晚于开始时间')
  }
  if (dates.some((date) => !isValidDateStr(date))) throw new Error('请填写有效日期')
}
