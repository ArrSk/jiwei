/**
 * 作息时间设置。
 *
 * 用户看到的是「一节多久 / 课间多久 / 上午几点开始 / 各段几节」这几个**配方参数**，
 * 而不是 12 组起止时间 —— 改一个参数，整张作息表连带课表一起重排。
 *
 * 右侧（小屏为下方）实时预览生成结果，用户改完立刻能看到"到底是几点上课"。
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  buildPeriodsFromConfig,
  defaultScheduleConfig,
  type ScheduleConfig,
  type Semester,
} from '@jiwei/core'
import { applyScheduleConfig, loadScheduleConfig } from '@jiwei/data'
import { useJiwei } from '../JiweiContext'
import { useUiStore } from '../store'

interface Props {
  semester: Semester
}

const PERIOD_PRESETS = [40, 45, 50]
const BREAK_PRESETS = [0, 5, 10, 15]

export function ScheduleSettings({ semester }: Props) {
  const { repos, refresh } = useJiwei()
  const toast = useUiStore((s) => s.toast)
  const [config, setConfig] = useState<ScheduleConfig>(() => defaultScheduleConfig())
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    let alive = true
    void (async () => {
      const cfg = await loadScheduleConfig(repos)
      if (!alive) return
      setConfig(cfg)
      setLoaded(true)
    })()
    return () => {
      alive = false
    }
  }, [repos])

  // 实时预览：与保存后落库的是同一个纯函数，因此"所见即所得"
  const preview = useMemo(() => buildPeriodsFromConfig(semester.id, config), [semester.id, config])

  function patch(part: Partial<ScheduleConfig>): void {
    setConfig((c) => ({ ...c, ...part }))
    setDirty(true)
  }

  function patchSection(
    section: 'morning' | 'afternoon' | 'evening',
    part: { start?: string; count?: number },
  ): void {
    setConfig((c) => ({ ...c, [section]: { ...c[section], ...part } }))
    setDirty(true)
  }

  async function handleSave(): Promise<void> {
    setBusy(true)
    try {
      const count = await applyScheduleConfig(repos, semester.id, config)
      await refresh()
      setDirty(false)
      toast(`作息已更新：共 ${count} 节，课表已重新生成`, 'success')
    } catch (err) {
      toast(`保存失败：${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!loaded) {
    return <p className="text-xs text-muted">正在读取作息…</p>
  }

  const sections: Array<{ key: 'morning' | 'afternoon' | 'evening'; label: string }> = [
    { key: 'morning', label: '上午' },
    { key: 'afternoon', label: '下午' },
    { key: 'evening', label: '晚上' },
  ]

  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-medium text-muted">作息时间</h3>
        <button
          type="button"
          className="rounded-md px-2 py-0.5 text-[11px] text-muted hover:bg-surface-alt"
          onClick={() => {
            setConfig(defaultScheduleConfig())
            setDirty(true)
          }}
        >
          恢复默认
        </button>
      </div>

      <div className="rounded-lg border border-border p-3">
        {/* 每节时长 + 课间休息 */}
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <p className="mb-1 text-[11px] text-muted">每节时长（分钟）</p>
            <div className="flex flex-wrap gap-1">
              {PERIOD_PRESETS.map((n) => (
                <Chip
                  key={n}
                  active={config.periodMinutes === n}
                  onClick={() => patch({ periodMinutes: n })}
                >
                  {n}
                </Chip>
              ))}
              <input
                type="number"
                min={20}
                max={120}
                className="w-14 px-1.5 py-1 text-xs"
                value={config.periodMinutes}
                onChange={(e) => patch({ periodMinutes: clamp(Number(e.target.value), 20, 120) })}
              />
            </div>
          </div>
          <div>
            <p className="mb-1 text-[11px] text-muted">课间休息（分钟）</p>
            <div className="flex flex-wrap gap-1">
              {BREAK_PRESETS.map((n) => (
                <Chip key={n} active={config.breakMinutes === n} onClick={() => patch({ breakMinutes: n })}>
                  {n}
                </Chip>
              ))}
              <input
                type="number"
                min={0}
                max={60}
                className="w-14 px-1.5 py-1 text-xs"
                value={config.breakMinutes}
                onChange={(e) => patch({ breakMinutes: clamp(Number(e.target.value), 0, 60) })}
              />
            </div>
          </div>
        </div>

        {/* 各段起始时间与节数 */}
        <div className="mb-3 space-y-2">
          {sections.map(({ key, label }) => (
            <div key={key} className="flex items-center gap-2">
              <span className="w-8 shrink-0 text-[11px] text-muted">{label}</span>
              <input
                type="time"
                className="w-[6.2rem] px-1.5 py-1 text-xs"
                value={config[key].start}
                onChange={(e) => patchSection(key, { start: e.target.value })}
              />
              <span className="text-[11px] text-muted">起，共</span>
              <input
                type="number"
                min={0}
                max={8}
                className="w-12 px-1.5 py-1 text-xs"
                value={config[key].count}
                onChange={(e) => patchSection(key, { count: clamp(Number(e.target.value), 0, 8) })}
              />
              <span className="text-[11px] text-muted">节</span>
            </div>
          ))}
        </div>

        {/* 实时预览 */}
        <div className="mb-3 rounded-md bg-surface-alt/60 p-2">
          <p className="mb-1 text-[11px] font-medium text-muted">
            预览（共 {preview.length} 节）
            {preview.length === 0 ? '：所有段落节数都是 0' : ''}
          </p>
          <div className="flex flex-wrap gap-1">
            {preview.map((p) => (
              <span
                key={p.id}
                className="rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] leading-none"
              >
                {p.index}. {p.start}-{p.end}
              </span>
            ))}
          </div>
        </div>

        <button
          type="button"
          disabled={busy || !dirty || preview.length === 0}
          className="w-full rounded-lg bg-brand py-2 text-xs font-medium text-white disabled:opacity-50"
          onClick={() => void handleSave()}
        >
          {busy ? '保存中…' : dirty ? '保存并重建课表' : '已是最新'}
        </button>
        <p className="mt-1.5 text-[10px] leading-relaxed text-muted">
          保存后整张作息表会按新参数重排，课表随之重新生成。
          由于节次与场次的标识是确定性的，<strong>已有课程不会错位，提醒与笔记也不会失联</strong>。
        </p>
      </div>
    </section>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'h-7 min-w-[1.9rem] rounded-md border px-1.5 text-[11px] transition-colors ' +
        (active
          ? 'border-brand bg-brand text-white'
          : 'border-border bg-surface text-ink hover:bg-surface-alt')
      }
    >
      {children}
    </button>
  )
}

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min
  return Math.min(max, Math.max(min, Math.round(n)))
}
