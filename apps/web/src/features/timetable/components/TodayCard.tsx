/**
 * 「今天 / 下一节」卡片。
 *
 * 为什么需要它：手机上周视图每列只有约 45px，看得到"哪节有课"但看不清"是什么课"。
 * 这张卡片用整行宽度回答最常用的一个问题：**我现在该去哪、下节课是什么**。
 */
import type { Occurrence } from '@jiwei/core'
import type { Block } from '@jiwei/core'
import { paletteForBlock } from '../../../lib/palette'
import { periodStartOf } from '../../../lib/weeks'

interface Props {
  /** 正在进行中的场次（可能同时有多门，例如合班） */
  ongoing: Occurrence[]
  /** 下一场（严格晚于当前时刻） */
  next: Occurrence | null
  blockById: Map<string, Block>
  onOpen: (block: Block) => void
}

export function TodayCard({ ongoing, next, blockById, onOpen }: Props) {
  // 正在上课：优先显示它；否则显示"下一节"
  const isOngoing = ongoing.length > 0
  const primary = isOngoing ? ongoing[0] : next

  if (!primary) {
    return (
      <div className="border-b border-border bg-surface px-3 py-2.5 text-center text-[12px] text-muted">
        今天没有课了
      </div>
    )
  }

  const block = blockById.get(primary.blockId)
  if (!block) return null

  const palette = paletteForBlock(block)
  const hhmm = (iso: string) => iso.slice(11, 16)
  const period = periodStartOf(primary.id)
  const extra = ongoing.length - 1

  return (
    <button
      type="button"
      className="flex w-full items-center gap-2.5 border-b border-border bg-surface px-3 py-2.5 text-left active:bg-surface-alt"
      onClick={() => onOpen(block)}
    >
      {/* 左侧：进行中 / 下一节 */}
      <span
        className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium"
        style={{ backgroundColor: palette.bg, color: palette.text }}
      >
        {isOngoing ? '进行中' : '下一节'}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span className="truncate text-[14px] font-semibold">{block.title}</span>
          {extra > 0 ? <span className="text-[11px] text-muted">等 {extra + 1} 门</span> : null}
        </span>
        <span className="block truncate text-[11px] text-muted">
          第 {period} 节 · {hhmm(primary.start)}-{hhmm(primary.end)}
          {block.detail?.location ? ` · ${block.detail.location}` : ''}
          {block.detail?.teacher ? ` · ${block.detail.teacher}` : ''}
        </span>
      </span>

      <span className="shrink-0 text-[11px] text-muted">
        {isOngoing ? '上课中' : relativeDay(primary.date)}
      </span>
    </button>
  )
}

/** 把日期说成"今天 / 明天 / 周三" */
function relativeDay(date: string): string {
  const today = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
  if (date === todayStr) return '今天'

  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`
  if (date === tomorrowStr) return '明天'

  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`
}
