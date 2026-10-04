import { isOccurrenceActive, type Block, type Occurrence } from '@jiwei/core'

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
}

export interface CourseImportOptions {
  semesterId: string
  totalWeeks: number
  maxPeriod: number
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
    const title = get('title')
    const weekday = parseWeekday(get('weekday'))
    const period = parsePeriod(get('periodStart'), get('periodEnd'))
    const weeks = parseWeeks(get('weeks'), options.totalWeeks)
    const errors: string[] = []
    if (!title) errors.push('缺少课程名')
    if (weekday === null) errors.push('星期应为 1-7 或 周一至周日')
    if (!period) errors.push('节次应填写开始节和结束节')
    else if (period[0] < 1 || period[1] > options.maxPeriod || period[1] < period[0]) errors.push(`节次应在 1-${options.maxPeriod} 内`)
    if (!weeks.length) errors.push(`周次应在 1-${options.totalWeeks} 内，例如 1-${options.totalWeeks}`)
    return [{
      line: rowIndex + 2,
      title,
      teacher: get('teacher'),
      location: get('location'),
      weekday: weekday ?? 0,
      periodStart: period?.[0] ?? 0,
      periodEnd: period?.[1] ?? 0,
      weeks,
      color: get('color'),
      errors,
    }]
  })
}

export function courseImportTemplate(): string {
  return '\ufeff课程名,教师,教室,星期,开始节,结束节,周次,颜色\n高等数学,张老师,教西-101,一,1,2,1-16,\n'
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
      return [
        'BEGIN:VEVENT',
        `UID:${icsCell(occurrence.id)}@jiwei`,
        `DTSTAMP:${icsDate(new Date())}`,
        `DTSTART;TZID=Asia/Shanghai:${icsDate(new Date(occurrence.override?.start ?? occurrence.start))}`,
        `DTEND;TZID=Asia/Shanghai:${icsDate(new Date(occurrence.override?.end ?? occurrence.end))}`,
        `SUMMARY:${icsCell(title)}`,
        ...(location ? [`LOCATION:${icsCell(location)}`] : []),
        ...(block.detail?.teacher ? [`DESCRIPTION:${icsCell(`教师：${block.detail.teacher}`)}`] : []),
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
  const cleaned = value.replace(/[单双周\s]/g, '')
  const weeks = new Set<number>()
  for (const part of cleaned.split(/[,，]/)) {
    const range = part.match(/^(\d+)\s*[-~]\s*(\d+)$/)
    if (range) for (let i = Number(range[1]); i <= Number(range[2]); i += 1) weeks.add(i)
    else if (/^\d+$/.test(part)) weeks.add(Number(part))
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
  return rows
}
