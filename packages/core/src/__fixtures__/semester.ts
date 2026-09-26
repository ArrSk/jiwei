/** 测试夹具：固定的学期与作息，保证断言可读、可复现。 */
import { buildPeriodsFromConfig, defaultScheduleConfig, type Block, type Semester } from '../index'

/** 2025-09-22 是周一，方便人工核对日期 */
export const SEMESTER_START = '2025-09-22'

export const semester: Semester = {
  id: 'sem_test',
  name: '2025 秋',
  startDate: SEMESTER_START,
  totalWeeks: 20,
  timezone: 'Asia/Shanghai',
  isActive: true,
  createdAt: '2025-09-01T00:00:00+08:00',
  updatedAt: '2025-09-01T00:00:00+08:00',
}

export const periods = buildPeriodsFromConfig('sem_test', defaultScheduleConfig())

export const ctx = { semester, periods }

/** 造一门课 */
export function course(partial: Partial<Block> & Pick<Block, 'anchor'>): Block {
  return {
    id: partial.id ?? 'blk_1',
    kind: 'course',
    title: partial.title ?? '高等数学',
    anchor: partial.anchor,
    repeat:
      partial.repeat ??
      (partial.anchor.type === 'curriculum'
        ? { mode: 'curriculum', semesterId: partial.anchor.semesterId, weeks: partial.anchor.weeks }
        : { mode: 'once' }),
    createdAt: '2025-09-01T00:00:00+08:00',
    updatedAt: '2025-09-01T00:00:00+08:00',
    ...(partial.color ? { color: partial.color } : {}),
    ...(partial.detail ? { detail: partial.detail } : {}),
  }
}
