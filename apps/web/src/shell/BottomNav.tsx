import { useEffect, useId, useRef, useState } from 'react'
import { GridIcon } from '@jiwei/ui'
import { useModules } from '../ModuleContext'
import { useUiStore } from '../store'
import { modules } from '../modules'
import type { ModuleId } from '@jiwei/data'
import { CloseButton } from './CloseButton'

/** 单一入口，按需展开已启用模块；由应用外壳统一挂载。 */
export function BottomNav({ activeId }: { activeId: ModuleId }) {
  const { isEnabled } = useModules()
  const { setActiveModuleId, setView } = useUiStore()
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const dialogId = useId()
  const enabled = modules.filter((module) => isEnabled(module.id as ModuleId))
  const current = modules.find((module) => module.id === activeId)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      dialog.querySelector<HTMLButtonElement>('[aria-current="page"]')?.focus()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  return (
    <>
      <nav aria-label="功能导航" className="shrink-0 border-t border-border bg-surface" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-2">
          <span className="text-xs text-muted">当前 · {current?.title}</span>
          <button
            type="button"
            aria-haspopup="dialog"
            aria-controls={dialogId}
            aria-expanded={open}
            className="flex min-h-[44px] items-center gap-2 rounded-xl bg-surface-alt px-4 text-sm font-semibold text-brand transition-colors hover:bg-brand/10"
            onClick={() => setOpen(true)}
          >
            <GridIcon className="h-5 w-5" />功能
          </button>
        </div>
      </nav>
      <dialog
        ref={dialogRef}
        id={dialogId}
        aria-labelledby={`${dialogId}-title`}
        className="module-picker"
        onClose={() => setOpen(false)}
        onClick={(event) => { if (event.target === event.currentTarget) setOpen(false) }}
      >
        <div className="module-picker-panel rounded-t-2xl border border-border bg-surface p-5 shadow-xl sm:rounded-2xl">
          <div className="sheet-scroll-header -mx-5 mb-4 flex items-center justify-between gap-3 px-5">
            <h2 id={`${dialogId}-title`} className="text-base font-semibold">已开启的功能</h2>
            <CloseButton onClose={() => setOpen(false)} />
          </div>
          <div className="module-picker-grid">
            {enabled.map((module) => (
              <button
                key={module.id}
                type="button"
                aria-current={module.id === activeId ? 'page' : undefined}
                className={'flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-xl border px-1.5 text-xs transition-all duration-200 hover:-translate-y-0.5 ' + (module.id === activeId ? 'border-brand bg-brand/10 font-semibold text-brand shadow-sm' : 'border-border bg-surface-alt text-ink hover:bg-brand/5')}
                onClick={() => {
                  setOpen(false)
                  if (module.id === activeId) return
                  setActiveModuleId(module.id)
                  if (module.id === 'today' || module.id === 'timetable') setView(module.id)
                }}
              >
                <module.icon className="h-6 w-6" />
                {module.title}
              </button>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted">在设置中开启或关闭功能。</p>
        </div>
      </dialog>
    </>
  )
}
