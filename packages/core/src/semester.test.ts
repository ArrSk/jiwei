import { describe, expect, it } from 'vitest'
import {
  buildDefaultPeriods,
  buildPeriodsFromConfig,
  currentWeek,
  dateForWeek,
  dayOffsetInSemester,
  orderPeriods,
  periodRange,
  weekDates,
} from './semester'
import { generateSlots } from './date'
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
    // 内建作息（非等间隔）：第 3 节 09:50-10:35，第 4 节 10:40-11:25
    expect(r?.start).toBe('2025-09-24T09:50:00+08:00')
    expect(r?.end).toBe('2025-09-24T11:25:00+08:00')
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
    const p = buildDefaultPeriods('sem_x')
    expect(p).toHaveLength(12)
    expect(p[0]?.id).toBe('sem_x_p1')
    expect(p[0]?.start).toBe('08:00')
    expect(p[0]?.semesterId).toBe('sem_x')
    // 上午 / 下午 / 晚上 分组：1-5 上午、6-9 下午、10-12 晚上
    expect(p[0]?.label).toBe('上午')
    expect(p[5]?.label).toBe('下午')
    expect(p[9]?.label).toBe('晚上')
  })

  it('内建作息与参考课表一致（非等间隔，共 12 节）', () => {
    const p = buildDefaultPeriods('sem_x')
    expect(p.map((x) => `${x.start}-${x.end}`)).toEqual([
      // 上午
      '08:00-08:45',
      '08:50-09:35',
      '09:50-10:35', // 第 3 节前休 15 分钟
      '10:40-11:25',
      '11:30-12:15',
      // 下午
      '13:45-14:30',
      '14:35-15:20',
      '15:35-16:20', // 第 8 节前休 15 分钟
      '16:25-17:10',
      // 晚上
      '18:30-19:15',
      '19:20-20:05',
      '20:10-20:55',
    ])
  })

  it('作息参数可调：改时长/课间/起始时间后整体重排（presetTimes 为空时走等间隔生成）', () => {
    const p = buildPeriodsFromConfig('sem_y', {
      periodMinutes: 50,
      breakMinutes: 10,
      morning: { start: '08:30', count: 2 },
      afternoon: { start: '14:00', count: 1 },
      evening: { start: '19:00', count: 0 },
      presetTimes: [],
    })
    expect(p).toHaveLength(3)
    expect(p.map((x) => `${x.start}-${x.end}`)).toEqual(['08:30-09:20', '09:30-10:20', '14:00-14:50'])
    // 节次序号连续、id 确定性
    expect(p.map((x) => x.index)).toEqual([1, 2, 3])
    expect(p.map((x) => x.id)).toEqual(['sem_y_p1', 'sem_y_p2', 'sem_y_p3'])
    // 段落标签自动带出
    expect(p.map((x) => x.label)).toEqual(['上午', '上午', '下午'])
  })

  it('节数设为 0 的段落不产生节次', () => {
    const p = buildPeriodsFromConfig('sem_z', {
      periodMinutes: 45,
      breakMinutes: 5,
      morning: { start: '08:00', count: 0 },
      afternoon: { start: '13:45', count: 2 },
      evening: { start: '19:00', count: 0 },
      presetTimes: [],
    })
    expect(p).toHaveLength(2)
    expect(p.every((x) => x.label === '下午')).toBe(true)
  })

  it('presetTimes 优先于等间隔参数：真实作息允许非等间隔', () => {
    const p = buildPeriodsFromConfig('sem_p', {
      periodMinutes: 45,
      breakMinutes: 5,
      morning: { start: '08:00', count: 4 },
      afternoon: { start: '13:45', count: 4 },
      evening: { start: '18:30', count: 4 },
      presetTimes: [
        { index: 1, start: '08:00', end: '08:45' },
        // 第 2 节前休息 15 分钟（等间隔公式算不出这种情况）
        { index: 2, start: '09:00', end: '09:45' },
        { index: 3, start: '13:45', end: '14:30' },
      ],
    })
    expect(p.map((x) => `${x.start}-${x.end}`)).toEqual([
      '08:00-08:45',
      '09:00-09:45',
      '13:45-14:30',
    ])
    expect(p.map((x) => x.index)).toEqual([1, 2, 3])
  })
})

describe('generateSlots（课次时刻生成）', () => {
  it('按「时长 + 课间」连续排布', () => {
    expect(generateSlots('08:00', 3, 45, 5)).toEqual([
      { start: '08:00', end: '08:45' },
      { start: '08:50', end: '09:35' },
      { start: '09:40', end: '10:25' },
    ])
  })

  it('课间为 0 时首尾相接', () => {
    expect(generateSlots('13:45', 2, 45, 0)).toEqual([
      { start: '13:45', end: '14:30' },
      { start: '14:30', end: '15:15' },
    ])
  })

  it('非法参数返回空数组，不产生坏数据', () => {
    expect(generateSlots('08:00', 0, 45, 5)).toEqual([])
    expect(generateSlots('08:00', 3, 0, 5)).toEqual([])
    expect(generateSlots('08:00', -1, 45, 5)).toEqual([])
  })

  it('跨零点安全（不产出 24:xx 这种非法时间）', () => {
    const slots = generateSlots('23:30', 2, 45, 5)
    expect(slots[0]).toEqual({ start: '23:30', end: '00:15' })
    expect(slots[1]).toEqual({ start: '00:20', end: '01:05' })
  })
})
