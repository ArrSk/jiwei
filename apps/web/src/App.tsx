/**
 * 应用外壳。
 *
 * 职责被刻意压到最小：**只负责"当前模块是什么、渲染它、显示全局提示"**。
 * 具体页面管理业务控件，外壳统一管理功能导航和页面过渡。
 *
 * 布局约束：整页高度锁死（`h-dvh` + flex），**只有模块内部的内容区滚动**，
 * 这样底部页签才能始终固定在屏幕底部。
 *
 * 主题：**跟随系统**，不提供手动切换入口（`useTheme` 仍会读取系统偏好并应用）。
 */
import { useJiwei } from './JiweiContext'
import { modules } from './modules'
import { useUiStore } from './store'
import { useTheme } from './lib/useTheme'
import { useModules } from './ModuleContext'
import type { ModuleId } from '@jiwei/data'
import { BottomNav } from './shell/BottomNav'

export function App() {
  const { activeModuleId, toasts } = useUiStore()
  const { platform } = useJiwei()
  const { isEnabled } = useModules()
  // 只应用系统主题，不再渲染切换按钮
  useTheme()

  const active = modules.find((m) => m.id === activeModuleId && isEnabled(m.id as ModuleId))
    ?? modules.find((m) => isEnabled(m.id as ModuleId))
    ?? modules.find((m) => m.id === 'settings')
    ?? modules[0]
  if (!active) return null

  const ActivePage = active.render

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-canvas">
      {/*
        "闹钟需原生 App" 的说明做成悬浮小标签：不占布局高度，
        也不会把课表顶部的空间挤掉（docs/research/ALARM-STUDY.md）。
      */}
      {!platform.capabilities.canAlarm ? (
        <span
          className="pointer-events-none fixed left-2 top-2 z-40 hidden cursor-help rounded-md bg-surface-alt/90 px-2 py-1 text-[10px] text-muted backdrop-blur sm:inline"
          title="浏览器无法在后台/锁屏时响铃。闹钟需要原生 App（见 docs/research/ALARM-STUDY.md）"
        >
          闹钟需原生 App
        </span>
      ) : null}

      {/* 模块占满剩余高度；模块内部自行决定哪里滚动 */}
      <main key={active.id} className="module-page min-h-0 flex-1">
        <ActivePage />
      </main>
      <BottomNav activeId={active.id as ModuleId} />

      {/* 全局提示：抬到底部页签之上，避免被遮住 */}
      <div className="pointer-events-none fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2 sm:bottom-6">
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
