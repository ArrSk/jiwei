/** 课表网格：把核心数据映射到通用的 `TimeGrid`（后者不认识"课"这个概念）。 */
import type { Block, Occurrence } from '@jiwei/core'
import { TimeGrid, type TimeGridBlock, type TimeGridColumn, type TimeGridRow } from '@jiwei/ui'
import { paletteForTitle } from '../../../lib/palette'

export interface PositionedBlock {
  block: Block
  occ: Occurrence
  weekday: number
  periodStart: number
  periodEnd: number
}

interface Props {
  rows: TimeGridRow[]
  columns: TimeGridColumn[]
  blocks: PositionedBlock[]
  onCellClick: (weekday: number, periodIndex: number) => void
}

export function TimetableGrid({ rows, columns, blocks, onCellClick }: Props) {
  const gridBlocks: TimeGridBlock[] = blocks.map(
    ({ block, occ, weekday, periodStart, periodEnd }) => {
      // 一门课一种颜色，按标题稳定派生（含常见课程的固定配色）
      const palette = paletteForTitle(block.title)

      return {
        id: occ.id,
        weekday,
        periodStart,
        periodEnd,
        muted: occ.status === 'cancelled',
        // 浅色浮起底 + 同色系深字；左侧竖线由 TimeGrid 的 border-left 承担
        style: {
          backgroundColor: palette.bg,
          borderLeftColor: palette.border,
          color: palette.text,
        },
        // 关键：课程名与地点都**不允许截断**（不加 truncate），
        // 手机上要能完整显示课程全名——换行比截断重要。
        // 文字横向居中；层级：课程名（醒目）→ 地点（次要，带 @）→ 老师（仅宽屏）。
        content: (
          <span className="flex h-full min-w-0 flex-col items-center gap-[1px] overflow-hidden text-center">
            <span className="font-semibold [overflow-wrap:anywhere]">{block.title}</span>
            {block.detail?.location ? (
              <span className="opacity-90 [overflow-wrap:anywhere]">@{block.detail.location}</span>
            ) : null}
            {block.detail?.teacher ? (
              <span className="hidden opacity-75 [overflow-wrap:anywhere] sm:block">
                {block.detail.teacher}
              </span>
            ) : null}
            {occ.status === 'moved' ? <span className="mt-auto opacity-90">调课</span> : null}
          </span>
        ),
      } satisfies TimeGridBlock
    },
  )

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <TimeGrid rows={rows} columns={columns} blocks={gridBlocks} onCellClick={onCellClick} />
    </div>
  )
}
