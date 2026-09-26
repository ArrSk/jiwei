/** 璇捐〃缃戞牸锛氭妸鏍稿績鏁版嵁鏄犲皠鍒伴€氱敤鐨?`TimeGrid`锛堝悗鑰呬笉璁よ瘑"璇?杩欎釜姒傚康锛夈€?*/
import type { Block, Occurrence } from '@jiwei/core'
import { TimeGrid, type TimeGridBlock, type TimeGridColumn, type TimeGridRow } from '@jiwei/ui'

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

/** 璇剧▼鍧楃殑棰滆壊锛氫紭鍏堢敤璇剧▼鑷甫棰滆壊锛屽惁鍒欓€€鍥炰腑鎬ц壊 */
function blockColor(block: Block): string {
  return block.color ?? '#64748b'
}

export function TimetableGrid({ rows, columns, blocks, onCellClick }: Props) {
  const gridBlocks: TimeGridBlock[] = blocks.map(({ block, occ, weekday, periodStart, periodEnd }) => ({
    id: occ.id,
    weekday,
    periodStart,
    periodEnd,
    muted: occ.status === 'cancelled',
    style: { backgroundColor: blockColor(block) },
    content: (
      // 鎵嬫満涓婁竴鍒楀彧鏈?40px 宸﹀彸锛屽洜姝や俊鎭仛涓夌骇闄嶇骇锛氭爣棰?鈫?鍦扮偣 鈫?鑰佸笀銆?      // 灏忓睆鍙繚鐣欐爣棰樹笌鍦扮偣锛涜€佸笀鍦ㄥ皬灞忛殣钘忥紙甯?`hidden sm:block`锛夈€?      <span className="flex h-full min-w-0 flex-col gap-[1px] overflow-hidden">
        <span className="truncate font-semibold">{block.title}</span>
        {block.detail?.location ? (
          <span className="truncate opacity-90">{block.detail.location}</span>
        ) : null}
        {block.detail?.teacher ? (
          <span className="hidden truncate opacity-80 sm:block">{block.detail.teacher}</span>
        ) : null}
        {occ.status === 'moved' ? <span className="mt-auto opacity-90">璋冭</span> : null}
      </span>
    ),
  }))

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <TimeGrid rows={rows} columns={columns} blocks={gridBlocks} onCellClick={onCellClick} />
    </div>
  )
}
