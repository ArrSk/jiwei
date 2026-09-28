/**
 * 表格批量编辑：一屏内改多门课。
 *
 * 为什么需要：录完十几门课之后发现"周三下午的课全都排错了节次"，
 * 用现有流程要一门一门点开改 —— 十几轮弹层开关，谁都不想干。
 *
 * 设计取舍：
 * - **只放最常改的四项**（名称 / 星期 / 起止节次 / 周次）。老师、教室、颜色仍走单门编辑，
 *   否则一屏塞不下，手机上要左右滚动，反而更难改。
 * - 改动**先存在本地草稿里**，点「保存全部」才写库。这样中途退出不会写进一半。
 * - 只写真正改过的行：没动的课不碰 `updatedAt`，也避免无谓的重建。
 */
import { useMemo, useState } from 'react'
import { WEEKDAY_LABELS, type Block } from '@jiwei/core'
import { allWeeks } from '@jiwei/data'
import { parseWeeks, weeksToFormText } from '../../../lib/weeks'
import { Sheet, inputClass } from '../../../shell/Sheet'

interface Props {
  courses: Block[]
  maxPeriod: number
  totalWeeks: number
  onClose: () => void
  /** 保存改过的课程；返回实际写入的门数 */
  onSave: (updated: Block[], summary: string) => Promise<void>
}

/** 草稿行：只保留可批量改的字段，全部用字符串存，避免输入过程中被 Number 吃掉半截 */
interface DraftRow {
  title: string
  weekday: number
  periodStart: number
  periodEnd: number
  weeksText: string
}

function toDraft(block: Block): DraftRow {
  const anchor = block.anchor
  if (anchor.type !== 'curriculum') {
    return { title: block.title, weekday: 1, periodStart: 1, periodEnd: 1, weeksText: '' }
  }
  return {
    title: block.title,
    weekday: anchor.weekday,
    periodStart: anchor.periods[0],
    periodEnd: anchor.periods[1],
    weeksText: anchor.weeks.length > 0 ? weeksToFormText(anchor.weeks) : '',
  }
}

export function BatchEditSheet({ courses, maxPeriod, totalWeeks, onClose, onSave }: Props) {
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>(() =>
    Object.fromEntries(courses.map((b) => [b.id, toDraft(b)])),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const periods: number[] = Array.from({ length: maxPeriod }, (_, i) => i + 1)

  /** 哪几门被改过 —— 决定「保存全部」要不要可点 */
  const changedIds = useMemo(
    () =>
      courses
        .filter((b) => {
          const d = drafts[b.id]
          if (!d) return false
          const original = toDraft(b)
          return (
            d.title !== original.title ||
            d.weekday !== original.weekday ||
            d.periodStart !== original.periodStart ||
            d.periodEnd !== original.periodEnd ||
            d.weeksText.trim() !== original.weeksText.trim()
          )
        })
        .map((b) => b.id),
    [courses, drafts],
  )

  function patch(id: string, part: Partial<DraftRow>): void {
    setDrafts((d) => {
      const current = d[id]
      if (!current) return d
      return { ...d, [id]: { ...current, ...part } }
    })
    setError(null)
  }

  async function handleSave(): Promise<void> {
    if (changedIds.length === 0) {
      onClose()
      return
    }

    const updated: Block[] = []
    for (const block of courses) {
      if (!changedIds.includes(block.id)) continue
      const d = drafts[block.id]
      if (!d) continue
      const anchor = block.anchor
      // 只处理教学周课程：批量编辑的四项（星期/节次/周次）只对它们有意义
      if (anchor.type !== 'curriculum') continue

      if (d.title.trim() === '') {
        setError(`「${block.title}」的课程名不能为空`)
        return
      }
      if (d.periodEnd < d.periodStart) {
        setError(`「${d.title}」的结束节次早于开始节次`)
        return
      }
      const weeks =
        d.weeksText.trim() === '' ? allWeeks(totalWeeks) : parseWeeks(d.weeksText, totalWeeks)
      if (weeks.length === 0) {
        setError(`「${d.title}」的周次解析为空，示例：1-16 或 1-16单`)
        return
      }

      updated.push({
        ...block,
        title: d.title.trim(),
        anchor: {
          type: 'curriculum',
          semesterId: anchor.semesterId,
          weekday: d.weekday,
          periods: [d.periodStart, d.periodEnd],
          weeks,
        },
        repeat: { mode: 'curriculum', semesterId: anchor.semesterId, weeks },
        updatedAt: new Date().toISOString(),
      })
    }

    setBusy(true)
    try {
      await onSave(updated, `已更新 ${updated.length} 门课`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    }
    setBusy(false)
  }

  return (
    <Sheet
      title="批量编辑"
      onClose={onClose}
      maxHeight="92dvh"
      headerExtra={
        <span className="shrink-0 text-[11px] text-muted">
          {changedIds.length > 0 ? `${changedIds.length} 门有改动` : '暂无改动'}
        </span>
      }
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
            disabled={busy || changedIds.length === 0}
            className="min-h-[46px] flex-1 rounded-xl bg-brand text-[15px] font-medium text-white disabled:opacity-60"
            onClick={() => void handleSave()}
          >
            {busy ? '保存中…' : `保存全部（${changedIds.length}）`}
          </button>
        </>
      }
    >
      {error ? (
        <div className="mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-700">
          {error}
        </div>
      ) : null}

      <p className="mb-3 text-[11px] leading-relaxed text-muted">
        这里改的是整学期的安排（所有周次都跟着变）。只想动某一天，请到日视图里点那节课。
      </p>

      <ul className="space-y-2.5">
        {courses.map((block) => {
          const d = drafts[block.id]
          if (!d) return null
          const changed = changedIds.includes(block.id)
          return (
            <li
              key={block.id}
              className={
                'rounded-lg border p-2.5 ' +
                (changed ? 'border-brand/60 bg-brand/5' : 'border-border')
              }
            >
              <input
                className={inputClass + ' mb-2 w-full font-medium'}
                value={d.title}
                onChange={(e) => patch(block.id, { title: e.target.value })}
              />

              <div className="mb-2 flex items-center gap-1.5">
                <select
                  className={inputClass}
                  value={d.weekday}
                  onChange={(e) => patch(block.id, { weekday: Number(e.target.value) })}
                >
                  {WEEKDAY_LABELS.map((label, i) => (
                    <option key={label} value={i + 1}>
                      周{label}
                    </option>
                  ))}
                </select>

                <select
                  className={inputClass}
                  value={d.periodStart}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    patch(block.id, { periodStart: v, ...(d.periodEnd < v ? { periodEnd: v } : {}) })
                  }}
                >
                  {periods.map((p) => (
                    <option key={p} value={p}>
                      {p} 节
                    </option>
                  ))}
                </select>
                <span className="shrink-0 text-xs text-muted">–</span>
                <select
                  className={inputClass}
                  value={d.periodEnd}
                  onChange={(e) => patch(block.id, { periodEnd: Number(e.target.value) })}
                >
                  {periods
                    .filter((p) => p >= d.periodStart)
                    .map((p) => (
                      <option key={p} value={p}>
                        {p} 节
                      </option>
                    ))}
                </select>
              </div>

              <input
                className={inputClass + ' w-full'}
                placeholder={`周次，留空 = 每周（如 1-${totalWeeks}单）`}
                value={d.weeksText}
                onChange={(e) => patch(block.id, { weeksText: e.target.value })}
              />
            </li>
          )
        })}
      </ul>
    </Sheet>
  )
}
