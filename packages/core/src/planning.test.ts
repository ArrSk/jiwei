import { describe, expect, it } from 'vitest'
import { materializeBlock, type Block } from './index'
import { ctx, semester } from './__fixtures__/semester'
import { describePlan, isPlanOnDate, planTypeOf } from './planning'

const base = (anchor: Block['anchor'], extra: Partial<Block> = {}): Block => ({
  id: `blk_${anchor.type}`,
  kind: 'task',
  title: '测试计划',
  anchor,
  repeat: { mode: 'once' },
  createdAt: '2025-09-01T00:00:00+08:00',
  updatedAt: '2025-09-01T00:00:00+08:00',
  ...extra,
})

describe('计划模型', () => {
  it('支持无期限、区间和每周事项的日期判断', () => {
    const longterm = base({ type: 'floating' }, { planType: 'longterm' })
    const range = base({ type: 'range', start: '2025-09-24', end: '2025-09-26' })
    const weekly = base({ type: 'weekly', weekdays: [3], startDate: '2025-09-01' })
    expect(planTypeOf(longterm)).toBe('longterm')
    expect(isPlanOnDate(longterm, '2025-09-24')).toBe(false)
    expect(isPlanOnDate(range, '2025-09-25')).toBe(true)
    expect(isPlanOnDate(weekly, '2025-09-24')).toBe(true)
    expect(describePlan(weekly)).toContain('每周三')
  })

  it('计划锚点可以展开成稳定的派生课次', () => {
    const range = base({ type: 'range', start: '2025-09-24', end: '2025-09-26' })
    const weekly = base({ type: 'weekly', weekdays: [1, 3], startDate: '2025-09-22', until: '2025-10-03' })
    expect(materializeBlock(range, ctx).map((item) => item.date)).toEqual(['2025-09-24', '2025-09-25', '2025-09-26'])
    expect(materializeBlock(weekly, ctx).map((item) => item.date)).toEqual(['2025-09-22', '2025-09-24', '2025-09-29', '2025-10-01'])
    expect(materializeBlock(base({ type: 'floating' }), ctx)).toEqual([])
    expect(semester.id).toBe('sem_test')
  })
})
