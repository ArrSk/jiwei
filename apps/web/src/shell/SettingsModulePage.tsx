import { useUiStore } from '../store'
import { SettingsPage } from './SettingsPage'

export function SettingsModulePage() {
  const { setActiveModuleId } = useUiStore()
  return (
    <div className="flex h-full flex-col bg-canvas">
      <main className="min-h-0 flex-1">
        <SettingsPage
          mode="page"
          onClose={() => setActiveModuleId('today')}
          onOpenTimetableSettings={() => setActiveModuleId('timetable')}
        />
      </main>
    </div>
  )
}
