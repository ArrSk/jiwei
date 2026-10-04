import { describe, expect, it } from 'vitest'
import { courseImportRowToBlock, exportCourseCsv, exportCourseIcs, parseCourseCsv } from './courseImport'

describe('parseCourseCsv', () => {
  it('parses Chinese headers, weekdays, ranges, and quoted commas', () => {
    const rows = parseCourseCsv(
      '课程名,教师,教室,星期,开始节,结束节,周次\n"高等数学,上",张老师,教西-101,周一,1,2,1-16单\n',
      { semesterId: 'sem_1', totalWeeks: 16, maxPeriod: 12 },
    )
    expect(rows[0]).toMatchObject({ title: '高等数学,上', weekday: 1, periodStart: 1, periodEnd: 2, weeks: [1, 3, 5, 7, 9, 11, 13, 15], errors: [] })
  })

  it('keeps invalid rows visible for preview', () => {
    const rows = parseCourseCsv('title,weekday,periodStart\n,8,99\n', { semesterId: 's', totalWeeks: 16, maxPeriod: 12 })
    expect(rows[0]?.errors).toEqual(expect.arrayContaining(['缺少课程名', '星期应为 1-7 或 周一至周日', '节次应在 1-12 内']))
  })

  it('converts a confirmed row into a curriculum block', () => {
    const [row] = parseCourseCsv('课程名,星期,开始节\n英语,五,3\n', { semesterId: 's', totalWeeks: 16, maxPeriod: 12 })
    expect(courseImportRowToBlock(row!, 's', 'blk_1', '2026-10-04T00:00:00.000Z')).toMatchObject({ kind: 'course', title: '英语', anchor: { weekday: 5, periods: [3, 3] } })
  })

  it('exports courses in an importable CSV shape', () => {
    const [row] = parseCourseCsv('课程名,教师,教室,星期,开始节,结束节,周次\n"英语,听说",李老师,外语楼 305,五,3,4,1-16单\n', { semesterId: 's', totalWeeks: 16, maxPeriod: 12 })
    const block = courseImportRowToBlock(row!, 's', 'blk_1', '2026-10-04T00:00:00.000Z')
    const csv = exportCourseCsv([block])
    expect(csv).toContain('"英语,听说",李老师,外语楼 305,5,3,4,1-15单,')
    expect(parseCourseCsv(csv, { semesterId: 's', totalWeeks: 16, maxPeriod: 12 })[0]?.errors).toEqual([])
  })

  it('exports active occurrences as calendar events', () => {
    const [row] = parseCourseCsv('课程名,星期,开始节\n英语,五,3\n', { semesterId: 's', totalWeeks: 16, maxPeriod: 12 })
    const block = courseImportRowToBlock(row!, 's', 'blk_1', '2026-10-04T00:00:00.000Z')
    const ics = exportCourseIcs([block], [{ id: 'occ_1', blockId: 'blk_1', semesterId: 's', date: '2026-10-09', start: '2026-10-09T09:50:00+08:00', end: '2026-10-09T10:35:00+08:00', status: 'normal' }], '秋季课表')
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('SUMMARY:英语')
    expect(ics).toContain('X-WR-CALNAME:秋季课表')
  })
})
