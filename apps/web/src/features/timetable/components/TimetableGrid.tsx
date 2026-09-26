/** 课表网格：把核心数据映射到通用的 `TimeGrid`（后者不认识"课"这个概念）。 */
import type { Block, Occurrence } from '@jiwei/core'
import {
  MUTED_PALETTE,
  paletteFor,
  TimeGrid,
  type TimeGridBlock,
  type TimeGridColumn,
  type TimeGridRow,
} from '@jiwei/ui'

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
      // 一门课一种颜色，按标题稳定派生 —— 用户不用手动选色，颜色也不会每次刷新乱跳
      const palette = paletteFor(block.title)
      const cancelled = occ.status === 'cancelled'

      return {
        id: occ.id,
        weekday,
        periodStart,
        periodEnd,
        muted: cancelled,
        style: {
          backgroundColor: cancelled ? MUTED_PALETTE.bg : palette.bg,
          borderLeftColor: cancelled ? MUTED_PALETTE.border : palette.border,
          color: cancelled ? MUTED_PALETTE.text : palette.text,
        },
        // 列很窄（手机上约 45px），文字按重要性逐级降级：课程名 → 地点 → 老师。
        // 老师用 `hidden sm:block` 只在宽屏显示。
        content: (
          <span className="flex h-full min-w-0 flex-col gap-[1px] overflow-hidden">
            <span className="truncate font-semibold">{block.title}</span>
            {block.detail?.location ? (
              <span className="truncate opacity-80">{block.detail.location}</span>
            ) : null}
            {block.detail?.teacher ? (
              <span className="hidden truncate opacity-70 sm:block">{block.detail.teacher}</span>
            ) : null}
            {occ.status === 'moved' ? <span className="mt-auto opacity-80">调课</span> : null}
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
