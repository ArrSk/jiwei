/**
 * Occurrence 查询纯函数：范围筛选、下一节课、冲突检测。
 * 这些函数同时服务课表视图（"今天/下一节"卡片）与将来的日程视图。
 */
import { Occurrence } from './schema'
import { compareOccurrence } from './materialize'

/**
 * 这一次课是否**真的会上**。
 *
 * `cancelled`（停课）与原时间上的 `moved`（被调走了）都不算 ——
 * 它们只是留在界面上让用户看见"这里原本有课、现在没了"。
 * 判断"下一节是哪节""有没有冲突""今天有几节课"时都必须用这个函数，
 * 否则会把已经取消的课算进去（例如停课后仍提示"下一节：高等数学"）。
 */
export function isOccurrenceActive(occ: Occurrence): boolean {
  return occ.status !== 'cancelled' && occ.status !== 'moved'
}

/** 日期区间筛选（含首尾），已排除停课与被调走的场次 */
export function occurrencesInRange(
  occurrences: Occurrence[],
  fromDate: string,
  toDate: string,
): Occurrence[] {
  return occurrences
    .filter((o) => isOccurrenceActive(o) && o.date >= fromDate && o.date <= toDate)
    .sort(compareOccurrence)
}

/** 某一天的场次 */
export function occurrencesOnDate(occurrences: Occurrence[], date: string): Occurrence[] {
  return occurrencesInRange(occurrences, date, date)
}

/**
 * 某一天的**全部**场次，**包含已停课与被调走的**。
 *
 * 日视图要用这个：停课/调课的那一次必须仍然显示（灰掉 + 划线 + 标注），
 * 否则用户看不到自己做过什么调整，也就没法把它恢复回来。
 */
export function allOccurrencesOnDate(occurrences: Occurrence[], date: string): Occurrence[] {
  return occurrences.filter((o) => o.date === date).sort(compareOccurrence)
}

/**
 * 下一场（严格在当前时刻之后）。
 * @param nowIso 当前时刻，格式与 `Occurrence.start` 一致（`YYYY-MM-DDTHH:mm:ss+08:00`）；
 *               字符串比较即可，因为本项目统一用同一时区偏移。
 */
export function nextOccurrence(occurrences: Occurrence[], nowIso: string): Occurrence | null {
  const upcoming = occurrences
    .filter((o) => isOccurrenceActive(o) && o.end > nowIso)
    .sort(compareOccurrence)
  return upcoming[0] ?? null
}

/** 正在进行中的场次（start <= now < end） */
export function ongoingOccurrences(
  occurrences: Occurrence[],
  nowIso: string,
): Occurrence[] {
  return occurrences.filter((o) => isOccurrenceActive(o) && o.start <= nowIso && o.end > nowIso)
}

/** 两个 ISO 时刻是否重叠（半开区间 [start, end)） */
function overlaps(a: Occurrence, b: Occurrence): boolean {
  return a.start < b.end && b.start < a.end
}

export interface Conflict {
  date: string
  a: Occurrence
  b: Occurrence
}

/**
 * 冲突检测：同一天、时间重叠的场次。
 * M0 只在"添加课程/导入"时提示，不阻止写入（真实课表确实会有合班与重叠）。
 */
export function detectConflicts(occurrences: Occurrence[]): Conflict[] {
  const byDate = new Map<string, Occurrence[]>()
  for (const o of occurrences) {
    if (!isOccurrenceActive(o)) continue
    const list = byDate.get(o.date) ?? []
    list.push(o)
    byDate.set(o.date, list)
  }

  const conflicts: Conflict[] = []
  for (const [date, list] of byDate) {
    list.sort(compareOccurrence)
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i]
        const b = list[j]
        if (!a || !b) continue
        if (overlaps(a, b)) conflicts.push({ date, a, b })
      }
    }
  }
  return conflicts
}

/** 去重：同一 id 只保留一条（重建过程中移动过的场次可能重复） */
export function dedupeOccurrences(occurrences: Occurrence[]): Occurrence[] {
  const map = new Map<string, Occurrence>()
  for (const o of occurrences) {
    const existing = map.get(o.id)
    // 后出现的覆盖先出现的（调用方按优先级排序）
    if (!existing || o.status !== 'normal') map.set(o.id, o)
  }
  return [...map.values()].sort(compareOccurrence)
}
