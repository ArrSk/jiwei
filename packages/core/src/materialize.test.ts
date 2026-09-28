import { describe, expect, it } from 'vitest'
import {
  buildDefaultPeriods,
  expandWeeks,
  isOccurrenceActive,
  materializeAll,
  materializeBlock,
  occurrenceId,
} from './index'
import { course, ctx, semester } from './__fixtures__/semester'

/**
 * 这些用例是"时间算错"的唯一防线（docs/ARCHITECTURE.md 第 9 节风险表）。
 * 每个 `it` 都刻意把日期写成字面值，方便人工核对。
 */
describe('materializeBlock：curriculum（课表）', () => {
  it('每周重复：20 周 × 每周一次 = 20 次，且时刻由作息表派生', () => {
    const block = course({
      id: 'blk_math',
      anchor: {
        type: 'curriculum',
        semesterId: semester.id,
        weekday: 3, // 周三
        periods: [3, 4],
        weeks: Array.from({ length: 20 }, (_, i) => i + 1),
      },
    })
    const occ = materializeBlock(block, ctx)
    expect(occ).toHaveLength(20)
    expect(occ[0]?.date).toBe('2025-09-24') // 第 1 周周三
    // 内建作息（非等间隔）：第 3 节 09:50-10:35，第 4 节 10:40-11:25
    expect(occ[0]?.start).toBe('2025-09-24T09:50:00+08:00')
    expect(occ[0]?.end).toBe('2025-09-24T11:25:00+08:00')
    expect(occ[19]?.date).toBe('2026-02-04') // 第 20 周周三
  })

  it('单周（odd）：只在第 1/3/5/7/9 周出现', () => {
    const block = course({
      id: 'blk_odd',
      anchor: {
        type: 'curriculum',
        semesterId: semester.id,
        weekday: 1,
        periods: [1, 2],
        weeks: [1, 3, 5, 7, 9],
      },
    })
    const dates = materializeBlock(block, ctx).map((o) => o.date)
    expect(dates).toEqual([
      '2025-09-22',
      '2025-10-06',
      '2025-10-20',
      '2025-11-03',
      '2025-11-17',
    ])
  })

  it('跳过指定周：3-9 周但跳过第 8 周，且超出总周数的周被裁掉', () => {
    const block = course({
      id: 'blk_skip',
      anchor: {
        type: 'curriculum',
        semesterId: semester.id,
        weekday: 5,
        periods: [5, 6],
        weeks: [3, 4, 5, 6, 7, 9, 40],
      },
    })
    const occ = materializeBlock(block, ctx)
    expect(occ).toHaveLength(6) // 40 被裁掉
    expect(occ.map((o) => o.date)).toEqual([
      '2025-10-10', // 第 3 周周五
      '2025-10-17',
      '2025-10-24',
      '2025-10-31',
      '2025-11-07',
      '2025-11-21', // 第 9 周周五（跳过第 8 周）
    ])
    expect(occ.some((o) => o.date === '2025-11-14')).toBe(false)
  })

  it('连堂跨节：第 1-4 节一次课，起止覆盖整个上午', () => {
    const block = course({
      id: 'blk_long',
      anchor: {
        type: 'curriculum',
        semesterId: semester.id,
        weekday: 2,
        periods: [1, 4],
        weeks: [1],
      },
    })
    const occ = materializeBlock(block, ctx)
    expect(occ).toHaveLength(1)
    // 第 1 节 08:00 到第 4 节结束 11:25（内建作息）
    expect(occ[0]?.start).toBe('2025-09-23T08:00:00+08:00')
    expect(occ[0]?.end).toBe('2025-09-23T11:25:00+08:00')
  })

  it('作息表缺该节次时返回空数组，而不是静默产出错误时间', () => {
    const block = course({
      id: 'blk_bad',
      anchor: {
        type: 'curriculum',
        semesterId: semester.id,
        weekday: 1,
        periods: [1, 9],
        weeks: [1],
      },
    })
    const noPeriods = buildDefaultPeriods('other').slice(0, 4)
    expect(materializeBlock(block, { semester, periods: noPeriods })).toEqual([])
  })
})

describe('materializeBlock：absolute / allDay（日程、任务）', () => {
  it('一次性事件：只产出一条，日期时刻原样保留', () => {
    const block = course({
      id: 'blk_meeting',
      anchor: {
        type: 'absolute',
        start: '2025-10-08T14:00:00+08:00',
        end: '2025-10-08T15:30:00+08:00',
      },
    })
    const occ = materializeBlock(block, ctx)
    expect(occ).toHaveLength(1)
    expect(occ[0]?.date).toBe('2025-10-08')
    expect(occ[0]?.start).toBe('2025-10-08T14:00:00+08:00')
    expect(occ[0]?.end).toBe('2025-10-08T15:30:00+08:00')
  })

  it('每周重复：从 10-08 到 10-29，interval=1 → 4 次', () => {
    const block = course({
      id: 'blk_weekly',
      anchor: {
        type: 'absolute',
        start: '2025-10-08T19:00:00+08:00',
        end: '2025-10-08T21:00:00+08:00',
      },
      repeat: { mode: 'weekly', interval: 1, until: '2025-10-29' },
    })
    const dates = materializeBlock(block, ctx).map((o) => o.date)
    expect(dates).toEqual(['2025-10-08', '2025-10-15', '2025-10-22', '2025-10-29'])
  })

  it('隔周重复：interval=2 → 10-08、10-22', () => {
    const block = course({
      id: 'blk_biweekly',
      anchor: {
        type: 'absolute',
        start: '2025-10-08T19:00:00+08:00',
        end: '2025-10-08T21:00:00+08:00',
      },
      repeat: { mode: 'weekly', interval: 2, until: '2025-11-01' },
    })
    const dates = materializeBlock(block, ctx).map((o) => o.date)
    expect(dates).toEqual(['2025-10-08', '2025-10-22'])
  })

  it('全天事件：覆盖 00:00 - 23:59', () => {
    const block = course({
      id: 'blk_holiday',
      anchor: { type: 'allDay', date: '2025-10-01' },
    })
    const occ = materializeBlock(block, ctx)
    expect(occ[0]?.start).toBe('2025-10-01T00:00:00+08:00')
    expect(occ[0]?.end).toBe('2025-10-01T23:59:00+08:00')
  })
})

describe('Occurrence 确定性 ID 与重建稳定性', () => {
  it('ID = occ_${blockId}#${date}#${periodStart}', () => {
    expect(occurrenceId('blk_x', '2025-09-24', 3)).toBe('occ_blk_x#2025-09-24#3')
  })

  it('重建两次得到完全相同的 ID 序列（附件不会因重建失联）', () => {
    const block = course({
      id: 'blk_stable',
      anchor: {
        type: 'curriculum',
        semesterId: semester.id,
        weekday: 4,
        periods: [7, 8],
        weeks: [1, 2, 3, 4, 5],
      },
    })
    const first = materializeBlock(block, ctx).map((o) => o.id)
    const second = materializeBlock(block, ctx).map((o) => o.id)
    expect(first).toEqual(second)
    expect(new Set(first).size).toBe(5)
  })
})

describe('adjustments：停课与调课', () => {
  const block = course({
    id: 'blk_adj',
    anchor: {
      type: 'curriculum',
      semesterId: semester.id,
      weekday: 1,
      periods: [1, 2],
      weeks: [1, 2, 3],
    },
  })

  it('cancel：该次保留但标记为 cancelled（界面上灰掉而非消失）', () => {
    const occ = materializeAll(
      [block],
      ctx,
      [
        {
          id: 'adj_1',
          semesterId: semester.id,
          date: '2025-09-29',
          action: 'cancel',
          blockId: block.id,
        },
      ],
    )
    expect(occ).toHaveLength(3)
    expect(occ.find((o) => o.date === '2025-09-29')?.status).toBe('cancelled')
    expect(occ.find((o) => o.date === '2025-09-22')?.status).toBe('normal')
  })

  it('move：★ 原时间不再上课（标记 moved），新日期是正常的一次课', () => {
    const occ = materializeAll(
      [block],
      ctx,
      [
        {
          id: 'adj_2',
          semesterId: semester.id,
          date: '2025-09-29',
          action: 'move',
          blockId: block.id,
          newDate: '2025-10-04',
          newPeriods: [3, 4],
        },
      ],
    )
    // 原有 3 次 + 新增 1 次
    expect(occ).toHaveLength(4)

    // 原时间那一次还在记录里，但已标记为"被调走"（界面灰掉，用户可据此撤销）
    const origin = occ.find((o) => o.date === '2025-09-29')
    expect(origin?.status).toBe('moved')

    // 新日期那一条是**正常上课**，并记下原本在哪一天
    const moved = occ.find((o) => o.date === '2025-10-04')
    expect(moved?.status).toBe('normal')
    expect(moved?.movedFrom).toBe('2025-09-29')
    expect(moved?.start).toBe('2025-10-04T09:50:00+08:00')
    expect(moved?.id).toBe(occurrenceId(block.id, '2025-10-04', 3))
  })

  it('move：★ 不会同一次课显示两遍（同一天只有一条会真正上课的场次）', () => {
    const occ = materializeAll(
      [block],
      ctx,
      [
        {
          id: 'adj_2',
          semesterId: semester.id,
          date: '2025-09-29',
          action: 'move',
          blockId: block.id,
          newDate: '2025-10-04',
          newPeriods: [3, 4],
        },
      ],
    )
    const active = occ.filter(isOccurrenceActive)
    // 3 次课：原来的 9/22、10/06，加上挪到 10/04 的那一次；9/29 不算
    expect(active).toHaveLength(3)
    expect(active.map((o) => o.date).sort()).toEqual(['2025-09-22', '2025-10-04', '2025-10-06'])
  })

  it('add（补课）：原时间照常上课，只多出一次', () => {
    const occ = materializeAll(
      [block],
      ctx,
      [
        {
          id: 'adj_3',
          semesterId: semester.id,
          date: '2025-09-29',
          action: 'add',
          blockId: block.id,
          newDate: '2025-10-04',
          newPeriods: [3, 4],
        },
      ],
    )
    expect(occ).toHaveLength(4)
    expect(occ.find((o) => o.date === '2025-09-29')?.status).toBe('normal')
    const extra = occ.find((o) => o.date === '2025-10-04')
    expect(extra?.status).toBe('normal')
    // 补课不是"从别处挪来的"，不该有 movedFrom
    expect(extra?.movedFrom).toBeUndefined()
  })

  it('输出按时间升序，便于直接渲染', () => {
    const occ = materializeAll([block], ctx)
    const sorted = [...occ].sort((a, b) => a.start.localeCompare(b.start))
    expect(occ.map((o) => o.id)).toEqual(sorted.map((o) => o.id))
  })
})

describe('expandWeeks', () => {
  it('裁剪越界周、去重、升序', () => {
    expect(expandWeeks([5, 1, 3, 3, 0, 40], 20)).toEqual([1, 3, 5])
  })
  it('全部越界时返回空', () => {
    expect(expandWeeks([21, 30], 20)).toEqual([])
  })
  it('不修改入参', () => {
    const input = [3, 1]
    expandWeeks(input, 20)
    expect(input).toEqual([3, 1])
  })
})
