/**
 * 时间展开引擎 —— **本项目唯一的时间真相来源**（docs/ARCHITECTURE.md 4.4）。
 *
 * 把"模板"（`Block`）展开成"具体某一次"（`Occurrence`）。
 * 前端预览、落库、iCal 导出、闹钟排程、提醒调度**全部调用这里**，
 * 任何模块都不得自己算日期，否则同一次课在不同地方会算出不同结果。
 *
 * 全部为纯函数：不写库、不读时钟、不依赖环境。
 */
import {
  Adjustment,
  Block,
  BlockAnchor,
  Occurrence,
  Period,
  Semester,
} from './schema'
import { dateForWeek, periodRange } from './semester'
import { addDaysStr, combineDateTime, diffDays, isoWeekday } from './date'

/** 注入 id 生成器（便于测试固定输出；服务端可换 uuid） */
export interface MaterializeDeps {
  newId: () => string
}

/**
 * `Occurrence` 的确定性 ID。
 * 这个稳定性是**整个扩展性的地基**：重建实例后 ID 不变，
 * 因此挂在 occurrence 上的闹钟与笔记永远不会因为重建而失联。
 */
export function occurrenceId(blockId: string, date: string, periodStart: number | string): string {
  return `occ_${blockId}#${date}#${periodStart}`
}

/** 按学期总周数过滤出合法周次，升序去重 */
export function expandWeeks(weeks: number[], totalWeeks: number): number[] {
  return [...new Set(weeks)].filter((w) => w >= 1 && w <= totalWeeks).sort((a, b) => a - b)
}

/** 生成从 `start` 到 `until` 之间每 `interval` 周的日期（含首尾），仅保留 weekday 匹配的 */
function weeklyDates(
  start: string,
  until: string,
  interval: number,
  weekday: number,
): string[] {
  const out: string[] = []
  const total = diffDays(start, until)
  if (total < 0) return out
  // 从 start 起按 7*interval 天步进
  for (let offset = 0; offset <= total; offset += 7 * interval) {
    const date = addDaysStr(start, offset)
    if (isoWeekday(date) === weekday) out.push(date)
  }
  return out
}

/** 该日期落在哪些教学周（用于判断某天是否在 block 的周次集合内） */

/**
 * 展开单个 Block 的全部 Occurrence（**不含**假期/调课覆盖，覆盖由 `applyAdjustments` 处理）。
 *
 * 三种 anchor 的处理：
 * - `curriculum`：周次 × 星期 × 节次，时刻由作息表派生
 * - `absolute`  ：repeat 为 once / weekly
 * - `allDay`    ：单天（当前不做跨天全天）
 */
export function materializeBlock(
  block: Block,
  ctx: { semester: Semester; periods: Period[] },
): Occurrence[] {
  const { semester, periods } = ctx
  const anchor = block.anchor

  if (anchor.type === 'curriculum') {
    const range = periodRange(periods, semester.startDate, anchor.periods[0], anchor.periods[1])
    if (!range) {
      // 作息表缺该节次：不静默失败，直接返回空，调用方（导入向导）应校验并提示
      return []
    }
    const weeks = expandWeeks(anchor.weeks, semester.totalWeeks)
    return weeks.flatMap((week) => {
      const date = dateForWeek(semester, week, anchor.weekday)
      const r = periodRange(periods, date, anchor.periods[0], anchor.periods[1])
      if (!r) return []
      return [makeOccurrence(block, date, r.start, r.end, semester.id, anchor.periods[0])]
    })
  }

  if (anchor.type === 'absolute') {
    const dates: string[] =
      block.repeat.mode === 'weekly'
        ? weeklyDates(
            anchor.start.slice(0, 10),
            block.repeat.until,
            block.repeat.interval,
            isoWeekday(anchor.start.slice(0, 10)),
          )
        : [anchor.start.slice(0, 10)]

    return dates.map((date) => {
      const startTime = anchor.start.slice(11, 16)
      const endTime = anchor.end.slice(11, 16)
      return makeOccurrence(
        block,
        date,
        combineDateTime(date, startTime),
        combineDateTime(date, endTime),
        undefined,
        0,
      )
    })
  }

  if (anchor.type === 'floating') return []

  if (anchor.type === 'deadline') {
    const at = combineDateTime(anchor.date, anchor.time ?? '23:59')
    return [makeOccurrence(block, anchor.date, at, at, undefined, 0)]
  }

  if (anchor.type === 'range') {
    const from = anchor.start < semester.startDate ? semester.startDate : anchor.start
    const semesterEnd = dateForWeek(semester, semester.totalWeeks, 7)
    const to = anchor.end > semesterEnd ? semesterEnd : anchor.end
    const dates: string[] = []
    for (let cursor = from; cursor <= to; cursor = addDaysStr(cursor, 1)) dates.push(cursor)
    return dates.map((date) => makeOccurrence(block, date, combineDateTime(date, '00:00'), combineDateTime(date, '23:59'), undefined, 0))
  }

  if (anchor.type === 'weekly') {
    const semesterEnd = dateForWeek(semester, semester.totalWeeks, 7)
    const until = anchor.until && anchor.until < semesterEnd ? anchor.until : semesterEnd
    const from = anchor.startDate > semester.startDate ? anchor.startDate : semester.startDate
    const dates: string[] = []
    for (let cursor = from; cursor <= until; cursor = addDaysStr(cursor, 1)) {
      if (anchor.weekdays.includes(isoWeekday(cursor))) dates.push(cursor)
    }
    return dates.map((date) => {
      const start = anchor.startTime ?? '00:00'
      const end = anchor.endTime ?? '23:59'
      return makeOccurrence(block, date, combineDateTime(date, start), combineDateTime(date, end), undefined, 0)
    })
  }

  // allDay
  return [
    makeOccurrence(
      block,
      anchor.date,
      combineDateTime(anchor.date, '00:00'),
      combineDateTime(anchor.date, '23:59'),
      undefined,
      0,
    ),
  ]
}

function makeOccurrence(
  block: Block,
  date: string,
  start: string,
  end: string,
  semesterId: string | undefined,
  periodStart: number,
): Occurrence {
  const occ: Occurrence = {
    id: occurrenceId(block.id, date, periodStart),
    blockId: block.id,
    date,
    start,
    end,
    status: 'normal',
  }
  if (semesterId) occ.semesterId = semesterId
  return occ
}

/**
 * 展开一批 Block，并套用调课/停课（`Adjustment`）。
 *
 * 三种调整的语义（这三条是**界面上必须看到的差别**，不能含糊）：
 * - `cancel`：原时间那一次标记 `cancelled` —— 界面灰掉划线，提示"停课"
 * - `move`  ：原时间那一次标记 `moved`（这里已经没课了），并在新日期补一条 `normal`，
 *             带上 `movedFrom` 记录原日期 —— 界面在新日期标"调课"
 * - `add`   ：只在 `newDate` 补一条 `normal`（补课），原时间不动
 *
 * ⚠️ 曾经的错误：`moved` 被标记在**新日期**那一条上，原时间保持 `normal`，
 * 于是同一次课在原时间与新时间各显示一遍。判据就在下面的测试里。
 */
export function materializeAll(
  blocks: Block[],
  ctx: { semester: Semester; periods: Period[] },
  adjustments: Adjustment[] = [],
  deps: MaterializeDeps = { newId: () => `adj_${Math.random().toString(36).slice(2, 10)}` },
): Occurrence[] {
  const out: Occurrence[] = []
  for (const block of blocks) {
    const own = materializeBlock(block, ctx)
    const related = adjustments.filter((a) => a.blockId === block.id)
    out.push(...applyAdjustments(own, block, related, ctx, deps))
  }
  return out.sort(compareOccurrence)
}

function applyAdjustments(
  occurrences: Occurrence[],
  block: Block,
  adjustments: Adjustment[],
  ctx: { semester: Semester; periods: Period[] },
  deps: MaterializeDeps,
): Occurrence[] {
  if (adjustments.length === 0) return occurrences

  const cancels = new Set(adjustments.filter((a) => a.action === 'cancel').map((a) => a.date))
  const movesAway = new Set(
    adjustments
      .filter((a) => a.action === 'move' && a.newDate)
      .map((a) => a.date),
  )

  const result: Occurrence[] = []
  for (const occ of occurrences) {
    if (cancels.has(occ.date)) {
      result.push({ ...occ, status: 'cancelled' })
    } else if (movesAway.has(occ.date)) {
      // 原时间不再上课：保留记录并标记，界面上灰掉，用户可据此撤销
      result.push({ ...occ, status: 'moved' })
    } else {
      result.push(occ)
    }
  }

  // move / add：在新日期补一次
  for (const adj of adjustments) {
    if (adj.action === 'cancel' || !adj.newDate) continue
    const periods = adj.newPeriods ?? defaultPeriodsOf(block, ctx)
    if (!periods) continue
    const r = periodRange(ctx.periods, adj.newDate, periods[0], periods[1])
    if (!r) continue
    result.push({
      id: occurrenceId(block.id, adj.newDate, periods[0]),
      blockId: block.id,
      ...(ctx.semester.id ? { semesterId: ctx.semester.id } : {}),
      date: adj.newDate,
      start: r.start,
      end: r.end,
      status: 'normal',
      // 调过来的那一次要留下"从哪来"的痕迹，否则新位置上看起来和普通课一样
      ...(adj.action === 'move' ? { movedFrom: adj.date } : {}),
    })
  }
  void deps
  return result
}

function defaultPeriodsOf(
  block: Block,
  _ctx: { semester: Semester; periods: Period[] },
): [number, number] | null {
  return block.anchor.type === 'curriculum' ? block.anchor.periods : null
}

/** 时间升序（同刻按 id，保证输出稳定可测） */
export function compareOccurrence(a: Occurrence, b: Occurrence): number {
  return a.start === b.start ? a.id.localeCompare(b.id) : a.start.localeCompare(b.start)
}

/** 该日期是周几（1=周一） */
export function weekdayOfAnchor(anchor: BlockAnchor): number | null {
  return anchor.type === 'curriculum' ? anchor.weekday : null
}
