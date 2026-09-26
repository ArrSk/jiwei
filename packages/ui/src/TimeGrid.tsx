/**
 * 通用时间网格。
 *
 * **不是课表专用组件**：传入"列 + 行 + 块"即可渲染，课表与将来的日程视图共用
 * （docs/ARCHITECTURE.md 7.1）。
 *
 * 实现要点（每一条都是踩过坑之后定下来的）：
 *
 * 1. **表头必须有自己的 z-index**。课程块是 z-10，而表头单元格若没有定位与 z-index，
 *    两者同处一个网格堆叠上下文，跨节的大块会直接盖住表头 —— 曾出现过这个 bug。
 * 2. **左侧节次轴不做 sticky**，它就是普通的第 1 列网格项。
 *    给"表头 + 轴"整行加 sticky 会让该行脱离原有网格行，把轴列挤出可视区。
 * 3. **显式给出 `gridColumn` / `gridRow`**，不依赖自动摆放；轴、空白格、时间块
 *    共用同一套行号计算，因此必然对齐。
 * 4. **不画分割线**：相邻节次靠交替底色、相邻星期靠留白与今日列高亮区分。
 *
 * 响应式：列宽 `minmax(0,1fr)`，手机上 7 天全部塞进一屏、无需横向滑动；
 * 行高与字号用 `clamp()` 随屏宽收缩。
 */
import type { CSSProperties, ReactNode } from 'react'
import clsx from 'clsx'

/** 时间块在网格中的位置与内容 */
export interface TimeGridBlock {
  id: string
  /** 1-7（周一至周日） */
  weekday: number
  /** 起始节次（1 起） */
  periodStart: number
  /** 结束节次（含） */
  periodEnd: number
  content?: ReactNode
  label?: ReactNode
  className?: string
  style?: CSSProperties
  onClick?: () => void
  /** 置灰显示（例如被停课的那一次） */
  muted?: boolean
}

export interface TimeGridRow {
  /** 节次（1 起），与 block.periodStart/periodEnd 对齐 */
  index: number
  /** 轴列主标题：只写数字（"1"），单位"节"由表头承担，避免窄列被裁切 */
  label: string
  /**
   * 轴列副标题。含 `-` 时（如 `"08:00-08:45"`）会被**拆成两行**显示：
   * 轴列很窄，拆行比缩小字号更易读。
   */
  sub?: string
}

export interface TimeGridColumn {
  /** 1-7 */
  weekday: number
  /** 列头主标题，例如 "周一" */
  title: string
  /** 列头副标题（日期），例如 "9/21" */
  sub?: string
  isToday?: boolean
}

export interface TimeGridProps {
  rows: TimeGridRow[]
  columns: TimeGridColumn[]
  blocks: TimeGridBlock[]
  /** 点击网格空白处 */
  onCellClick?: (weekday: number, periodIndex: number) => void
  /** 行高，默认用 CSS clamp 自适应；传入则固定 */
  rowHeight?: number
  className?: string
}

export function TimeGrid({
  rows,
  columns,
  blocks,
  onCellClick,
  rowHeight,
  className,
}: TimeGridProps) {
  const { layoutRows, rowOf, firstBodyGridRow, bodyGridRowCount } = buildRows(rows)

  const gridStyle: CSSProperties = {
    // 轴列 + 7 天；列宽可变，因此手机上不需要横向滚动
    gridTemplateColumns: 'var(--tg-axis) repeat(7, minmax(0, 1fr))',
    gridTemplateRows: rowHeight
      ? `auto auto repeat(${bodyGridRowCount}, ${rowHeight}px)`
      : 'auto auto repeat(var(--tg-rows), var(--tg-row-h))',
  }

  return (
    <div
      className={clsx('tg-root overflow-hidden', className)}
      style={
        {
          // 轴列要放下「1 / 08:00 / 08:45」三行，节次号偏大所以行高给足
          '--tg-axis': 'clamp(2.7rem, 12vw, 3.6rem)',
          '--tg-row-h': 'clamp(2.7rem, 9vw, 3.6rem)',
          '--tg-rows': bodyGridRowCount,
        } as CSSProperties
      }
    >
      <div className="grid" style={gridStyle}>
        {/* ① 星期行：左上角空格 + 7 个星期名 */}
        <div
          className="sticky top-0 z-30 border-b border-border bg-surface-alt"
          style={{ gridColumn: 1, gridRow: 1 }}
        />
        {columns.map((col) => (
          <div
            key={`head-${col.weekday}`}
            className={clsx(
              'sticky top-0 z-30 flex items-end justify-center border-b border-border pb-0.5 pt-1',
              col.isToday ? 'bg-brand-soft' : 'bg-surface-alt',
            )}
            style={{ gridColumn: col.weekday + 1, gridRow: 1 }}
          >
            <span
              className={clsx(
                'text-[11px] leading-none sm:text-xs',
                col.isToday ? 'font-semibold text-brand' : 'font-medium text-ink',
              )}
            >
              {col.title}
            </span>
          </div>
        ))}

        {/* ② 日期行：与星期行分开，日期不会被星期挤掉 */}
        <div
          className="sticky top-0 z-30 border-b border-border bg-surface-alt"
          style={{ gridColumn: 1, gridRow: 2 }}
        />
        {columns.map((col) => (
          <div
            key={`date-${col.weekday}`}
            className={clsx(
              'sticky top-0 z-30 flex items-start justify-center border-b border-border pb-0.5',
              col.isToday ? 'bg-brand-soft' : 'bg-surface-alt',
            )}
            style={{ gridColumn: col.weekday + 1, gridRow: 2 }}
          >
            {col.sub ? (
              <span
                className={clsx(
                  'text-[9px] leading-tight sm:text-[10px]',
                  col.isToday ? 'font-medium text-brand' : 'text-muted',
                )}
              >
                {col.sub}
              </span>
            ) : null}
          </div>
        ))}

        {/* ③ 行：左侧节次轴 + 7 天空白格 */}
        {layoutRows.map((row) => {
          const gridRow = firstBodyGridRow + row.gridIndex
          const [startTime, endTime] = row.sub?.split('-') ?? []

          return (
            <div key={`row-${row.index}`} style={{ display: 'contents' }}>
              {/* 节次轴：节次号大、时间小。轴上只放数字与时刻，字段名由表头承担 */}
              <div
                className={clsx(
                  'flex flex-col items-center justify-center gap-[2px] px-0.5 text-center',
                  row.striped ? 'bg-surface-alt/70' : 'bg-surface-alt/40',
                )}
                style={{ gridColumn: 1, gridRow }}
              >
                <span className="text-[14px] font-semibold leading-none text-ink sm:text-base">
                  {row.label}
                </span>
                {startTime ? (
                  <span className="text-[7px] leading-none text-muted sm:text-[8px]">
                    {startTime}
                  </span>
                ) : null}
                {endTime ? (
                  <span className="text-[7px] leading-none text-muted/75 sm:text-[8px]">
                    {endTime}
                  </span>
                ) : null}
              </div>

              {columns.map((col) => (
                <button
                  key={`cell-${row.index}-${col.weekday}`}
                  type="button"
                  tabIndex={-1}
                  aria-label={`${col.title} 第 ${row.index} 节`}
                  onClick={() => onCellClick?.(col.weekday, row.index)}
                  className={clsx(
                    'transition-colors',
                    col.isToday
                      ? row.striped
                        ? 'bg-brand-soft/70'
                        : 'bg-brand-soft/50'
                      : row.striped
                        ? 'bg-surface-alt/55'
                        : 'bg-surface',
                    onCellClick && 'cursor-pointer hover:bg-brand-soft/80',
                  )}
                  style={{ gridColumn: col.weekday + 1, gridRow }}
                />
              ))}
            </div>
          )
        })}

        {/* ④ 时间块：靠 grid-row 跨节，不需要测量像素高度 */}
        {blocks.map((block) => {
          const startIdx = rowOf(block.periodStart)
          const endIdx = rowOf(block.periodEnd)
          if (startIdx === null || endIdx === null) return null
          return (
            <div
              key={block.id}
              // 左右留一点白，让色块之间有呼吸感（参考图中的窄卡片）
              className="min-w-0 px-[2px] py-[1.5px]"
              style={{
                gridColumn: block.weekday + 1,
                gridRow: `${firstBodyGridRow + startIdx} / ${firstBodyGridRow + endIdx + 1}`,
                zIndex: 10,
              }}
            >
              <button
                type="button"
                onClick={block.onClick}
                className={clsx(
                  'h-full w-full min-w-0 overflow-hidden rounded-md border-l-[3px] px-1 py-0.5 text-left leading-tight',
                  'text-[9px] sm:text-[10px]',
                  'transition-shadow hover:shadow-sm',
                  block.muted && 'opacity-50 line-through',
                  block.onClick ? 'cursor-pointer' : 'cursor-default',
                  block.className,
                )}
                style={block.style}
              >
                {block.content ?? block.label}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface LayoutRow {
  /** 节次号（1 起） */
  index: number
  label: string
  sub?: string
  /** 在本网格里的行序号（0 起，从表头下方第一行算） */
  gridIndex: number
  /** 行序号是否为奇数 —— 用于交替底色区分相邻节次（替代分割线） */
  striped: boolean
}

interface Layout {
  layoutRows: LayoutRow[]
  bodyGridRowCount: number
  /** 表头行数（星期行 + 日期行），正文从这里之后开始 */
  firstBodyGridRow: number
  /** 节次 → 行序号（0 起，从表头下方算）；缺失返回 null */
  rowOf: (periodIndex: number) => number | null
}

/**
 * 把节次列表转成网格行序列。
 *
 * 表头占 2 行（星期、日期），因此正文首行 = 3。
 * 所有格子都用同一套计算，所以节次轴、空白格、时间块必然对齐。
 */
function buildRows(rows: TimeGridRow[]): Layout {
  const layoutRows: LayoutRow[] = rows.map((row, i) => ({
    index: row.index,
    label: row.label,
    gridIndex: i,
    striped: i % 2 === 1,
    ...(row.sub ? { sub: row.sub } : {}),
  }))

  const map = new Map<number, number>()
  for (const r of layoutRows) map.set(r.index, r.gridIndex)

  const HEADER_ROWS = 2
  return {
    layoutRows,
    bodyGridRowCount: layoutRows.length,
    firstBodyGridRow: HEADER_ROWS + 1,
    rowOf: (periodIndex: number) => map.get(periodIndex) ?? null,
  }
}
