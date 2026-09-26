/**
 * 通用时间网格。
 *
 * **不是课表专用组件**：传入"列 + 行 + 块"即可渲染，课表与将来的日程视图共用
 * （docs/ARCHITECTURE.md 7.1）。
 *
 * 实现要点（这两条都是踩过坑之后定下来的）：
 *
 * 1. **每个格子都直接是网格项**，不用 `display: contents` 做中间包裹。
 *    `display: contents` 下的显式 `grid-column/grid-row` 在部分浏览器里定位不可靠，
 *    会导致整张表错位。
 * 2. **左侧节次轴不做 sticky**，它就是普通的第 1 列网格项。
 *    之前给表头加 `sticky` 会让它脱离原有网格行、把轴列挤走。
 *
 * 响应式：列宽用 `minmax(0, 1fr)`，**手机上 7 天全部塞进一屏、不需要横向滑动**；
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
  /** 行标题，例如 "1" */
  label: string
  /** 行副标题，例如 "08:00" */
  sub?: string
  /** 分组头：到这里插入一行分组标题（如"上午"） */
  group?: string
}

export interface TimeGridColumn {
  /** 1-7 */
  weekday: number
  /** 列头主标题，例如 "周一" */
  title: string
  /** 列头副标题，例如 "09-22" */
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
  const { layoutRows, rowOf, headerRow, firstBodyGridRow, bodyGridRowCount } = buildRows(rows)

  const gridStyle: CSSProperties = {
    // 轴列随屏宽收缩：手机 2.25rem，桌面 3.5rem
    gridTemplateColumns: 'var(--tg-axis) repeat(7, minmax(0, 1fr))',
    gridTemplateRows: rowHeight
      ? `auto repeat(${bodyGridRowCount}, ${rowHeight}px)`
      : 'auto repeat(var(--tg-rows), var(--tg-row-h))',
  }

  return (
    <div
      className={clsx('tg-root overflow-hidden', className)}
      style={
        {
          '--tg-axis': 'clamp(2.1rem, 9vw, 3.5rem)',
          '--tg-row-h': 'clamp(2.15rem, 7.2vw, 3.5rem)',
          '--tg-rows': bodyGridRowCount,
        } as CSSProperties
      }
    >
      <div className="grid" style={gridStyle}>
        {/* 表头：左上角空格 + 7 个列头 */}
        <div
          className="border-b border-border bg-surface"
          style={{ gridColumn: 1, gridRow: headerRow }}
        />
        {columns.map((col) => (
          <div
            key={`head-${col.weekday}`}
            className={clsx(
              'flex flex-col items-center justify-center border-b border-l border-border bg-surface py-1',
              col.isToday && 'bg-brand-soft/50',
            )}
            style={{ gridColumn: col.weekday + 1, gridRow: headerRow }}
          >
            <span
              className={clsx(
                'text-[11px] leading-tight sm:text-xs',
                col.isToday ? 'font-semibold text-brand' : 'text-ink',
              )}
            >
              {col.title}
            </span>
            {col.sub ? (
              <span className="text-[9px] leading-tight text-muted sm:text-[10px]">{col.sub}</span>
            ) : null}
          </div>
        ))}

        {/* 行：左侧节次轴 + 7 天空白格 */}
        {layoutRows.map((row) => {
          const gridRow = firstBodyGridRow + row.gridIndex

          if (row.kind === 'group') {
            return (
              <div
                key={`group-${row.index}-${row.label}`}
                className="flex items-center border-b border-border bg-surface-alt/70 px-1.5"
                style={{ gridColumn: '1 / -1', gridRow }}
              >
                <span className="text-[10px] font-medium text-muted">{row.label}</span>
              </div>
            )
          }

          return (
            <div key={`row-${row.index}`} style={{ display: 'contents' }}>
              {/* 节次轴：普通网格项，不做 sticky */}
              <div
                className="flex flex-col items-center justify-center border-b border-border/70 bg-surface-alt/40 text-muted"
                style={{ gridColumn: 1, gridRow }}
              >
                <span className="text-[10px] leading-none sm:text-[11px]">{row.label}</span>
                {row.sub ? (
                  <span className="mt-0.5 text-[8px] leading-none sm:text-[9px]">{row.sub}</span>
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
                    'border-b border-l border-border/70 bg-surface transition-colors',
                    onCellClick && 'cursor-pointer hover:bg-surface-alt',
                    col.isToday && 'bg-brand-soft/25',
                  )}
                  style={{ gridColumn: col.weekday + 1, gridRow }}
                />
              ))}
            </div>
          )
        })}

        {/* 时间块：靠 grid-row 跨节，不需要测量像素高度 */}
        {blocks.map((block) => {
          const startIdx = rowOf(block.periodStart)
          const endIdx = rowOf(block.periodEnd)
          if (startIdx === null || endIdx === null) return null
          return (
            <div
              key={block.id}
              className="min-w-0 p-[1px]"
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
                  'h-full w-full min-w-0 overflow-hidden rounded px-0.5 py-0.5 text-left leading-tight sm:px-1',
                  'text-[9px] sm:text-[10px]',
                  block.muted
                    ? 'border border-dashed border-border bg-surface-alt text-muted line-through'
                    : 'border border-transparent text-white shadow-sm',
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
  kind: 'period' | 'group'
  /** 节次号；group 行为 -1 */
  index: number
  label: string
  sub?: string
  /** 在本网格里的行序号（0 起，从表头下方第一行算） */
  gridIndex: number
}

interface Layout {
  layoutRows: LayoutRow[]
  bodyGridRowCount: number
  headerRow: number
  firstBodyGridRow: number
  /** 节次 → 行序号（0 起，从表头下方算）；缺失返回 null */
  rowOf: (periodIndex: number) => number | null
}

/**
 * 把"节次列表（可含分组）"转成网格行序列。
 *
 * 返回的 `gridIndex` 是**表头下方**的行序号，实际 grid-row = gridIndex + 2
 * （第 1 行是表头，CSS 网格行号从 1 开始）。所有格子都用同一套计算，
 * 因此左侧轴、空白格、时间块三者必然对齐。
 */
function buildRows(rows: TimeGridRow[]): Layout {
  const layoutRows: LayoutRow[] = []
  const periodRowMap = new Map<number, number>()
  let lastGroup: string | undefined

  for (const row of rows) {
    if (row.group && row.group !== lastGroup) {
      layoutRows.push({
        kind: 'group',
        index: -1,
        label: row.group,
        gridIndex: layoutRows.length,
      })
      lastGroup = row.group
    }
    periodRowMap.set(row.index, layoutRows.length)
    layoutRows.push({
      kind: 'period',
      index: row.index,
      label: row.label,
      gridIndex: layoutRows.length,
      ...(row.sub ? { sub: row.sub } : {}),
    })
  }

  return {
    layoutRows,
    bodyGridRowCount: layoutRows.length,
    headerRow: 1,
    firstBodyGridRow: 2,
    rowOf: (periodIndex: number) => periodRowMap.get(periodIndex) ?? null,
  }
}
