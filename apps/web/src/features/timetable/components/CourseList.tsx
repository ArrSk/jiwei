/** 课程清单：核对、删除、进入批量编辑。 */
import { useState } from 'react'
import { WEEKDAY_LABELS, type Block } from '@jiwei/core'
import { ChevronLeftIcon, TrashIcon } from '@jiwei/ui'
import { paletteForBlock } from '../../../lib/palette'
import { formatWeeks } from '../../../lib/weeks'

interface Props {
  courses: Block[]
  onDelete: (block: Block) => Promise<void>
  onLoadDemo: () => Promise<void>
  /** 打开批量编辑（一屏内改多门课） */
  onBatchEdit?: () => void
}

export function CourseList({ courses, onDelete, onLoadDemo, onBatchEdit }: Props) {
  const [pendingId, setPendingId] = useState<string | null>(null)
  /**
   * 默认收起。
   *
   * 为什么：课程总览排在 12 节课的表格**下方**，一学期常有上百次课，
   * 展开着会让人以为"页面就到表格为止"。收起成一行标题，需要时点开。
   */
  const [open, setOpen] = useState(false)

  const sorted = [...courses].sort((a, b) => {
    const wa = a.anchor.type === 'curriculum' ? a.anchor.weekday : 9
    const wb = b.anchor.type === 'curriculum' ? b.anchor.weekday : 9
    if (wa !== wb) return wa - wb
    const pa = a.anchor.type === 'curriculum' ? a.anchor.periods[0] : 0
    const pb = b.anchor.type === 'curriculum' ? b.anchor.periods[0] : 0
    return pa - pb
  })

  return (
    <section className="border-t border-border bg-surface">
      {/* 标题行：整行可点，用于展开/收起 */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <button
          type="button"
          className="flex items-center gap-1.5 text-sm font-semibold"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronLeftIcon
            className={
              'h-4 w-4 text-muted transition-transform ' + (open ? '-rotate-90' : 'rotate-180')
            }
          />
          全部课程（{courses.length}）
        </button>
        {open ? (
          <div className="flex items-center gap-1.5">
            {onBatchEdit ? (
              <button
                type="button"
                className="rounded-md border border-border bg-surface px-2 py-1 text-[11px] hover:bg-surface-alt"
                onClick={onBatchEdit}
              >
                批量编辑
              </button>
            ) : null}
            <button
              type="button"
              className="rounded-md border border-border bg-surface px-2 py-1 text-[11px] hover:bg-surface-alt"
              onClick={() => void onLoadDemo()}
            >
              再载入一次示例
            </button>
          </div>
        ) : null}
      </div>

      {open ? (
        <ul className="divide-y divide-border">
          {sorted.map((course) => {
            const anchor = course.anchor
            const when =
              anchor.type === 'curriculum'
                ? `周${WEEKDAY_LABELS[anchor.weekday - 1]} 第 ${anchor.periods[0]}-${anchor.periods[1]} 节`
                : anchor.type === 'absolute'
                  ? anchor.start.slice(0, 16).replace('T', ' ')
                  : anchor.type === 'allDay'
                    ? anchor.date
                    : anchor.type === 'range'
                      ? `${anchor.start} 至 ${anchor.end}`
                      : anchor.type === 'weekly'
                        ? '每周重复'
                        : '长期计划'
            const weeks =
              anchor.type === 'curriculum' ? formatWeeks(anchor.weeks) || '每周' : '单次'

            return (
              <li key={course.id} className="flex items-center gap-3 px-3 py-2">
                {/* 用课程自己的配色做色条，与课表网格保持一致 */}
                <span
                  className="h-8 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: paletteForBlock(course).text }}
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
      ) : null}
    </section>
  )
}
