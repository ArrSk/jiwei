/**
 * 调课 / 停课弹层：针对**某一次**课（不是整门课）。
 *
 * 真实场景：这周三的高数老师出差停一次；下周一的高数调到周五第 5-6 节。
 * 注意这和「编辑课程」是两件事 —— 后者改的是整学期的模板，前者只动一次。
 * 界面上必须把这句话说清楚，否则用户会以为改一次就是改一学期。
 *
 * 数据层保证：同一门课的同一天只有一条调整记录（id 确定性），
 * 所以「先停课再改到周五」不会留下两条互相矛盾的记录。
 */
import { useState } from 'react'
import {
  WEEKDAY_LABELS,
  addDaysStr,
  cancelAdjustment,
  moveAdjustment,
  weekdayOf,
  type Block,
  type Occurrence,
} from '@jiwei/core'
import { useJiwei } from '../../../JiweiContext'
import { useUiStore } from '../../../store'
import { Sheet, Row, inputClass } from '../../../shell/Sheet'

interface Props {
  block: Block
  occ: Occurrence
  /**
   * 这次调整的**原日期**。
   *
   * 多数时候等于 `occ.date`；但如果用户是从"调课后的新时间"那一端点进来的，
   * 这里仍然是原日期 —— 停课/改期动的必须是同一次课，
   * 否则会出现"从新时间停课 → 原时间还留着一条调课记录"的矛盾状态。
   */
  adjustDate: string
  /** 这是本学期第几节到第几节可选（用当前作息的最大节次） */
  maxPeriod: number
  /** 已有调整（用于显示"已是停课状态"并提供撤销），id 为 null 表示没有 */
  existingId: string | null
  existingLabel: string | null
  onClose: () => void
  /** 保存成功后由外层重查数据 */
  onSaved: (message: string) => Promise<void>
}

export function AdjustSheet({
  block,
  occ,
  adjustDate,
  maxPeriod,
  existingId,
  existingLabel,
  onClose,
  onSaved,
}: Props) {
  const { repos } = useJiwei()
  const toast = useUiStore((s) => s.toast)
  const [busy, setBusy] = useState(false)

  // 「改期」表单的默认值：默认从原日期挪到一周后的同一节
  const [newDate, setNewDate] = useState(addDaysStr(adjustDate, 7))
  const [periodStart, setPeriodStart] = useState(
    block.anchor.type === 'curriculum' ? block.anchor.periods[0] : 1,
  )
  const [periodEnd, setPeriodEnd] = useState(
    block.anchor.type === 'curriculum' ? block.anchor.periods[1] : 1,
  )

  const semesterId = block.anchor.type === 'curriculum' ? block.anchor.semesterId : null
  /** 用户是从"调课之后的新时间"点进来的（此时 occ.date ≠ adjustDate） */
  const fromMovedIn = adjustDate !== occ.date

  async function save(adjustment: ReturnType<typeof cancelAdjustment>, message: string) {
    setBusy(true)
    try {
      await repos.adjustments.put(adjustment)
      onClose()
      await onSaved(message)
    } catch (err) {
      toast(err instanceof Error ? err.message : '保存失败', 'error')
    }
    setBusy(false)
  }

  /** 撤销这一次的调整：把记录删掉，课就恢复原样 */
  async function undo(): Promise<void> {
    if (!existingId) return
    setBusy(true)
    try {
      await repos.adjustments.remove(existingId)
      onClose()
      await onSaved('已恢复原样')
    } catch (err) {
      toast(err instanceof Error ? err.message : '撤销失败', 'error')
    }
    setBusy(false)
  }

  if (!semesterId) {
    return (
      <Sheet title="调整这一次课" onClose={onClose}>
        <p className="text-sm text-muted">这节课不属于任何学期，无法调课。</p>
      </Sheet>
    )
  }

  const periods: number[] = Array.from({ length: maxPeriod }, (_, i) => i + 1)

  return (
    <Sheet
      title="调整这一次课"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="min-h-[46px] flex-1 rounded-xl bg-surface-alt text-[15px] text-ink"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            disabled={busy}
            className="min-h-[46px] flex-1 rounded-xl bg-brand text-[15px] font-medium text-white disabled:opacity-60"
            onClick={() =>
              void save(
                moveAdjustment({
                  blockId: block.id,
                  semesterId,
                  date: adjustDate,
                  newDate,
                  newPeriods: [periodStart, periodEnd],
                }),
                `已把「${block.title}」调到 ${newDate}`,
              )
            }
          >
            {busy ? '保存中…' : '保存改期'}
          </button>
        </>
      }
    >
      {/* 头部：说清"动的只是一次" */}
      <div className="mb-3 rounded-lg bg-surface-alt px-3 py-2">
        <div className="text-[14px] font-medium">{block.title}</div>
        <div className="mt-0.5 text-[11px] text-muted">
          原本：{adjustDate}（周{WEEKDAY_LABELS[weekdayOf(adjustDate) - 1]}）第{' '}
          {block.anchor.type === 'curriculum' ? block.anchor.periods[0] : '?'} 节 ·{' '}
          {occ.start.slice(11, 16)}-{occ.end.slice(11, 16)}
        </div>
        <div className="mt-1 text-[11px] text-muted">
          下面的改法只影响这一次课，这一门课其他周次不受影响。
        </div>
      </div>

      {fromMovedIn ? (
        <div className="mb-3 rounded-lg border border-border bg-surface-alt/60 px-3 py-2 text-[11px] leading-relaxed text-muted">
          这次课是从 {adjustDate} 调过来的。在这里停课或再改期，动的仍然是原来那一次，
          不会多留一条记录。
        </div>
      ) : null}

      {existingLabel ? (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-border px-3 py-2">
          <span className="min-w-0 flex-1 text-[12px]">当前状态：{existingLabel}</span>
          <button
            type="button"
            disabled={busy}
            className="shrink-0 rounded-md border border-border px-2 py-1 text-[11px] disabled:opacity-60"
            onClick={() => void undo()}
          >
            恢复原样
          </button>
        </div>
      ) : null}

      {/* 动作一：停课 */}
      <div className="mb-4 rounded-lg border border-border p-3">
        <div className="mb-2 text-[13px] font-medium">这一次不上</div>
        <p className="mb-2 text-[11px] text-muted">
          停课后这节课仍然显示在课表上（灰色划线），点这里可以随时恢复。
        </p>
        <button
          type="button"
          disabled={busy}
          className="min-h-[40px] w-full rounded-lg border border-red-300 bg-red-50 text-[13px] text-red-700 disabled:opacity-60"
          onClick={() =>
            void save(
              cancelAdjustment({ blockId: block.id, semesterId, date: adjustDate }),
              `已停课：${block.title}（${adjustDate}）`,
            )
          }
        >
          停课（这一天的这一次）
        </button>
      </div>

      {/* 动作二：改期 */}
      <div className="rounded-lg border border-border p-3">
        <div className="mb-2 text-[13px] font-medium">改到别的日期 / 节次</div>
        <Row label="改到">
          <input
            type="date"
            className={inputClass}
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
          />
        </Row>
        <Row label="节次">
          <select
            className={inputClass}
            value={periodStart}
            onChange={(e) => {
              const v = Number(e.target.value)
              setPeriodStart(v)
              if (periodEnd < v) setPeriodEnd(v)
            }}
          >
            {periods.map((p) => (
              <option key={p} value={p}>
                第 {p} 节
              </option>
            ))}
          </select>
          <span className="shrink-0 text-xs text-muted">到</span>
          <select
            className={inputClass}
            value={periodEnd}
            onChange={(e) => setPeriodEnd(Number(e.target.value))}
          >
            {periods
              .filter((p) => p >= periodStart)
              .map((p) => (
                <option key={p} value={p}>
                  第 {p} 节
                </option>
              ))}
          </select>
        </Row>
        <p className="text-[11px] leading-relaxed text-muted">
          改期后这一天会显示「调课」标记。若改到的日期不在本课表的周次范围内，仍然会显示 ——
          便于处理"调到假期前的周末"这类情况。
        </p>
      </div>
    </Sheet>
  )
}
