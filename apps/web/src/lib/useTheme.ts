/** 主题切换：跟随系统 / 手动明暗。写入 `<html data-theme>`，CSS 变量随之生效。 */
import { useCallback, useEffect, useState } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'jiwei.theme'

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
}

function resolve(mode: ThemeMode): 'light' | 'dark' {
  return mode === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : mode
}

function apply(theme: 'light' | 'dark'): void {
  document.documentElement.dataset.theme = theme
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0f172a' : '#4f46e5')
}

function readStored(): ThemeMode {
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system'
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => readStored())

  useEffect(() => {
    apply(resolve(mode))
    localStorage.setItem(STORAGE_KEY, mode)

    if (mode !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (): void => apply(resolve('system'))
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [mode])

  const toggle = useCallback(() => {
    // 在"跟随系统"和它的反面之间切换，符合直觉
    setMode((m) => (resolve(m) === 'dark' ? 'light' : 'dark'))
  }, [])

  return { mode, setMode, toggle, effective: resolve(mode) }
}
