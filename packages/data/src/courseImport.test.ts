import { describe, expect, it } from 'vitest'
import { analyzeCourseImport, courseImportRowToBlock, exportCourseCsv, exportCourseIcs, parseCourseCsv, parseCourseIcs, validateCourseImportFields } from './courseImport'

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

  it('preserves editable source fields and revalidates after correction', () => {
    const invalid = parseCourseCsv('课程名,星期,开始节,结束节,周次\n,8,99,,99\n', { semesterId: 's', totalWeeks: 16, maxPeriod: 12 })[0]!
    expect(invalid.fields).toMatchObject({ title: '', weekday: '8', periodStart: '99', weeks: '99' })
    const fixed = validateCourseImportFields({ ...invalid.fields, title: '英语', weekday: '周五', periodStart: '3', periodEnd: '4', weeks: '1-16' }, { semesterId: 's', totalWeeks: 16, maxPeriod: 12 }, invalid.line)
    expect(fixed).toMatchObject({ title: '英语', weekday: 5, periodStart: 3, periodEnd: 4, weeks: Array.from({ length: 16 }, (_, index) => index + 1), errors: [] })
  })

  it('detects duplicate rows and overlapping rows before writing', () => {
    const existingRow = parseCourseCsv('课程名,教师,教室,星期,开始节,结束节,周次\n英语,李老师,外语楼,五,3,4,1-16\n', { semesterId: 's', totalWeeks: 16, maxPeriod: 12 })[0]!
    const rows = parseCourseCsv('课程名,教师,教室,星期,开始节,结束节,周次\n英语,李老师,外语楼,五,3,4,1-16\n物理,陈老师,理科楼,五,4,5,1-16\n', { semesterId: 's', totalWeeks: 16, maxPeriod: 12 })
    const result = analyzeCourseImport(rows, [courseImportRowToBlock(existingRow, 's', 'existing', 'now')], 's')
    expect(result[0]).toMatchObject({ duplicate: true, conflicts: [] })
    expect(result[1]).toMatchObject({ duplicate: false, conflicts: ['英语'] })
  })

  it('rejects an unclosed quoted CSV field', () => {
    expect(() => parseCourseCsv('课程名,星期,开始节\n"英语,五,3\n', { semesterId: 's', totalWeeks: 16, maxPeriod: 12 })).toThrow('CSV 引号未闭合')
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

  it('可以把几微导出的 ICS 重新合并为课程草稿', () => {
    const [row] = parseCourseCsv('课程名,教师,教室,星期,开始节,结束节,周次\n英语,李老师,外语楼 305,一,3,4,1-2\n', { semesterId: 's', totalWeeks: 16, maxPeriod: 12 })
    const block = courseImportRowToBlock(row!, 's', 'blk_1', '2026-10-04T00:00:00.000Z')
    const ics = exportCourseIcs([block], [
      { id: 'occ_1', blockId: 'blk_1', semesterId: 's', date: '2026-09-28', start: '2026-09-28T09:50:00+08:00', end: '2026-09-28T10:35:00+08:00', status: 'normal' },
      { id: 'occ_2', blockId: 'blk_1', semesterId: 's', date: '2026-10-05', start: '2026-10-05T09:50:00+08:00', end: '2026-10-05T10:35:00+08:00', status: 'normal' },
    ], '秋季课表')
    const rows = parseCourseIcs(ics, {
      semesterId: 's', totalWeeks: 16, maxPeriod: 12, semesterStartDate: '2026-09-28',
      periods: [{ index: 3, start: '09:50', end: '10:35' }, { index: 4, start: '10:40', end: '11:25' }],
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ title: '英语', teacher: '李老师', location: '外语楼 305', weekday: 1, periodStart: 3, periodEnd: 4, weeks: [1, 2], errors: [] })
  })

  it('可以读取普通日历事件，并在时间无法匹配时保留错误供预览修改', () => {
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT',
      'DTSTART;TZID=Asia/Shanghai:20260928T095000',
      'DTEND;TZID=Asia/Shanghai:20260928T103500',
      'SUMMARY:英语,听说', 'LOCATION:外语楼 305', 'DESCRIPTION:教师：李老师',
      'END:VEVENT', 'END:VCALENDAR', '',
    ].join('\r\n')
    const rows = parseCourseIcs(ics, {
      semesterId: 's', totalWeeks: 16, maxPeriod: 12, semesterStartDate: '2026-09-28',
      periods: [{ index: 3, start: '09:50', end: '10:35' }],
    })
    expect(rows[0]).toMatchObject({ title: '英语,听说', teacher: '李老师', location: '外语楼 305', weeks: [1], errors: [] })

    const mismatch = parseCourseIcs(ics.replace('095000', '100000'), {
      semesterId: 's', totalWeeks: 16, maxPeriod: 12, semesterStartDate: '2026-09-28',
      periods: [{ index: 3, start: '09:50', end: '10:35' }],
    })
    expect(mismatch[0]?.errors).toContain('日历时间无法匹配当前作息节次')
  })
})
