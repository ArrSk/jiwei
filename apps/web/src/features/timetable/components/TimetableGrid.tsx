/** 课表网格：把核心数据映射到通用的 `TimeGrid`（后者不认识"课"这个概念）。 */
import type { ReactNode } from 'react'
import type { Block, Occurrence } from '@jiwei/core'
import { TimeGrid, type TimeGridBlock, type TimeGridColumn, type TimeGridRow } from '@jiwei/ui'
import { paletteForBlock } from '../../../lib/palette'
import { formatWeeks } from '../../../lib/weeks'

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
  /** 点课程块（进入编辑） */
  onBlockClick?: (block: Block) => void
  /** 点星期列头（进入日视图） */
  onColumnClick?: (weekday: number) => void
  /** 表头左上角格子的内容（课表在这里放月份） */
  corner?: ReactNode
}

export function TimetableGrid({
  rows,
  columns,
  blocks,
  onCellClick,
  onBlockClick,
  onColumnClick,
  corner,
}: Props) {
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
        // 停课、以及"被调走"的那一次都置灰：它们在原时间上都不上课了
        muted: occ.status === 'cancelled' || occ.status === 'moved',
        style: { backgroundColor: palette.bg, color: palette.text },
        // 点课程块 → 进入编辑（M1）。已经不上课的那两次不给点，避免误改模板。
        ...(onBlockClick && occ.status === 'normal'
          ? { onClick: () => onBlockClick(block) }
          : {}),
        // 版式对齐参考示例：
        //   课程名**居中**加粗在上；下面依次是「@老师」「@教室」「周次」，
        //   小字、稍透明、**右对齐**（左中右的错落在窄列里反而更好读）。
        // 课程名**不加 truncate**：手机上要能完整显示，换行比截断重要。
        content: (
          <span className="flex h-full min-w-0 flex-col gap-[2px] overflow-hidden">
            <span className="text-center font-semibold [overflow-wrap:anywhere]">
              {block.title}
            </span>
            <span className="flex min-w-0 flex-col items-end text-right text-[10px] leading-[1.35] opacity-85">
              {block.detail?.teacher ? (
                <span className="[overflow-wrap:anywhere]">@{block.detail.teacher}</span>
              ) : null}
              {block.detail?.location ? (
                <span className="[overflow-wrap:anywhere]">@{block.detail.location}</span>
              ) : null}
              {weeksLabel ? <span>{weeksLabel}</span> : null}
              {/* 「调课」标在**新时间**那一条上；原时间那一条标「已调走」 */}
              {occ.movedFrom ? <span>调课</span> : null}
              {occ.status === 'moved' ? <span>已调走</span> : null}
            </span>
          </span>
        ),
      } satisfies TimeGridBlock
    },
  )

  return (
    // 不加边框、不加圆角：表格要**通栏铺满**整个内容区（对齐参考示例）
    <div className="bg-surface">
      <TimeGrid
        rows={rows}
        columns={columns}
        blocks={gridBlocks}
        corner={corner}
        onCellClick={onCellClick}
        {...(onColumnClick ? { onColumnClick } : {})}
      />
    </div>
  )
}
