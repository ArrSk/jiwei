/**
 * 几微运行时上下文：把仓储与平台能力传给各个模块。
 *
 * 模块通过 `useJiwei()` 取得 `repos` / `platform` / `refresh()`，
 * **不允许**自己 import Dexie 或 platform 的具体实现（ADR-005 / ADR-007）。
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { initJiwei, type JiweiRuntime } from './bootstrap'

interface JiweiContextValue extends JiweiRuntime {
  /** 数据变更后调用：重建 Occurrence 并通知所有查询刷新 */
  refresh: () => Promise<void>
  /** 每次 refresh / reload 变化，作为查询的依赖键 */
  dataVersion: number
}

const JiweiContext = createContext<JiweiContextValue | null>(null)

export function JiweiProvider({ children }: { children: ReactNode }) {
  const [runtime, setRuntime] = useState<JiweiRuntime | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [dataVersion, setDataVersion] = useState(0)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    setError(null)
    initJiwei()
      .then((rt) => {
        if (alive) setRuntime(rt)
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err : new Error(String(err)))
      })
    return () => {
      alive = false
    }
  }, [attempt])

  const value = useMemo<JiweiContextValue | null>(() => {
    if (!runtime) return null
    return {
      ...runtime,
      dataVersion,
      async refresh() {
        setDataVersion((v) => v + 1)
      },
    }
  }, [runtime, dataVersion])

  if (error) {
    return (
      <div className="mx-auto max-w-md p-6 text-sm">
        <h1 className="mb-2 text-base font-semibold text-danger">本地存储打开失败</h1>
        <p className="mb-3 text-muted">
          几微把数据存在浏览器本地（IndexedDB）。当前环境可能处在无痕模式或禁用了本地存储。
        </p>
        <pre className="mb-3 overflow-x-auto rounded-md bg-surface-alt p-2 text-xs">
          {error.message}
        </pre>
        <button
          type="button"
          className="rounded-md bg-brand px-3 py-1.5 text-white"
          onClick={() => {
            setRuntime(null)
            setAttempt((a) => a + 1)
          }}
        >
          重试
        </button>
      </div>
    )
  }

  if (!value) {
    return (
      <div className="flex h-dvh items-center justify-center text-sm text-muted">
        正在准备本地数据…
      </div>
    )
  }

  return <JiweiContext.Provider value={value}>{children}</JiweiContext.Provider>
}

export function useJiwei(): JiweiContextValue {
  const ctx = useContext(JiweiContext)
  if (!ctx) throw new Error('useJiwei 必须在 <JiweiProvider> 内使用')
  return ctx
}
