/**
 * 应用外壳。
 *
 * 职责被刻意压到最小：**只负责"当前模块是什么、渲染它、显示全局提示"**。
 * 具体页面的顶部控制栏与底部页签由各模块自己排布（见 `features/timetable`），
 * 因为不同功能顶部要放的东西完全不同，塞进外壳会让外壳越来越像业务代码。
 *
 * 布局约束：整页高度锁死（`h-dvh` + flex），**只有模块内部的内容区滚动**，
 * 这样底部页签才能始终固定在屏幕底部。
 */
import { MoonIcon, SunIcon } from '@jiwei/ui'
import { useJiwei } from './JiweiContext'
import { modules } from './modules'
import { useUiStore } from './store'
import { useTheme } from './lib/useTheme'

export function App() {
  const { activeModuleId, toasts } = useUiStore()
  const { platform } = useJiwei()
  const theme = useTheme()

  const active = modules.find((m) => m.id === activeModuleId) ?? modules[0]
  if (!active) return null

  const ActivePage = active.render

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-canvas">
      {/* 悬浮的主题切换按钮：不占布局高度，避免把课表的顶部空间挤掉 */}
      <div className="pointer-events-none fixed right-2 top-2 z-40 flex items-center gap-1">
        {!platform.capabilities.canAlarm ? (
          <span
            className="pointer-events-auto hidden cursor-help rounded-md bg-surface-alt px-2 py-1 text-[10px] text-muted sm:inline"
            title="浏览器无法在后台/锁屏时响铃。闹钟需要原生 App（见 docs/ALARM-STUDY.md）"
          >
            闹钟需原生 App
          </span>
        ) : null}
        <button
          type="button"
          aria-label="切换深色模式"
          className="pointer-events-auto grid h-9 w-9 place-items-center rounded-lg bg-surface/80 text-muted shadow-sm backdrop-blur hover:bg-surface-alt"
          onClick={theme.toggle}
        >
          {theme.effective === 'dark' ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
        </button>
      </div>

      {/* 模块占满剩余高度；模块内部自行决定哪里滚动 */}
      <main className="min-h-0 flex-1">
        <ActivePage />
      </main>

      {/* 全局提示 */}
      <div className="pointer-events-none fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
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
