import { useEffect, useState } from 'react'
import { type Block, type Occurrence, type Semester } from '@jiwei/core'
import { useJiwei } from '../../JiweiContext'
import { useUiStore } from '../../store'
import { useModules } from '../../ModuleContext'
import { DemoImportButton } from '../../shell/DemoImportButton'
import { InstallHelpSheet } from '../../shell/InstallGuide'
import { TodayOverview } from '../../shared/TodayOverview'

export function TodayPage() {
  const { repos, platform, dataVersion } = useJiwei()
  const { setActiveModuleId, setView, semester, setSemester } = useUiStore()
  const { isEnabled } = useModules()
  const [blocks, setBlocks] = useState<Block[]>([])
  const [agendaBlocks, setAgendaBlocks] = useState<Block[]>([])
  const [occurrences, setOccurrences] = useState<Occurrence[]>([])
  const [activeSemester, setActiveSemester] = useState<Semester | null>(null)
  const [loading, setLoading] = useState(true)
  const [installHelpOpen, setInstallHelpOpen] = useState(false)

  useEffect(() => {
    let alive = true
    void (async () => {
      const list = await repos.semesters.list()
      const current = semester ?? (await repos.semesters.active()) ?? list[0] ?? null
      const [courses, occ, events, exams, tasks] = await Promise.all([
        current ? repos.blocks.listBySemester(current.id) : Promise.resolve([]),
        current ? repos.occurrences.listBySemester(current.id) : Promise.resolve([]),
        repos.blocks.listByKind('event'),
        repos.blocks.listByKind('exam'),
        repos.blocks.listByKind('task'),
      ])
      if (!alive) return
      if (!semester && current) setSemester(current)
      setActiveSemester(current)
      setBlocks(courses)
      setOccurrences(occ)
      setAgendaBlocks([...events, ...exams, ...tasks])
      setLoading(false)
    })()
    return () => { alive = false }
  }, [repos, semester, setSemester, dataVersion])

  if (loading) return <div className="p-6 text-sm text-muted">正在读取今天…</div>

  return (
    <div className="reading-view flex h-full flex-col bg-canvas">
      <header className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-3 py-2.5"><span className="w-16" aria-hidden="true" /><h1 className="text-[15px] font-semibold">今天</h1><DemoImportButton scope="all" /></header>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <TodayOverview
          semester={activeSemester}
          occurrences={occurrences}
          blocks={blocks}
          agendaBlocks={agendaBlocks}
          showTimetable={isEnabled('timetable')}
          showAgenda={isEnabled('agenda')}
          showTasks={isEnabled('tasks')}
          app={platform.app}
          onOpen={() => { setActiveModuleId('timetable'); setView('timetable') }}
          onAdjust={() => { setActiveModuleId('timetable'); setView('timetable') }}
          onGoTimetable={() => { setActiveModuleId('timetable'); setView('timetable') }}
          onGoAgenda={() => setActiveModuleId('agenda')}
          onGoTasks={() => setActiveModuleId('tasks')}
          onInstall={() => setInstallHelpOpen(true)}
        />
      </main>
      {installHelpOpen ? <InstallHelpSheet onClose={() => setInstallHelpOpen(false)} /> : null}
    </div>
  )
}
