import { diffDays, isOccurrenceActive, isoWeekday, type Block, type Occurrence } from '@jiwei/core'

/** CSV 导入时先展示的课程草稿；只有用户确认后才会写入 Block。 */
export interface CourseImportRow {
  line: number
  title: string
  teacher: string
  location: string
  weekday: number
  periodStart: number
  periodEnd: number
  weeks: number[]
  color: string
  errors: string[]
  fields: CourseImportFields
}

/** 保留文件原文，让预览中的错误可以直接修改，不丢掉非法周次/节次。 */
export interface CourseImportFields {
  title: string
  teacher: string
  location: string
  weekday: string
  periodStart: string
  periodEnd: string
  weeks: string
  color: string
}

export interface CourseImportAnalysis {
  row: CourseImportRow
  duplicate: boolean
  conflicts: string[]
}

export interface CourseImportResult {
  imported: number
  skipped: number
}

export function validateCourseImportFields(fields: CourseImportFields, options: CourseImportOptions, line: number): CourseImportRow {
  const title = fields.title.trim()
  const weekday = parseWeekday(fields.weekday.trim())
  const period = parsePeriod(fields.periodStart.trim(), fields.periodEnd.trim())
  const weeks = parseWeeks(fields.weeks, options.totalWeeks)
  const errors: string[] = []
  if (!title) errors.push('缺少课程名')
  if (weekday === null) errors.push('星期应为 1-7 或 周一至周日')
  if (!period) errors.push('节次应填写开始节和结束节')
  else if (period[0] < 1 || period[1] > options.maxPeriod || period[1] < period[0]) errors.push(`节次应在 1-${options.maxPeriod} 内`)
  if (!weeks.length) errors.push(`周次应在 1-${options.totalWeeks} 内，例如 1-${options.totalWeeks}`)
  return { line, fields: { ...fields }, title, teacher: fields.teacher.trim(), location: fields.location.trim(), weekday: weekday ?? 0, periodStart: period?.[0] ?? 0, periodEnd: period?.[1] ?? 0, weeks, color: fields.color.trim(), errors }
}

/** 重复项按课程内容和教学时间比较（忽略颜色）；重叠按共同教学周和节次提示。 */
export function analyzeCourseImport(rows: CourseImportRow[], existing: Block[], semesterId: string): CourseImportAnalysis[] {
  const candidates = existing.filter((block) => block.kind === 'course' && block.anchor.type === 'curriculum' && block.anchor.semesterId === semesterId)
  return rows.map((row) => {
    if (row.errors.length) return { row, duplicate: false, conflicts: [] }
    const draft = courseImportRowToBlock(row, semesterId, `preview_${row.line}`, '')
    const duplicate = candidates.some((block) => courseKey(block) === courseKey(draft))
    const conflicts = duplicate ? [] : [...new Set(candidates.filter((block) => {
      if (block.anchor.type !== 'curriculum') return false
      return block.anchor.weekday === row.weekday && block.anchor.periods[0] <= row.periodEnd && block.anchor.periods[1] >= row.periodStart && block.anchor.weeks.some((week) => row.weeks.includes(week))
    }).map((block) => block.title))]
    if (!duplicate) candidates.push(draft)
    return { row, duplicate, conflicts }
  })
}

function courseKey(block: Block): string {
  if (block.anchor.type !== 'curriculum') return ''
  return JSON.stringify([block.title.trim(), block.detail?.teacher?.trim() ?? '', block.detail?.location?.trim() ?? '', block.anchor.weekday, block.anchor.periods, [...new Set(block.anchor.weeks)].sort((a, b) => a - b)])
}

export interface CourseImportOptions {
  semesterId: string
  totalWeeks: number
  maxPeriod: number
  /** ICS 导入用：学期第一周周一，用来把具体日期换算成教学周。 */
  semesterStartDate?: string
  /** ICS 导入用：按日历事件的开始/结束时间匹配节次。 */
  periods?: CourseImportPeriod[]
}

export interface CourseImportPeriod {
  index: number
  start: string
  end: string
}

/**
 * 解析简单课程 CSV。支持中文或英文表头：
 * 课程名,title；教师,teacher；教室,location；星期,weekday；开始节,periodStart；
 * 结束节,periodEnd；周次,weeks；颜色,color。
 *
 * 这里只生成草稿，不读写数据库。这样文件内容可以先在界面中预览和修改，
 * 也为后续 AI 识图复用同一个草稿格式。
 */
export function parseCourseCsv(text: string, options: CourseImportOptions): CourseImportRow[] {
  const rows = parseCsvRows(text)
  if (rows.length < 2) throw new Error('文件至少需要一行表头和一行课程')

  const headers = (rows[0] ?? []).map(normalizeHeader)
  const index = (names: string[]) => names.map(normalizeHeader).map((n) => headers.indexOf(n)).find((i) => i >= 0) ?? -1
  const columns = {
    title: index(['课程名', '课程', '名称', 'title', 'name']),
    teacher: index(['教师', '老师', 'teacher']),
    location: index(['教室', '地点', 'location']),
    weekday: index(['星期', '周几', 'weekday', 'day']),
    periodStart: index(['开始节', '起始节', '开始节次', 'periodstart', 'start']),
    periodEnd: index(['结束节', '结束节次', 'periodend', 'end']),
    weeks: index(['周次', '教学周', 'weeks', 'week']),
    color: index(['颜色', 'color']),
  }
  for (const required of ['title', 'weekday', 'periodStart'] as const) {
    if (columns[required] < 0) throw new Error(`缺少必需表头：${required === 'title' ? '课程名' : required === 'weekday' ? '星期' : '开始节'}`)
  }

  return rows.slice(1).flatMap((cells, rowIndex) => {
    if (cells.every((cell) => !cell.trim())) return []
    const get = (key: keyof typeof columns) => columns[key] >= 0 ? (cells[columns[key]] ?? '').trim() : ''
    return [validateCourseImportFields({ title: get('title'), teacher: get('teacher'), location: get('location'), weekday: get('weekday'), periodStart: get('periodStart'), periodEnd: get('periodEnd'), weeks: get('weeks'), color: get('color') }, options, rowIndex + 2)]
  })
}

export function courseImportTemplate(): string {
  return '\ufeff课程名,教师,教室,星期,开始节,结束节,周次,颜色\n高等数学,张老师,教西-101,一,1,2,1-16,\n'
}

/**
 * 解析 ICS 日历文件为课程草稿。
 *
 * 优先识别几微导出的 X-JIWEI-* 字段；普通日历事件也可导入，
 * 但必须能用当前作息表的时间匹配出节次。多个具体课次会按课程、教师、地点、
 * 星期和节次合并成一门课，并把日期换算成教学周。
 */
export function parseCourseIcs(text: string, options: CourseImportOptions): CourseImportRow[] {
  const events = parseIcsEvents(text)
  if (!events.length) throw new Error('ICS 文件中没有找到课程事件')
  if (!options.semesterStartDate) throw new Error('导入 ICS 前需要当前课表的开学日')
  if (!options.periods?.length) throw new Error('导入 ICS 前需要先配置作息时间')

  const grouped = new Map<string, { fields: CourseImportFields; weeks: Set<number>; extraErrors: string[]; line: number }>()
  for (const [index, event] of events.entries()) {
    const line = index + 1
    const title = event.SUMMARY?.trim() ?? ''
    const start = parseIcsDate(event.DTSTART)
    const end = parseIcsDate(event.DTEND)
    const explicitWeekday = numberField(event['X-JIWEI-WEEKDAY'])
    const explicitPeriods = parsePeriodText(event['X-JIWEI-PERIODS'])
    const weekday = explicitWeekday ?? (start ? isoWeekday(start.date) : 0)
    const matched = explicitPeriods ?? (start && end ? matchPeriods(start.time, end.time, options.periods) : null)
    const dateWeek = numberField(event['X-JIWEI-WEEK'])
    const week = dateWeek ?? (start ? Math.floor(diffDays(options.semesterStartDate, start.date) / 7) + 1 : 0)
    const fields: CourseImportFields = {
      title,
      teacher: teacherFromDescription(event.DESCRIPTION),
      location: event.LOCATION?.trim() ?? '',
      weekday: String(weekday || ''),
      periodStart: matched ? String(matched[0]) : '',
      periodEnd: matched ? String(matched[1]) : '',
      weeks: week > 0 ? String(week) : '',
      color: event['X-JIWEI-COLOR']?.trim() ?? '',
    }
    const extraErrors: string[] = []
    if (!start) extraErrors.push('缺少或无法解析开始时间')
    if (!end) extraErrors.push('缺少或无法解析结束时间')
    if (start && end && !matched) extraErrors.push('日历时间无法匹配当前作息节次')
    if (week < 1 || week > options.totalWeeks) extraErrors.push(`日期不在当前学期的 1-${options.totalWeeks} 周内`)
    const key = event['X-JIWEI-BLOCK-ID']?.trim() || JSON.stringify([title, fields.teacher, fields.location, weekday, matched])
    const existing = grouped.get(key)
    if (existing) {
      if (week > 0) existing.weeks.add(week)
      existing.extraErrors.push(...extraErrors)
    } else {
      grouped.set(key, { fields, weeks: new Set(week > 0 ? [week] : []), extraErrors, line })
    }
  }

  return [...grouped.values()].map(({ fields, weeks, extraErrors, line }) => {
    const row = validateCourseImportFields({ ...fields, weeks: [...weeks].sort((a, b) => a - b).join(',') }, options, line)
    row.errors.push(...extraErrors.filter((error, index, list) => list.indexOf(error) === index))
    return row
  })
}

/** 把当前课表导出成可再次导入的 CSV；只导出课程 Block，不包含派生课次。 */
export function exportCourseCsv(blocks: Block[]): string {
  const courses = blocks
    .filter((block) => block.kind === 'course' && block.anchor.type === 'curriculum')
    .sort((a, b) => {
      if (a.anchor.type !== 'curriculum' || b.anchor.type !== 'curriculum') return 0
      return a.anchor.weekday - b.anchor.weekday || a.anchor.periods[0] - b.anchor.periods[0] || a.title.localeCompare(b.title)
    })
  const lines = ['课程名,教师,教室,星期,开始节,结束节,周次,颜色']
  for (const block of courses) {
    if (block.anchor.type !== 'curriculum') continue
    lines.push([
      block.title,
      block.detail?.teacher ?? '',
      block.detail?.location ?? '',
      String(block.anchor.weekday),
      String(block.anchor.periods[0]),
      String(block.anchor.periods[1]),
      formatWeeksForCsv(block.anchor.weeks),
      block.color ?? '',
    ].map(csvCell).join(','))
  }
  return `\ufeff${lines.join('\n')}\n`
}

/** 导出当前学期的具体课次，供系统日历导入；停课课次不会写入日历。 */
export function exportCourseIcs(blocks: Block[], occurrences: Occurrence[], calendarName = '几微课程表'): string {
  const blockById = new Map(blocks.map((block) => [block.id, block]))
  const events = occurrences
    .filter(isOccurrenceActive)
    .map((occurrence) => ({ occurrence, block: blockById.get(occurrence.blockId) }))
    .filter((item): item is { occurrence: Occurrence; block: Block } => Boolean(item.block))
    .sort((a, b) => a.occurrence.start.localeCompare(b.occurrence.start))
    .map(({ occurrence, block }) => {
      const title = occurrence.override?.title ?? block.title
      const location = occurrence.override?.location ?? block.detail?.location ?? ''
      const weekday = block.anchor.type === 'curriculum' ? block.anchor.weekday : isoWeekday(occurrence.date)
      const periods = block.anchor.type === 'curriculum' ? block.anchor.periods : [0, 0]
      return [
        'BEGIN:VEVENT',
        `UID:${icsCell(occurrence.id)}@jiwei`,
        `DTSTAMP:${icsDate(new Date())}`,
        `DTSTART;TZID=Asia/Shanghai:${icsDate(new Date(occurrence.override?.start ?? occurrence.start))}`,
        `DTEND;TZID=Asia/Shanghai:${icsDate(new Date(occurrence.override?.end ?? occurrence.end))}`,
        `SUMMARY:${icsCell(title)}`,
        ...(location ? [`LOCATION:${icsCell(location)}`] : []),
        ...(block.detail?.teacher ? [`DESCRIPTION:${icsCell(`教师：${block.detail.teacher}`)}`] : []),
        ...(block.anchor.type === 'curriculum' ? [
          `X-JIWEI-BLOCK-ID:${icsCell(block.id)}`,
          `X-JIWEI-WEEKDAY:${weekday}`,
          `X-JIWEI-PERIODS:${periods[0]}-${periods[1]}`,
          ...(block.color ? [`X-JIWEI-COLOR:${icsCell(block.color)}`] : []),
        ] : []),
        'END:VEVENT',
      ].join('\r\n')
    })
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Jiwei//Course Calendar//CN',
    `X-WR-CALNAME:${icsCell(calendarName)}`,
    'CALSCALE:GREGORIAN',
    ...events,
    'END:VCALENDAR',
    '',
  ].join('\r\n')
}

export function courseImportRowToBlock(row: CourseImportRow, semesterId: string, id: string, now: string): Block {
  return {
    id,
    kind: 'course',
    title: row.title,
    anchor: { type: 'curriculum', semesterId, weekday: row.weekday, periods: [row.periodStart, row.periodEnd], weeks: row.weeks },
    repeat: { mode: 'curriculum', semesterId, weeks: row.weeks },
    detail: {
      ...(row.teacher ? { teacher: row.teacher } : {}),
      ...(row.location ? { location: row.location } : {}),
    },
    ...(row.color ? { color: row.color } : {}),
    createdAt: now,
    updatedAt: now,
  }
}

function normalizeHeader(value: string): string {
  return value.replace(/^\ufeff/, '').replace(/[\s_\-]/g, '').toLowerCase()
}

function parseWeekday(value: string): number | null {
  const n = Number(value.replace(/^(星期|周)/, ''))
  if (Number.isInteger(n) && n >= 1 && n <= 7) return n
  const labels = ['一', '二', '三', '四', '五', '六', '日']
  const index = labels.indexOf(value.replace(/^星期|^周/, ''))
  return index >= 0 ? index + 1 : null
}

function parsePeriod(startText: string, endText: string): [number, number] | null {
  if (!startText) return null
  const combined = startText.match(/^(\d+)\s*[-~至]\s*(\d+)$/)
  if (combined && !endText) return [Number(combined[1]), Number(combined[2])]
  const start = Number(startText)
  const end = endText ? Number(endText) : start
  return Number.isInteger(start) && Number.isInteger(end) ? [start, end] : null
}

function parseWeeks(value: string, totalWeeks: number): number[] {
  if (!value.trim()) return Array.from({ length: totalWeeks }, (_, i) => i + 1)
  const odd = /单/.test(value)
  const even = /双/.test(value)
  if (odd && even) return []
  const cleaned = value.replace(/[单双周\s]/g, '')
  if (!cleaned) return Array.from({ length: totalWeeks }, (_, i) => i + 1).filter((week) => odd ? week % 2 === 1 : even ? week % 2 === 0 : true)
  const weeks = new Set<number>()
  for (const part of cleaned.split(/[,，]/)) {
    const range = part.match(/^(\d+)\s*[-~]\s*(\d+)$/)
    if (range) {
      const start = Number(range[1]), end = Number(range[2])
      if (start < 1 || end > totalWeeks || end < start) return []
      for (let i = start; i <= end; i += 1) weeks.add(i)
    } else if (/^\d+$/.test(part)) {
      const week = Number(part)
      if (week < 1 || week > totalWeeks) return []
      weeks.add(week)
    } else return []
  }
  return [...weeks].filter((week) => week >= 1 && week <= totalWeeks)
    .filter((week) => (odd ? week % 2 === 1 : true))
    .filter((week) => (even ? week % 2 === 0 : true))
    .sort((a, b) => a - b)
}

function formatWeeksForCsv(weeks: number[]): string {
  const sorted = [...weeks].sort((a, b) => a - b)
  if (!sorted.length) return ''
  const contiguous = sorted.every((week, index) => index === 0 || week === sorted[index - 1]! + 1)
  if (contiguous) return `${sorted[0]}-${sorted[sorted.length - 1]}`
  const odd = sorted.every((week) => week % 2 === 1)
  const even = sorted.every((week) => week % 2 === 0)
  if (odd && sorted[0] === 1) return `1-${sorted[sorted.length - 1]}单`
  if (even && sorted[0] === 2) return `1-${sorted[sorted.length - 1]}双`
  return sorted.join(',')
}

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function icsCell(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\r?\n/g, '\\n')
}

function icsDate(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(value).reduce<Record<string, string>>((result, part) => {
    result[part.type] = part.value
    return result
  }, {})
  return `${parts.year}${parts.month}${parts.day}T${parts.hour}${parts.minute}${parts.second}`
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i += 1 }
      else quoted = !quoted
    } else if (char === ',' && !quoted) {
      row.push(cell); cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1
      row.push(cell); cell = ''
      rows.push(row); row = []
    } else cell += char
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  if (quoted) throw new Error('CSV 引号未闭合，请检查课程名或教室中的引号')
  return rows
}

function parseIcsEvents(text: string): Array<Record<string, string>> {
  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')
  const unfolded: string[] = []
  for (const line of lines) {
    if (/^[ \t]/.test(line) && unfolded.length) unfolded[unfolded.length - 1] += line.slice(1)
    else unfolded.push(line)
  }
  const events: Array<Record<string, string>> = []
  let current: Record<string, string> | null = null
  for (const line of unfolded) {
    const upper = line.toUpperCase()
    if (upper === 'BEGIN:VEVENT') {
      current = {}
      continue
    }
    if (upper === 'END:VEVENT') {
      if (current) events.push(current)
      current = null
      continue
    }
    if (!current) continue
    const colon = line.indexOf(':')
    if (colon <= 0) continue
    const rawKey = line.slice(0, colon).split(';', 1)[0]?.trim().toUpperCase()
    if (!rawKey) continue
    current[rawKey] = unescapeIcs(line.slice(colon + 1))
  }
  return events
}

function unescapeIcs(value: string): string {
  return value.replace(/\\n/gi, '\n').replace(/\\([\\;,])/g, '$1')
}

function parseIcsDate(value: string | undefined): { date: string; time: string } | null {
  if (!value) return null
  const compact = value.trim()
  const match = compact.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/)
  if (!match) return null
  if (!match[5]) return null
  if (match[7]) {
    const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6] ?? 0)))
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(utc).reduce<Record<string, string>>((result, part) => {
      result[part.type] = part.value
      return result
    }, {})
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` }
  }
  return { date: `${match[1]}-${match[2]}-${match[3]}`, time: `${match[4]}:${match[5]}` }
}

function matchPeriods(start: string, end: string, periods: CourseImportPeriod[]): [number, number] | null {
  const first = periods.find((period) => period.start === start)
  const last = periods.find((period) => period.end === end)
  return first && last && last.index >= first.index ? [first.index, last.index] : null
}

function parsePeriodText(value: string | undefined): [number, number] | null {
  const match = value?.trim().match(/^(\d+)\s*[-~]\s*(\d+)$/)
  if (!match) return null
  return [Number(match[1]), Number(match[2])]
}

function numberField(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value.trim())) return null
  const number = Number(value.trim())
  return Number.isInteger(number) ? number : null
}

function teacherFromDescription(value: string | undefined): string {
  const match = value?.match(/(?:教师|老师)\s*[：:]\s*(.+)/)
  return match?.[1]?.trim() ?? ''
}
