import { describe, expect, it } from 'vitest'
import {
  dedupeOccurrences,
  detectConflicts,
  materializeAll,
  nextOccurrence,
  occurrencesInRange,
  occurrencesOnDate,
  ongoingOccurrences,
} from './index'
import { course, ctx, semester } from './__fixtures__/semester'

const math = course({
  id: 'blk_math',
  title: '高等数学',
  anchor: {
    type: 'curriculum',
    semesterId: semester.id,
    weekday: 1, // 周一
    periods: [1, 2], // 08:00-09:40
    weeks: [1, 2, 3],
  },
})

const english = course({
  id: 'blk_en',
  title: '大学英语',
  anchor: {
    type: 'curriculum',
    semesterId: semester.id,
    weekday: 1,
    periods: [3, 4], // 10:00-11:40，紧邻但不冲突
    weeks: [1, 2, 3],
  },
})

const overlapping = course({
  id: 'blk_overlap',
  title: '物理实验',
  anchor: {
    type: 'curriculum',
    semesterId: semester.id,
    weekday: 1,
    periods: [2, 3], // 08:55-10:45，与数学和英语都重叠
    weeks: [1],
  },
})

const all = materializeAll([math, english, overlapping], ctx)

describe('occurrencesInRange / occurrencesOnDate', () => {
  it('按日期区间筛选，且过滤掉取消的场次', () => {
    const range = occurrencesInRange(all, '2025-09-22', '2025-09-28')
    expect(range.every((o) => o.date >= '2025-09-22' && o.date <= '2025-09-28')).toBe(true)
    expect(range.length).toBeGreaterThan(0)
  })

  it('某一天的场次按时间升序', () => {
    const day = occurrencesOnDate(all, '2025-09-22')
    expect(day.map((o) => o.start)).toEqual([...day.map((o) => o.start)].sort())
    expect(day[0]?.start).toBe('2025-09-22T08:00:00+08:00')
  })

  it('空区间返回空数组', () => {
    expect(occurrencesInRange(all, '2030-01-01', '2030-01-02')).toEqual([])
  })
})

describe('nextOccurrence / ongoingOccurrences', () => {
  it('课前：返回当天第一节', () => {
    const next = nextOccurrence(all, '2025-09-22T07:00:00+08:00')
    expect(next?.start).toBe('2025-09-22T08:00:00+08:00')
  })

  it('正在上课：下一场是还没结束的那一场（含当前）', () => {
    const next = nextOccurrence(all, '2025-09-22T08:30:00+08:00')
    expect(next?.start).toBe('2025-09-22T08:00:00+08:00')
  })

  it('当天课全结束后：返回下一周的课', () => {
    const next = nextOccurrence(all, '2025-09-22T12:00:00+08:00')
    expect(next?.date).toBe('2025-09-29')
    expect(next?.start).toBe('2025-09-29T08:00:00+08:00')
  })

  it('全部结束：返回 null', () => {
    expect(nextOccurrence(all, '2030-01-01T00:00:00+08:00')).toBeNull()
  })

  it('ongoingOccurrences 命中区间内的场次', () => {
    const ongoing = ongoingOccurrences(all, '2025-09-22T08:30:00+08:00')
    expect(ongoing.map((o) => o.blockId)).toContain('blk_math')
  })
})

describe('detectConflicts', () => {
  it('紧邻节次不算冲突（数学 1-2 节、英语 3-4 节）', () => {
    const conflicts = detectConflicts(materializeAll([math, english], ctx))
    expect(conflicts).toEqual([])
  })

  it('节次重叠会被检出（物理 2-3 节与数学/英语都重叠）', () => {
    const conflicts = detectConflicts(materializeAll([math, english, overlapping], ctx))
    expect(conflicts.length).toBeGreaterThanOrEqual(2)
    expect(conflicts[0]?.date).toBe('2025-09-22')
    const ids = conflicts.flatMap((c) => [c.a.blockId, c.b.blockId])
    expect(ids).toContain('blk_overlap')
  })

  it('取消的场次不参与冲突判定', () => {
    const conflicts = detectConflicts(
      materializeAll([math, overlapping], ctx, [
        {
          id: 'adj_cancel',
          semesterId: semester.id,
          date: '2025-09-22',
          action: 'cancel',
          blockId: 'blk_overlap',
        },
      ]),
    )
    expect(conflicts.some((c) => c.a.blockId === 'blk_overlap' || c.b.blockId === 'blk_overlap')).toBe(
      false,
    )
  })
})

describe('dedupeOccurrences', () => {
  it('同一 id 只保留一条', () => {
    const occ = materializeAll([math], ctx)
    const doubled = [...occ, ...occ]
    expect(dedupeOccurrences(doubled)).toHaveLength(occ.length)
  })
})
