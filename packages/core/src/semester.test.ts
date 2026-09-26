import { describe, expect, it } from 'vitest'
import {
  buildDefaultPeriods,
  currentWeek,
  dateForWeek,
  dayOffsetInSemester,
  orderPeriods,
  periodRange,
  weekDates,
} from './semester'
import { periods, semester } from './__fixtures__/semester'

describe('semester：周次与作息', () => {
  it('dateForWeek 按"第 1 周周一 = startDate"推算', () => {
    expect(dateForWeek(semester, 1, 1)).toBe('2025-09-22')
    expect(dateForWeek(semester, 1, 7)).toBe('2025-09-28')
    expect(dateForWeek(semester, 2, 1)).toBe('2025-09-29')
    expect(dateForWeek(semester, 20, 7)).toBe('2026-02-08')
  })

  it('weekDates 返回周一到周日 7 天', () => {
    const days = weekDates(semester, 1)
    expect(days).toHaveLength(7)
    expect(days[0]).toBe('2025-09-22')
    expect(days[6]).toBe('2025-09-28')
  })

  it('currentWeek：开学前 = 0，学期中正确，假期 = totalWeeks + 1', () => {
    expect(currentWeek(semester, '2025-09-01')).toBe(0) // 早于开学
    expect(currentWeek(semester, '2025-09-22')).toBe(1)
    expect(currentWeek(semester, '2025-09-28')).toBe(1) // 第一周周日
    expect(currentWeek(semester, '2025-09-29')).toBe(2)
    expect(currentWeek(semester, '2026-02-09')).toBe(21) // 第 20 周之后
  })

  it('dayOffsetInSemester 学期外返回 -1', () => {
    expect(dayOffsetInSemester(semester, '2025-09-22')).toBe(0)
    expect(dayOffsetInSemester(semester, '2025-09-28')).toBe(6)
    expect(dayOffsetInSemester(semester, '2025-09-21')).toBe(-1)
    expect(dayOffsetInSemester(semester, '2026-02-09')).toBe(-1)
  })

  it('periodRange 从作息表派生时刻（第 3-4 节连堂）', () => {
    const r = periodRange(periods, '2025-09-24', 3, 4)
    expect(r).not.toBeNull()
    expect(r?.start).toBe('2025-09-24T10:00:00+08:00')
    expect(r?.end).toBe('2025-09-24T11:40:00+08:00')
  })

  it('periodRange 遇到不存在的节次返回 null（不静默出错）', () => {
    expect(periodRange(periods, '2025-09-24', 1, 99)).toBeNull()
  })

  it('orderPeriods 按 index 排序', () => {
    const shuffled = [...periods].reverse()
    expect(orderPeriods(shuffled).map((p) => p.index)).toEqual(
      Array.from({ length: 12 }, (_, i) => i + 1),
    )
  })

  it('buildDefaultPeriods 生成 12 节，id 稳定且带 semesterId', () => {
    const p = buildDefaultPeriods('sem_x', '2025-09-01T00:00:00+08:00')
    expect(p).toHaveLength(12)
    expect(p[0]?.id).toBe('sem_x_p1')
    expect(p[0]?.start).toBe('08:00')
    expect(p[0]?.semesterId).toBe('sem_x')
    // 上午 / 下午 / 晚上 分组
    expect(p[0]?.label).toBe('上午')
    expect(p[8]?.label).toBe('晚上')
  })
})
