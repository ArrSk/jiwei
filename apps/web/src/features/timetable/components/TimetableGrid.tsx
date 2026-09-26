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
        // 关键：课程名与地点都**不允许截断**（不加 truncate），
        // 手机上要能完整显示课程全名——换行比截断重要。
        // 文字按重要性降级：课程名（醒目）→ 地点（次要），老师仅在宽屏显示。
        <span className="flex h-full min-w-0 flex-col gap-[1px] overflow-hidden">
          <span className="font-semibold [overflow-wrap:anywhere]">{block.title}</span>
          {block.detail?.location ? (
            <span className="opacity-90 [overflow-wrap:anywhere]">{block.detail.location}</span>
          ) : null}
          {block.detail?.teacher ? (
            <span className="hidden opacity-80 [overflow-wrap:anywhere] sm:block">
              {block.detail.teacher}
            </span>
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
