/**
 * 通用时间网格。
 *
 * **不是课表专用组件**：传入"列 + 行 + 块"即可渲染，课表与将来的日程视图共用
 * （docs/ARCHITECTURE.md 7.1）。
 *
 * 实现要点（这两条都是踩过坑之后定下来的）：
 *
 * 1. **左侧节次轴不做 `sticky`**，它就是普通的第 1 列网格项。
 *    之前给"表头 + 轴"那一整行加了 `sticky`，导致该行脱离原有网格行，
 *    把轴列挤出可视区 —— 表现就是"左侧 1-12 节不见了、整张表错乱"。
 *    表格首行改成只有 7 个列头、轴随每一行的节次各自渲染。
 * 2. **显式给出 `gridColumn` / `gridRow`**，不依赖 `grid-auto-flow` 的自动摆放。
 *    轴、空白格、时间块三者共用同一套行号计算，因此必然对齐。
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
  /**
   * 行副标题。含 `-` 时（如 `"08:00-08:45"`）会被**拆成两行**显示：
   * 轴列很窄，拆行比缩小字号更易读。
   */
  sub?: string
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
          // 轴列要放下「第 N 节」+ 开始 + 结束三行
          '--tg-axis': 'clamp(2.8rem, 13vw, 4.2rem)',
          '--tg-row-h': 'clamp(2.3rem, 7.8vw, 3.6rem)',
          '--tg-rows': bodyGridRowCount,
        } as CSSProperties
      }
    >
      <div className="grid" style={gridStyle}>
        {/* 表头：左上角空格 + 7 个列头。只有表头下方一条分隔线，列之间靠底色区分 */}
        <div
          className="border-b border-border bg-surface-alt"
          style={{ gridColumn: 1, gridRow: headerRow }}
        />
        {columns.map((col) => (
          <div
            key={`head-${col.weekday}`}
            className={clsx(
              'flex flex-col items-center justify-center gap-[1px] border-b border-border py-1.5',
              col.isToday ? 'bg-brand-soft' : 'bg-surface-alt',
            )}
            style={{ gridColumn: col.weekday + 1, gridRow: headerRow }}
          >
            <span
              className={clsx(
                'text-[12px] leading-tight sm:text-sm',
                col.isToday ? 'font-semibold text-brand' : 'font-medium text-ink',
              )}
            >
              {col.title}
            </span>
            {col.sub ? (
              <span className="text-[9px] leading-tight text-muted sm:text-[10px]">
                {col.sub.replace('-', '/')}
              </span>
            ) : null}
          </div>
        ))}

        {/* 行：左侧节次轴 + 7 天空白格。
            不使用分割线 —— 相邻节次靠**交替底色**区分，周与周之间靠"今日列"高亮区分。 */}
        {layoutRows.map((row) => {
          const gridRow = firstBodyGridRow + row.gridIndex
          const [startTime, endTime] = row.sub?.split('-') ?? []

          return (
            <div key={`row-${row.index}`} style={{ display: 'contents' }}>
              {/* 节次轴：三行 —— 节次 / 开始 / 结束。字号压到最小，避免被裁切。 */}
              <div
                className={clsx(
                  'flex flex-col items-center justify-center gap-[1px] px-0.5 text-center',
                  row.striped ? 'bg-surface-alt/70' : 'bg-surface-alt/40',
                )}
                style={{ gridColumn: 1, gridRow }}
              >
                <span className="text-[11px] font-semibold leading-none text-ink sm:text-xs">
                  {row.label}
                </span>
                {startTime ? (
                  <span className="text-[8px] leading-none text-muted sm:text-[10px]">
                    {startTime}
                  </span>
                ) : null}
                {endTime ? (
                  <span className="text-[8px] leading-none text-muted/80 sm:text-[10px]">
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
                    // 不画分割线：相邻节次靠交替底色区分
                    'transition-colors',
                    col.isToday
                      ? row.striped
                        ? 'bg-brand-soft/70'
                        : 'bg-brand-soft/50'
                      : row.striped
                        ? 'bg-surface-alt/60'
                        : 'bg-surface',
                    onCellClick && 'cursor-pointer hover:bg-brand-soft/80',
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
              className="min-w-0 p-[1.5px]"
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
                  'h-full w-full min-w-0 overflow-hidden rounded-md px-1 py-0.5 text-left leading-tight shadow-sm',
                  'text-[9px] ring-1 ring-inset ring-black/10 sm:text-[10px]',
                  'transition-all hover:shadow-md hover:ring-black/20',
                  block.muted
                    ? 'border border-dashed border-border bg-surface-alt text-muted line-through'
                    : 'text-white',
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
  /** 行序号是否为偶数 —— 用于交替底色分隔相邻节次（替代分割线） */
  striped: boolean
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
 * 把节次列表转成网格行序列。
 *
 * 返回的 `gridIndex` 是**表头下方**的行序号，实际 grid-row = gridIndex + 2
 * （第 1 行是表头，CSS 网格行号从 1 开始）。所有格子都用同一套计算，
 * 因此节次轴、空白格、时间块三者必然对齐。
 */
function buildRows(rows: TimeGridRow[]): Layout {
  const layoutRows: LayoutRow[] = rows.map((row, i) => ({
    index: row.index,
    label: row.label,
    gridIndex: i,
    // 隔行换底色，用来区分相邻两节（不再画横向分割线）
    striped: i % 2 === 1,
    ...(row.sub ? { sub: row.sub } : {}),
  }))

  const map = new Map<number, number>()
  for (const r of layoutRows) map.set(r.index, r.gridIndex)

  return {
    layoutRows,
    bodyGridRowCount: layoutRows.length,
    headerRow: 1,
    firstBodyGridRow: 2,
    rowOf: (periodIndex: number) => map.get(periodIndex) ?? null,
  }
}
