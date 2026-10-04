import { describe, expect, it } from 'vitest'
import {
  addDaysStr,
  combineDateTime,
  dateOfDateTime,
  diffDays,
  formatDate,
  isValidDateStr,
  isoWeekday,
  minutesBetween,
  parseDate,
  timeOfDateTime,
} from './date'

describe('date 纯函数', () => {
  it('parseDate / formatDate 往返一致，且不发生时区漂移', () => {
    expect(formatDate(parseDate('2025-09-22'))).toBe('2025-09-22')
    expect(formatDate(parseDate('2025-01-01'))).toBe('2025-01-01')
    expect(formatDate(parseDate('2025-12-31'))).toBe('2025-12-31')
  })

  it('isoWeekday：周一=1 …… 周日=7（而不是 JS 的 0）', () => {
    expect(isoWeekday('2025-09-22')).toBe(1) // 周一
    expect(isoWeekday('2025-09-23')).toBe(2)
    expect(isoWeekday('2025-09-27')).toBe(6)
    expect(isoWeekday('2025-09-28')).toBe(7) // 周日
  })

  it('addDaysStr 能跨月、跨年、跨闰日', () => {
    expect(addDaysStr('2025-09-30', 1)).toBe('2025-10-01')
    expect(addDaysStr('2025-12-31', 1)).toBe('2026-01-01')
    expect(addDaysStr('2024-02-28', 1)).toBe('2024-02-29') // 闰年
    expect(addDaysStr('2025-02-28', 1)).toBe('2025-03-01') // 平年
    expect(addDaysStr('2025-09-22', -7)).toBe('2025-09-15')
  })

  it('diffDays 计算整日差', () => {
    expect(diffDays('2025-09-22', '2025-09-28')).toBe(6)
    expect(diffDays('2025-09-22', '2025-10-06')).toBe(14)
    expect(diffDays('2025-10-06', '2025-09-22')).toBe(-14)
  })

  it('isValidDateStr 拒绝格式正确但实际不存在的日期', () => {
    expect(isValidDateStr('2025-02-28')).toBe(true)
    expect(isValidDateStr('2024-02-29')).toBe(true)
    expect(isValidDateStr('2025-02-29')).toBe(false)
    expect(isValidDateStr('2026-99-99')).toBe(false)
  })

  it('minutesBetween / timeToMinutes 处理同刻与正常区间', () => {
    expect(minutesBetween('08:00', '08:45')).toBe(45)
    expect(minutesBetween('08:00', '08:00')).toBe(0)
    expect(minutesBetween('00:00', '23:59')).toBe(1439)
  })

  it('combineDateTime 产出带 +08:00 偏移的可比较字符串', () => {
    expect(combineDateTime('2025-09-22', '08:00')).toBe('2025-09-22T08:00:00+08:00')
  })

  it('dateOfDateTime / timeOfDateTime 反向取值', () => {
    const iso = combineDateTime('2025-09-22', '14:55')
    expect(dateOfDateTime(iso)).toBe('2025-09-22')
    expect(timeOfDateTime(iso)).toBe('14:55')
  })
})
