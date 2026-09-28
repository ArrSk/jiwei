/**
 * 日视图：只看某一天的课。
 *
 * 为什么要有它：手机上周视图每列只有约 45px，字号被压到 11px、课程名要拆成多行。
 * 日视图一列铺满屏宽（约 330px），**字号能放大一倍、点按区域大 7 倍**，
 * 这是手机端看清课程细节的唯一办法。
 */
import { WEEKDAY_LABELS, weekdayOf, type Block, type Occurrence } from '@jiwei/core'
import { paletteForBlock } from '../../../lib/palette'
import { formatWeeks, periodStartOf } from '../../../lib/weeks'

interface Props {
  /** 这一天有课的场次（已按时间排序） */
  occurrences: Occurrence[]
  blockById: Map<string, Block>
  /** 这一天的完整日期 `2026-09-28` */
  date: string
  /** 是否是今天 */
  isToday: boolean
  onOpen: (block: Block) => void
  /** 点空白处新增（带上节次） */
  onAddAt?: (periodIndex: number) => void
}

export function DayView({ occurrences, blockById, date, isToday, onOpen, onAddAt }: Props) {
  // 星期几交给 core 算 —— 项目约定：日期计算不在这里自己实现
  const weekday = weekdayOf(date)
  const dateLabel = `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`
  const hhmm = (iso: string) => iso.slice(11, 16)

  if (occurrences.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-sm text-muted">
          周{WEEKDAY_LABELS[weekday - 1]}（{dateLabel}）没有课
        </p>
        {onAddAt ? (
          <button
            type="button"
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs hover:bg-surface-alt"
            onClick={() => onAddAt(1)}
          >
            在这一天加一门课
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="bg-surface">
      {/* 顶部一句"周几 + 日期"，今天额外标注 */}
      <div className="flex items-center justify-center gap-1.5 border-b border-border bg-surface-alt/60 px-3 py-1.5">
        <span className="text-[13px] font-medium">
          周{WEEKDAY_LABELS[weekday - 1]}
        </span>
        <span className="text-[12px] text-muted">{dateLabel}</span>
        {isToday ? (
          <span className="rounded bg-brand px-1.5 py-px text-[10px] text-white">今天</span>
        ) : null}
      </div>

      {/* 每节课一整行：左轴固定宽，右边内容占满剩余宽度 */}
      <ul className="divide-y divide-border">
        {occurrences.map((occ) => {
          const block = blockById.get(occ.blockId)
          if (!block) return null
          const palette = paletteForBlock(block)
          const period = periodStartOf(occ.id)
          const cancelled = occ.status === 'cancelled'

          return (
            <li key={occ.id} className="flex items-stretch">
              {/* 左轴：节次号 + 起止时间 */}
              <div className="flex w-[72px] shrink-0 flex-col items-center justify-center border-r border-border py-3 text-muted">
                <span className="text-[15px] font-semibold leading-tight text-ink">{period}</span>
                <span className="text-[11px] leading-tight">{hhmm(occ.start)}</span>
                <span className="text-[11px] leading-tight">{hhmm(occ.end)}</span>
              </div>

              {/* 课程卡片：整块可点，进入编辑 */}
              <button
                type="button"
                disabled={cancelled}
                className={
                  'flex min-w-0 flex-1 flex-col gap-1 px-3 py-2.5 text-left ' +
                  (cancelled ? 'opacity-45' : 'active:bg-surface-alt')
                }
                style={{ backgroundColor: cancelled ? undefined : palette.bg }}
                onClick={() => onOpen(block)}
              >
                <span className="flex items-baseline gap-1.5">
                  <span
                    className={
                      'text-[16px] font-semibold leading-snug ' + (cancelled ? 'line-through' : '')
                    }
                    style={{ color: palette.text }}
                  >
                    {block.title}
                  </span>
                  {occ.status === 'moved' ? (
                    <span className="text-[11px] text-muted">调课</span>
                  ) : null}
                  {cancelled ? <span className="text-[11px] text-muted">停课</span> : null}
                </span>

                <span className="text-[12px] leading-relaxed" style={{ color: palette.text }}>
                  {block.detail?.location ? <span>@{block.detail.location}</span> : null}
                  {block.detail?.location && block.detail?.teacher ? <span> · </span> : null}
                  {block.detail?.teacher ? <span>{block.detail.teacher}</span> : null}
                </span>

                {block.anchor.type === 'curriculum' ? (
                  <span className="text-[11px] opacity-70" style={{ color: palette.text }}>
                    {formatWeeks(block.anchor.weeks)}
                  </span>
                ) : null}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
