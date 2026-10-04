/** 首页：把今天最需要看的信息放在一起。 */
import { useEffect, useState } from 'react'
import {
  allOccurrencesOnDate,
  currentWeek,
  isOccurrenceActive,
  nextOccurrence,
  nowIso,
  ongoingOccurrences,
  today,
  WEEKDAY_LABELS,
  weekdayOf,
  type Block,
  type Occurrence,
  type Semester,
} from '@jiwei/core'
import type { AppAdapter } from '@jiwei/platform'
import { DayView } from './DayView'
import { TodayCard } from './TodayCard'

interface Props {
  semester: Semester | null
  occurrences: Occurrence[]
  blocks: Block[]
  app: AppAdapter
  onOpen: (block: Block) => void
  onAdjust: (block: Block, occurrence: Occurrence) => void
  onGoTimetable: () => void
  onInstall: () => void
}

export function TodayOverview({
  semester,
  occurrences,
  blocks,
  app,
  onOpen,
  onAdjust,
  onGoTimetable,
  onInstall,
}: Props) {
  const [, rerender] = useState(0)
  useEffect(() => app.subscribe(() => rerender((value) => value + 1)), [app])

  const todayStr = today()
  const blockById = new Map(blocks.map((block) => [block.id, block]))
  const online = app.isOnline()
  const installed = app.isInstalled()

  if (!semester) {
    return (
      <div className="reading-view space-y-3 p-3">
        <StatusBanner online={online} installed={installed} onInstall={onInstall} />
        <div className="rounded-xl border border-dashed border-border bg-surface p-6 text-center">
          <p className="text-sm font-medium">先建一张课表</p>
          <p className="mt-1 text-xs text-muted">建好后，首页会自动显示今天的课程。</p>
          <button type="button" className="mt-3 rounded-lg bg-brand px-3 py-2 text-xs text-white" onClick={onGoTimetable}>
            去课程表设置
          </button>
        </div>
      </div>
    )
  }

  const week = currentWeek(semester, todayStr)
  const inSemester = week >= 1 && week <= semester.totalWeeks
  const dayOccurrences = inSemester
    ? allOccurrencesOnDate(occurrences, todayStr)
    : []
  const activeToday = dayOccurrences.filter(isOccurrenceActive)
  const now = nowIso()
  const ongoing = ongoingOccurrences(activeToday, now)
  const next = nextOccurrence(activeToday, now)
  const weekday = weekdayOf(todayStr)

  return (
    <div className="reading-view space-y-3 p-3">
      <StatusBanner online={online} installed={installed} onInstall={onInstall} />
      <header className="rounded-xl bg-surface px-3 py-3 shadow-sm">
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-[12px] text-muted">今天 · 周{WEEKDAY_LABELS[weekday - 1]}</p>
            <h1 className="mt-0.5 text-2xl font-semibold">{Number(todayStr.slice(5, 7))}月{Number(todayStr.slice(8, 10))}日</h1>
          </div>
          <span className="text-right text-[11px] text-muted">
            {inSemester ? `第 ${week} 周 · ${semester.name}` : '当前不在本学期内'}
          </span>
        </div>
      </header>

      {!inSemester ? (
        <div className="rounded-xl border border-border bg-surface p-5 text-center text-sm text-muted">
          今天不在「{semester.name}」的上课范围内。
          <button type="button" className="ml-1 text-brand" onClick={onGoTimetable}>查看课表</button>
        </div>
      ) : (
        <>
          <TodayCard ongoing={ongoing} next={next} blockById={blockById} onOpen={onOpen} />
          <section className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <h2 className="text-sm font-medium">今天的全部课程</h2>
              <span className="text-[11px] text-muted">{activeToday.length} 节</span>
            </div>
            <DayView
              occurrences={dayOccurrences}
              blockById={blockById}
              date={todayStr}
              isToday
              onOpen={onOpen}
              onAdjust={onAdjust}
            />
          </section>
        </>
      )}
    </div>
  )
}

function StatusBanner({ online, installed, onInstall }: { online: boolean; installed: boolean; onInstall: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-alt px-3 py-2 text-[11px] text-muted">
      <span className="min-w-0">{online ? '已连接 · 数据保存在本机' : '当前离线 · 仍可查看已保存的课表'}</span>
      {!installed ? (
        <button type="button" className="min-h-[44px] shrink-0 rounded-md px-2 text-brand" onClick={onInstall}>安装到桌面</button>
      ) : (
        <span>已从桌面打开</span>
      )}
    </div>
  )
}
