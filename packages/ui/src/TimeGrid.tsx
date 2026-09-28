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
  /**
   * 左上角格子的内容（那一列是节次轴）。
   * 课表在这里放「月份」，于是整条表头与网格天然对齐。
   */
  corner?: ReactNode
  /** 是否在顶部显示星期/日期表头（默认显示） */
  showHeader?: boolean
  className?: string
}

export function TimeGrid({
  rows,
  columns,
  blocks,
  onCellClick,
  rowHeight,
  corner,
  showHeader = true,
  className,
}: TimeGridProps) {
  const { layoutRows, rowOf, bodyGridRowCount } = buildRows(rows)

  /** 表头占一行（显示时）；正文行号相应后移 */
  const bodyOffset = showHeader ? 1 : 0

  const gridStyle: CSSProperties = {
    // 轴列随屏宽收缩：手机 2.25rem，桌面 3.5rem
    gridTemplateColumns: 'var(--tg-axis) repeat(7, minmax(0, 1fr))',
    gridTemplateRows: `${showHeader ? 'auto ' : ''}${
      rowHeight ? `repeat(${bodyGridRowCount}, ${rowHeight}px)` : 'repeat(var(--tg-rows), var(--tg-row-h))'
    }`,
  }

  return (
    <div
      className={clsx('tg-root tg-grid overflow-hidden', className)}
      style={
        {
          // 轴列要放下「1 / 08:00 / 08:45」三行
          '--tg-axis': 'clamp(2.7rem, 13vw, 3.7rem)',
          // 行高：给换行的课程名留出空间，同时保证相邻两节仍有区分度
          '--tg-row-h': 'clamp(3rem, 10.5vw, 4.2rem)',
          '--tg-rows': bodyGridRowCount,
        } as CSSProperties
      }
    >
      <div className="grid" style={gridStyle}>
        {/*
          表头**由本组件渲染在网格的第一行**（而不是让宿主另外画一条）。
          这样它天然与列对齐、也不可能重复；宿主要放的额外内容（月份）走 `corner`。
          早期是宿主自己画表头，这里又画了一条 —— 通栏铺满后重复非常明显。
        */}
        {showHeader ? (
          <>
            <div
              className="sticky top-0 z-30 flex items-center justify-center bg-surface-alt"
              style={{ gridColumn: 1, gridRow: 1 }}
            >
              {corner}
            </div>
            {columns.map((col) => (
              <div
                key={`head-${col.weekday}`}
                className="sticky top-0 z-30 flex items-center justify-center bg-surface-alt px-0.5 py-1"
                style={{ gridColumn: col.weekday + 1, gridRow: 1 }}
              >
                {/* 今日整块填主题色 + 白字，比"只给日期上色"醒目得多 */}
                <div
                  className={clsx(
                    'flex w-full flex-col items-center justify-center rounded-lg py-0.5 leading-tight',
                    col.isToday && 'bg-brand text-white',
                  )}
                >
                  <span
                    className={clsx(
                      'text-[15px] leading-tight font-semibold',
                      col.isToday ? 'text-white' : 'text-ink',
                    )}
                  >
                    {col.title}
                  </span>
                  {col.sub ? (
                    <span
                      className={clsx(
                        'text-[11px] leading-tight',
                        col.isToday ? 'text-white/85' : 'text-muted',
                      )}
                    >
                      {col.sub}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </>
        ) : null}

        {/* 行：左侧节次轴 + 7 天空白格。
            分割方式：**只有横向的淡线，没有竖线**（列与列靠留白区分，与示例一致）。 */}
        {layoutRows.map((row) => {
          const gridRow = row.gridIndex + 1 + bodyOffset
          const [startTime, endTime] = row.sub?.split('-') ?? []

          return (
            <div key={`row-${row.index}`} style={{ display: 'contents' }}>
              {/* 节次轴：节次号醒目、起止时间小字辅助 */}
              <div
                className="tg-cell flex flex-col items-center justify-center gap-[1px] text-muted"
                style={{ gridColumn: 1, gridRow }}
              >
                <span className="text-[13px] font-semibold leading-none text-ink">{row.label}</span>
                {startTime ? (
                  <span className="text-[10px] leading-tight sm:text-[10px]">{startTime}</span>
                ) : null}
                {endTime ? (
                  <span className="text-[10px] leading-tight sm:text-[10px]">{endTime}</span>
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
                    // 只有横向淡线，没有竖线；今日那一列轻微着色
                    'tg-cell border-t border-border',
                    col.isToday && 'tg-cell--today',
                    onCellClick && 'tg-cell--interactive cursor-pointer',
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
              // 内边距 2px：卡片之间留出细缝，与示例的 `margin: 2px` 一致
              className="min-w-0 p-[2px]"
              style={{
                gridColumn: block.weekday + 1,
                gridRow: `${startIdx + 1 + bodyOffset} / ${endIdx + 2 + bodyOffset}`,
                zIndex: 10,
              }}
            >
              <button
                type="button"
                onClick={block.onClick}
                className={clsx(
                  // 注意：**不加 truncate**。课程名要换行完整显示，
                  // 截断成"高等数…"在手机上是不可接受的（内容比整齐更重要）。
                  // 观感对齐示例：圆角 10px、无描边、无阴影，纯色块。
                  'flex h-full w-full min-w-0 flex-col gap-[2px] overflow-hidden rounded-[10px] px-[5px] py-[5px] text-left',
                  // 手机上每列约 45px，11px 中文每行约 4 字；行高收紧以多容纳一行
                  'text-[11px] leading-[1.35] sm:text-[12px]',
                  '[overflow-wrap:anywhere]', // 超长英文名也强制断行，不撑破色块
                  block.muted && 'opacity-45 grayscale',
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
  /** 在本网格里的行序号（0 起） */
  gridIndex: number
}

interface Layout {
  layoutRows: LayoutRow[]
  bodyGridRowCount: number
  /** 节次 → 行序号（0 起）；缺失返回 null */
  rowOf: (periodIndex: number) => number | null
}

/**
 * 把节次列表转成网格行序列。
 *
 * 没有表头行，所以 `gridIndex` 就是网格行号减一（CSS 网格行号从 1 开始）。
 * 节次轴、空白格、时间块共用同一套计算，因此必然对齐。
 */
function buildRows(rows: TimeGridRow[]): Layout {
  const layoutRows: LayoutRow[] = rows.map((row, i) => ({
    index: row.index,
    label: row.label,
    gridIndex: i,
    ...(row.sub ? { sub: row.sub } : {}),
  }))

  const map = new Map<number, number>()
  for (const r of layoutRows) map.set(r.index, r.gridIndex)

  return {
    layoutRows,
    bodyGridRowCount: layoutRows.length,
    rowOf: (periodIndex: number) => map.get(periodIndex) ?? null,
  }
}
