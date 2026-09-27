/** 课程清单：核对与删除。M1 会升级成"表格批量编辑"。 */
import { useState } from 'react'
import { WEEKDAY_LABELS, type Block } from '@jiwei/core'
import { TrashIcon } from '@jiwei/ui'
import { paletteForBlock } from '../../../lib/palette'

interface Props {
  courses: Block[]
  onDelete: (block: Block) => Promise<void>
  onLoadDemo: () => Promise<void>
}

export function CourseList({ courses, onDelete, onLoadDemo }: Props) {
  const [pendingId, setPendingId] = useState<string | null>(null)

  const sorted = [...courses].sort((a, b) => {
    const wa = a.anchor.type === 'curriculum' ? a.anchor.weekday : 9
    const wb = b.anchor.type === 'curriculum' ? b.anchor.weekday : 9
    if (wa !== wb) return wa - wb
    const pa = a.anchor.type === 'curriculum' ? a.anchor.periods[0] : 0
    const pb = b.anchor.type === 'curriculum' ? b.anchor.periods[0] : 0
    return pa - pb
  })

  return (
    <section className="mt-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">全部课程（{courses.length}）</h2>
        <button
          type="button"
          className="rounded-md border border-border bg-surface px-2 py-1 text-[11px] hover:bg-surface-alt"
          onClick={() => void onLoadDemo()}
        >
          再载入一次示例
        </button>
      </div>

      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {sorted.map((course) => {
          const anchor = course.anchor
          const when =
            anchor.type === 'curriculum'
              ? `周${WEEKDAY_LABELS[anchor.weekday - 1]} 第 ${anchor.periods[0]}-${anchor.periods[1]} 节`
              : anchor.type === 'absolute'
                ? anchor.start.slice(0, 16).replace('T', ' ')
                : anchor.date
          const weeks =
            anchor.type === 'curriculum' ? summarizeWeeks(anchor.weeks) : '单次'

          return (
            <li key={course.id} className="flex items-center gap-3 px-3 py-2">
              <span
                className="h-8 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: paletteForBlock(course).border }}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{course.title}</div>
                <div className="truncate text-[11px] text-muted">
                  {when} · {weeks}
                  {course.detail?.teacher ? ` · ${course.detail.teacher}` : ''}
                  {course.detail?.location ? ` · ${course.detail.location}` : ''}
                </div>
              </div>
              <button
                type="button"
                aria-label={`删除 ${course.title}`}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-alt hover:text-danger"
                disabled={pendingId === course.id}
                onClick={() => {
                  setPendingId(course.id)
                  void onDelete(course).finally(() => setPendingId(null))
                }}
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** 把周次数组压缩成可读文本：`1-16`、`1-16 单周`、`1,3,5,7` */
export function summarizeWeeks(weeks: number[]): string {
  if (weeks.length === 0) return '无'
  const sorted = [...weeks].sort((a, b) => a - b)
  const isContiguous = sorted.every((w, i) => i === 0 || w === (sorted[i - 1] ?? 0) + 1)
  if (isContiguous) return `${sorted[0]}-${sorted[sorted.length - 1]} 周`

  const allOdd = sorted.every((w) => w % 2 === 1)
  const allEven = sorted.every((w) => w % 2 === 0)
  const expectedOdd = Array.from({ length: Math.ceil((sorted[sorted.length - 1] ?? 1) / 2) }, (_, i) => i * 2 + 1)
  if (allOdd && expectedOdd.length === sorted.length) {
    return `1-${sorted[sorted.length - 1]} 单周`
  }
  if (allEven) return sorted.join('、') + ' 周（双）'

  return sorted.join('、') + ' 周'
}
