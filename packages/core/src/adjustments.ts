/**
 * 调课 / 停课（`Adjustment`）的纯函数。
 *
 * 语义（与 `materializeAll` 里的应用逻辑严格对应）：
 * - `cancel`：`date` 那一次不上 —— 场次保留但标记 `cancelled`，界面上灰掉而不是消失
 * - `move`  ：`date` 那一次挪到 `newDate`（可同时换节次）—— 原场次标记 `moved`，新日期补一条
 * - `add`   ：在 `newDate` 额外补一次（补课）
 *
 * **id 必须是确定性的**（`adj_<blockId>#<date>`）：
 * 同一天对同一门课只能有一条调课记录，否则会出现"停课了又显示有课"的自相矛盾状态。
 * 用确定性 id + `put` 覆盖，天然幂等，不需要先查再删。
 */
import type { Adjustment, AdjustmentAction } from './schema'

/** 确定性 id：同一门课的同一天只可能有一条调整记录 */
export function adjustmentId(blockId: string, date: string): string {
  return `adj_${blockId}#${date}`
}

/** 找某门课在某一天的调整记录（没有则 undefined） */
export function findAdjustment(
  adjustments: Adjustment[],
  blockId: string,
  date: string,
): Adjustment | undefined {
  return adjustments.find((a) => a.blockId === blockId && a.date === date)
}

/**
 * 找"与某一天这一次课有关"的调整记录，**原时间与新时间都算**。
 *
 * 为什么两个方向都要认：调课之后这节课在界面上出现两次 ——
 * 原时间（已调走）和新时间（调课）。用户从**任意一端**点进去，
 * 都应该能看到当前状态并恢复原样，且都必须定位到**同一条**记录，
 * 否则会出现"从这头撤销了、从那头看还在"。
 *
 * 优先返回以该日为原日期的记录（`cancel` / `move` 的起点）。
 */
export function findAdjustmentForOccurrence(
  adjustments: Adjustment[],
  blockId: string,
  date: string,
): Adjustment | undefined {
  const own = findAdjustment(adjustments, blockId, date)
  if (own) return own
  return adjustments.find((a) => a.blockId === blockId && a.newDate === date)
}

/** 造一条"停课"记录 */
export function cancelAdjustment(input: {
  blockId: string
  semesterId: string
  date: string
  reason?: string
}): Adjustment {
  return {
    id: adjustmentId(input.blockId, input.date),
    semesterId: input.semesterId,
    blockId: input.blockId,
    date: input.date,
    action: 'cancel',
    ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
  }
}

/** 造一条"调课"记录：把 `date` 那一次挪到 `newDate` 的指定节次 */
export function moveAdjustment(input: {
  blockId: string
  semesterId: string
  date: string
  newDate: string
  newPeriods: [number, number]
  reason?: string
}): Adjustment {
  return {
    id: adjustmentId(input.blockId, input.date),
    semesterId: input.semesterId,
    blockId: input.blockId,
    date: input.date,
    action: 'move',
    newDate: input.newDate,
    newPeriods: input.newPeriods,
    ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
  }
}

/** 造一条"补课"记录：在 `newDate` 额外加一次 */
export function addAdjustment(input: {
  blockId: string
  semesterId: string
  date: string
  newDate: string
  newPeriods: [number, number]
  reason?: string
}): Adjustment {
  return { ...moveAdjustment(input), action: 'add' }
}

export const ADJUSTMENT_ACTION_LABELS: Record<AdjustmentAction, string> = {
  cancel: '停课',
  move: '调课',
  add: '补课',
}

/** 一句话说明这条调整做了什么，给界面上的列表用 */
export function describeAdjustment(adj: Adjustment): string {
  const label = ADJUSTMENT_ACTION_LABELS[adj.action]
  if (adj.action === 'cancel') return `${label}（原定 ${adj.date}）`
  const target = adj.newDate ?? '未指定日期'
  const periods = adj.newPeriods ? ` 第 ${adj.newPeriods[0]}-${adj.newPeriods[1]} 节` : ''
  return `${label}：${adj.date} → ${target}${periods}`
}
