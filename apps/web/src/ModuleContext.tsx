import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  loadModulePreferences,
  saveModulePreferences,
  type ModuleId,
  type ModulePreferences,
} from '@jiwei/data'
import { useJiwei } from './JiweiContext'

interface ModuleContextValue {
  preferences: ModulePreferences
  ready: boolean
  isEnabled: (id: ModuleId) => boolean
  setEnabled: (id: ModuleId, enabled: boolean) => Promise<void>
}

const ModuleContext = createContext<ModuleContextValue | null>(null)

export function ModuleProvider({ children }: { children: ReactNode }) {
  const { repos, dataVersion } = useJiwei()
  const [preferences, setPreferences] = useState<ModulePreferences | null>(null)

  useEffect(() => {
    let alive = true
    void loadModulePreferences(repos).then((value) => {
      if (alive) setPreferences(value)
    })
    return () => {
      alive = false
    }
  }, [repos, dataVersion])

  const value = useMemo<ModuleContextValue>(() => {
    const current = preferences ?? {
      today: true,
      timetable: true,
      agenda: true,
      tasks: true,
      ledger: false,
      notes: false,
      assistant: false,
      settings: true,
    }
    return {
      preferences: current,
      ready: preferences !== null,
      isEnabled: (id) => current[id],
      async setEnabled(id, enabled) {
        const next = { ...current, [id]: id === 'settings' ? true : enabled }
        setPreferences(next)
        await saveModulePreferences(repos, next)
      },
    }
  }, [preferences, repos])

  return <ModuleContext.Provider value={value}>{children}</ModuleContext.Provider>
}

export function useModules(): ModuleContextValue {
  const value = useContext(ModuleContext)
  if (!value) throw new Error('useModules 必须在 <ModuleProvider> 内使用')
  return value
}
