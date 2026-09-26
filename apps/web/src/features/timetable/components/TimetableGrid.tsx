/** 课表网格：把核心数据映射到通用的 `TimeGrid`（后者不认识"课"这个概念）。 */
import type { Block, Occurrence } from '@jiwei/core'
import { TimeGrid, type TimeGridBlock, type TimeGridColumn, type TimeGridRow } from '@jiwei/ui'
import { colorForTitle } from '../../../lib/demoCourses'

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

/**
 * 课程块颜色。
 *
 * 初版这里写的是 `block.color ?? '#64748b'`，但 `Block.color` 从来没有被写入过
 * （示例课程与新增课程都没设 color），结果所有色块都退化成同一个灰色。
 * 这里改为按课程名稳定派生颜色，恢复课表应有的彩色观感。
 */
function blockColor(block: Block): string {
  return block.color ?? colorForTitle(block.title)
}

export function TimetableGrid({ rows, columns, blocks, onCellClick }: Props) {
  const gridBlocks: TimeGridBlock[] = blocks.map(
    ({ block, occ, weekday, periodStart, periodEnd }) => ({
      id: occ.id,
      weekday,
      periodStart,
      periodEnd,
      muted: occ.status === 'cancelled',
      style: { backgroundColor: blockColor(block) },
      content: (
        // 手机上一列只有约 40px，因此文字做三级降级：标题 → 地点 → 老师。
        // 小屏只保留标题与地点；老师用 `hidden sm:block` 在大屏才显示。
        <span className="flex h-full min-w-0 flex-col gap-[1px] overflow-hidden">
          <span className="truncate font-semibold">{block.title}</span>
          {block.detail?.location ? (
            <span className="truncate opacity-90">{block.detail.location}</span>
          ) : null}
          {block.detail?.teacher ? (
            <span className="hidden truncate opacity-80 sm:block">{block.detail.teacher}</span>
          ) : null}
          {occ.status === 'moved' ? <span className="mt-auto opacity-90">调课</span> : null}
        </span>
      ),
    }),
  )

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <TimeGrid rows={rows} columns={columns} blocks={gridBlocks} onCellClick={onCellClick} />
    </div>
  )
}
