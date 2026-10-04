import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { defaultAppearance, loadAppearance, saveAppearance, type Appearance } from '@jiwei/data'
import { useJiwei } from '../JiweiContext'
import { useUiStore } from '../store'

interface AppearanceState {
  value: Appearance
  ready: boolean
  saving: boolean
  save: (value: Appearance) => Promise<void>
}
const Context = createContext<AppearanceState | null>(null)

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const { repos, dataVersion } = useJiwei()
  const [value, setValue] = useState(defaultAppearance)
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const toast = useUiStore((state) => state.toast)

  useEffect(() => {
    let alive = true
    setReady(false)
    void loadAppearance(repos).then((appearance) => {
      if (!alive) return
      setValue(appearance)
      setReady(true)
    }).catch(() => {
      if (alive) toast('显示设置读取失败，请重新打开应用后再试', 'error')
    })
    return () => { alive = false }
  }, [repos, dataVersion, toast])

  useEffect(() => {
    document.documentElement.dataset.readingSize = value.readingSize
    document.documentElement.dataset.density = value.density
  }, [value])

  async function save(next: Appearance) {
    if (!ready || saving) return
    setSaving(true)
    try {
      await saveAppearance(repos, next)
      setValue(next)
    } catch {
      toast('显示设置保存失败，原来的设置已保留', 'error')
    } finally {
      setSaving(false)
    }
  }

  return <Context.Provider value={{ value, ready, saving, save }}>{children}</Context.Provider>
}

export function useAppearance() {
  const context = useContext(Context)
  if (!context) throw new Error('useAppearance 必须在 AppearanceProvider 内使用')
  return context
}
