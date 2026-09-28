/**
 * 调课 / 停课纯函数的测试。
 *
 * 重点在**确定性 id** 与"同一天只有一条记录"这条不变量 ——
 * 它一旦破了，界面就可能同时显示"停课"和"有课"。
 */
import { describe, expect, it } from 'vitest'
import {
  adjustmentId,
  addAdjustment,
  cancelAdjustment,
  describeAdjustment,
  findAdjustment,
  findAdjustmentForOccurrence,
  moveAdjustment,
} from './adjustments'

const base = { blockId: 'blk_1', semesterId: 'sem_1', date: '2025-09-24' }

describe('adjustmentId', () => {
  it('同一门课的同一天，id 相同（幂等的基础）', () => {
    expect(adjustmentId('blk_1', '2025-09-24')).toBe(adjustmentId('blk_1', '2025-09-24'))
  })

  it('不同日期或不同课程，id 不同', () => {
    expect(adjustmentId('blk_1', '2025-09-24')).not.toBe(adjustmentId('blk_1', '2025-10-01'))
    expect(adjustmentId('blk_1', '2025-09-24')).not.toBe(adjustmentId('blk_2', '2025-09-24'))
  })
})

describe('cancelAdjustment', () => {
  it('产出 cancel 记录，带确定性 id', () => {
    const adj = cancelAdjustment({ ...base, reason: '教师出差' })
    expect(adj.action).toBe('cancel')
    expect(adj.id).toBe(adjustmentId('blk_1', '2025-09-24'))
    expect(adj.reason).toBe('教师出差')
  })

  it('空字符串原因不写入字段（避免存一堆空串）', () => {
    const adj = cancelAdjustment({ ...base, reason: '   ' })
    expect('reason' in adj).toBe(false)
  })
})

describe('moveAdjustment / addAdjustment', () => {
  it('调课记录带着新日期与新节次', () => {
    const adj = moveAdjustment({
      ...base,
      newDate: '2025-09-26',
      newPeriods: [3, 4],
    })
    expect(adj.action).toBe('move')
    expect(adj.newDate).toBe('2025-09-26')
    expect(adj.newPeriods).toEqual([3, 4])
  })

  it('补课与调课的字段一致，只有 action 不同', () => {
    const move = moveAdjustment({ ...base, newDate: '2025-09-26', newPeriods: [3, 4] })
    const add = addAdjustment({ ...base, newDate: '2025-09-26', newPeriods: [3, 4] })
    expect(add.action).toBe('add')
    expect({ ...add, action: 'move' }).toEqual(move)
  })

  it('停课与调课是同一天同一门课的**同一条**记录（互相覆盖，不会并存）', () => {
    const cancel = cancelAdjustment(base)
    const move = moveAdjustment({ ...base, newDate: '2025-09-26', newPeriods: [1, 2] })
    expect(cancel.id).toBe(move.id)
  })
})

describe('findAdjustment', () => {
  const adjustments = [
    cancelAdjustment({ ...base, date: '2025-09-24' }),
    moveAdjustment({ ...base, date: '2025-10-01', newDate: '2025-10-03', newPeriods: [1, 2] }),
  ]

  it('按课程 + 日期精确命中', () => {
    expect(findAdjustment(adjustments, 'blk_1', '2025-09-24')?.action).toBe('cancel')
    expect(findAdjustment(adjustments, 'blk_1', '2025-10-01')?.action).toBe('move')
  })

  it('日期对不上就没有记录', () => {
    expect(findAdjustment(adjustments, 'blk_1', '2025-09-25')).toBeUndefined()
    expect(findAdjustment(adjustments, 'blk_2', '2025-09-24')).toBeUndefined()
  })
})

describe('findAdjustmentForOccurrence（调课后两端都能找到同一条记录）', () => {
  const moved = moveAdjustment({
    ...base,
    date: '2025-09-29',
    newDate: '2025-10-03',
    newPeriods: [3, 4],
  })

  it('从原时间那边找得到', () => {
    expect(findAdjustmentForOccurrence([moved], 'blk_1', '2025-09-29')?.id).toBe(moved.id)
  })

  it('★ 从调过去的新时间那边也找得到同一条（否则用户在新时间点进去无法撤销）', () => {
    expect(findAdjustmentForOccurrence([moved], 'blk_1', '2025-10-03')?.id).toBe(moved.id)
  })

  it('两端的记录必须是同一个 id，不能各存一条', () => {
    const fromOrigin = findAdjustmentForOccurrence([moved], 'blk_1', '2025-09-29')
    const fromTarget = findAdjustmentForOccurrence([moved], 'blk_1', '2025-10-03')
    expect(fromOrigin?.id).toBe(fromTarget?.id)
  })

  it('别的课、别的日期都找不到', () => {
    expect(findAdjustmentForOccurrence([moved], 'blk_2', '2025-09-29')).toBeUndefined()
    expect(findAdjustmentForOccurrence([moved], 'blk_1', '2025-09-30')).toBeUndefined()
  })

  it('优先返回"以该日为原日期"的那一条（避免多条调整时选错）', () => {
    const chain = [
      { ...moved, id: 'adj_a', date: '2025-09-22', newDate: '2025-09-29' },
      { ...moved, id: 'adj_b', date: '2025-09-29', newDate: '2025-10-03' },
    ]
    expect(findAdjustmentForOccurrence(chain, 'blk_1', '2025-09-29')?.id).toBe('adj_b')
  })
})

describe('describeAdjustment', () => {
  it('停课只写原定日期', () => {
    expect(describeAdjustment(cancelAdjustment(base))).toBe('停课（原定 2025-09-24）')
  })

  it('调课写清新旧日期与节次', () => {
    const adj = moveAdjustment({ ...base, newDate: '2025-09-26', newPeriods: [3, 4] })
    expect(describeAdjustment(adj)).toBe('调课：2025-09-24 → 2025-09-26 第 3-4 节')
  })

  it('缺新日期时也不炸（导入的不完整数据）', () => {
    const adj = { ...cancelAdjustment(base), action: 'move' as const }
    expect(describeAdjustment(adj)).toContain('未指定日期')
  })
})
