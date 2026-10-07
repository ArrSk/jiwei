import { useState } from 'react'
import { useJiwei } from '../JiweiContext'
import { useUiStore } from '../store'
import { loadAllDemoData, loadDemoAgenda, loadDemoCourses, loadDemoTasks } from '../lib/demoData'

export function DemoImportButton({ scope, label = '导入示例' }: { scope: 'all' | 'timetable' | 'agenda' | 'tasks'; label?: string }) {
  const { repos, refresh } = useJiwei()
  const { toast, semester } = useUiStore()
  const [busy, setBusy] = useState(false)
  async function load(): Promise<void> {
    if (busy) return
    setBusy(true)
    try {
      const count = scope === 'agenda' ? await loadDemoAgenda(repos)
        : scope === 'tasks' ? await loadDemoTasks(repos)
          : scope === 'timetable' ? await loadDemoCourses(repos, semester?.id)
            : await loadAllDemoData(repos, semester?.id)
      refresh()
      toast(count ? `已导入 ${count} 条示例，可自由编辑或删除` : '示例已存在，无需重复导入', 'success')
    } catch (error) {
      refresh()
      toast(`示例导入未完成，可重试：${error instanceof Error ? error.message : '请稍后重试'}`, 'error')
    } finally { setBusy(false) }
  }
  return <button type="button" disabled={busy} onClick={() => void load()} className="min-h-[44px] shrink-0 rounded-lg px-2 text-xs text-brand transition-colors hover:bg-surface-alt disabled:opacity-50">{busy ? '导入中…' : label}</button>
}
