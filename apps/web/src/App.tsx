/**
 * 应用外壳：导航 + 当前模块渲染 + 全局提示。
 *
 * 外壳**不知道任何业务概念**——它只知道"有一组模块，选中一个渲染它"。
 * 这是"以后加很多功能而不用重构"的关键（ADR-005）。
 */
import { useState } from 'react'
import { MoonIcon, SettingsIcon, SunIcon } from '@jiwei/ui'
import { useJiwei } from './JiweiContext'
import { modules } from './modules'
import { useUiStore } from './store'
import { useTheme } from './lib/useTheme'
import { SettingsPage } from './shell/SettingsPage'

export function App() {
  const { activeModuleId, setActiveModuleId, toasts } = useUiStore()
  const { platform } = useJiwei()
  const theme = useTheme()
  const [showSettings, setShowSettings] = useState(false)

  const active = modules.find((m) => m.id === activeModuleId) ?? modules[0]
  if (!active) return null

  const ActivePage = active.render

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-3 py-2.5 sm:px-4">
          <div className="flex items-baseline gap-1.5">
            <span className="text-base font-semibold tracking-tight">几微</span>
            <span className="hidden text-[10px] text-muted sm:inline">jiwei</span>
          </div>

          <nav className="ml-2 flex items-center gap-1">
            {modules.map((m) => {
              const Icon = m.icon
              const isActive = m.id === active.id
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setActiveModuleId(m.id)}
                  className={
                    'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors ' +
                    (isActive
                      ? 'bg-brand-soft font-medium text-brand'
                      : 'text-muted hover:bg-surface-alt')
                  }
                >
                  <Icon className="h-3.5 w-3.5" />
                  {m.title}
                </button>
              )
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            {/* 未接入的能力如实置灰，而不是假装可用（docs/ALARM-STUDY.md） */}
            {!platform.capabilities.canAlarm ? (
              <span
                className="hidden cursor-help rounded-md bg-surface-alt px-2 py-1 text-[10px] text-muted sm:inline"
                title="浏览器无法在后台/锁屏时响铃。闹钟需要原生 App（见 docs/ALARM-STUDY.md）"
              >
                闹钟需原生 App
              </span>
            ) : null}
            <button
              type="button"
              aria-label="切换主题"
              className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-alt"
              onClick={theme.toggle}
            >
              {theme.effective === 'dark' ? (
                <SunIcon className="h-4 w-4" />
              ) : (
                <MoonIcon className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              aria-label="设置"
              className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-alt"
              onClick={() => setShowSettings(true)}
            >
              <SettingsIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main>
        <ActivePage />
      </main>

      {showSettings ? <SettingsPage onClose={() => setShowSettings(false)} /> : null}

      {/* 全局提示 */}
      <div className="pointer-events-none fixed bottom-20 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={
              'pointer-events-auto rounded-lg px-3 py-2 text-xs text-white shadow-lg ' +
              (t.kind === 'error' ? 'bg-danger' : t.kind === 'success' ? 'bg-brand' : 'bg-ink')
            }
          >
            {t.text}
          </div>
        ))}
      </div>
    </div>
  )
}
