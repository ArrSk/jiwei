/** 课表网格：把核心数据映射到通用的 `TimeGrid`（后者不认识"课"这个概念）。 */
import type { Block, Occurrence } from '@jiwei/core'
import { TimeGrid, type TimeGridBlock, type TimeGridColumn, type TimeGridRow } from '@jiwei/ui'
import { paletteForBlock } from '../../../lib/palette'

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
 * 把周次数组压成一句人话：`1-16周`、`1-16单周`、`1,3,5周`。
 * 空数组返回空串（调用方不渲染这一行）。
 */
export function formatWeeks(weeks: number[]): string {
  if (weeks.length === 0) return ''
  const sorted = [...weeks].sort((a, b) => a - b)
  const contiguous = sorted.every((w, i) => i === 0 || w === (sorted[i - 1] ?? 0) + 1)
  if (contiguous) return `${sorted[0]}-${sorted[sorted.length - 1]}周`

  const allOdd = sorted.every((w) => w % 2 === 1)
  const allEven = sorted.every((w) => w % 2 === 0)
  const expectOdd = Array.from({ length: Math.ceil((sorted[sorted.length - 1] ?? 1) / 2) }, (_, i) => i * 2 + 1)
  if (allOdd && expectOdd.length === sorted.length) return `1-${sorted[sorted.length - 1]}单周`
  if (allEven) return `1-${sorted[sorted.length - 1]}双周`

  return `${sorted.join(',')}周`
}

export function TimetableGrid({ rows, columns, blocks, onCellClick }: Props) {
  const gridBlocks: TimeGridBlock[] = blocks.map(
    ({ block, occ, weekday, periodStart, periodEnd }) => {
      // 一门课一种颜色：用户自选优先，否则按课程名稳定派生
      const palette = paletteForBlock(block)
      // 周次只对"教学周"类课程有意义
      const weeksLabel =
        block.anchor.type === 'curriculum' ? formatWeeks(block.anchor.weeks) : ''

      return {
        id: occ.id,
        weekday,
        periodStart,
        periodEnd,
        muted: occ.status === 'cancelled',
        style: { backgroundColor: palette.bg, color: palette.text },
        // 版式对齐参考示例：
        //   课程名加粗在上；下面依次是「@老师」「@教室」「周次」，小字、稍透明、**右对齐**。
        // 课程名**不加 truncate**：手机上要能完整显示，换行比截断重要。
        content: (
          <span className="flex h-full min-w-0 flex-col gap-[2px] overflow-hidden">
            <span className="font-semibold [overflow-wrap:anywhere]">{block.title}</span>
            <span className="flex min-w-0 flex-col items-end text-right text-[10px] leading-[1.35] opacity-85">
              {block.detail?.teacher ? (
                <span className="[overflow-wrap:anywhere]">@{block.detail.teacher}</span>
              ) : null}
              {block.detail?.location ? (
                <span className="[overflow-wrap:anywhere]">@{block.detail.location}</span>
              ) : null}
              {weeksLabel ? <span>{weeksLabel}</span> : null}
              {occ.status === 'moved' ? <span>调课</span> : null}
            </span>
          </span>
        ),
      } satisfies TimeGridBlock
    },
  )

  return (
    // 不加边框、不加圆角：表格要**通栏铺满**整个内容区（对齐参考示例）
    <div className="bg-surface">
      <TimeGrid rows={rows} columns={columns} blocks={gridBlocks} onCellClick={onCellClick} />
    </div>
  )
}
