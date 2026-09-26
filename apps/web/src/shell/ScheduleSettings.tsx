/**
 * 作息时间设置。
 *
 * **每节课的起止时间逐条可编辑**——真实作息不是等间隔的
 * （第 3 节前休 15 分钟、中午午休、下午第一节前休 15 分钟），
 * 只给"每节时长 + 课间"两个数字永远对不上。
 *
 * 「每节时长」与「课间」保留为**快捷填充工具**：改一个数字，
 * 可以一键把某一整段按等间隔重排；单节仍可再微调。
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  addMinutesToTime,
  defaultScheduleConfig,
  isValidTime,
  PRESET_TIME_SPECS,
  type PeriodTimeSpec,
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

  const times = config.presetTimes
  const invalid = useMemo(
    () => times.some((t) => !isValidTime(t.start) || !isValidTime(t.end) || t.end <= t.start),
    [times],
  )

  /** 改某一节的时刻 */
  function patchPeriod(index: number, part: Partial<PeriodTimeSpec>): void {
    setConfig((c) => ({
      ...c,
      presetTimes: c.presetTimes.map((t) => (t.index === index ? { ...t, ...part } : t)),
    }))
    setDirty(true)
  }

  /** 某节改了开始时间 → 结束时间按"每节时长"自动补上（用户仍可再改） */
  function patchStart(index: number, start: string): void {
    patchPeriod(index, { start, end: addMinutesToTime(start, config.periodMinutes) })
  }

  function addPeriod(): void {
    setConfig((c) => {
      const last = c.presetTimes[c.presetTimes.length - 1]
      const start = last ? addMinutesToTime(last.end, c.breakMinutes) : '08:00'
      return {
        ...c,
        presetTimes: [
          ...c.presetTimes,
          {
            index: c.presetTimes.length + 1,
            label: last?.label ?? '上午',
            start,
            end: addMinutesToTime(start, c.periodMinutes),
          },
        ],
      }
    })
    setDirty(true)
  }

  function removeLastPeriod(): void {
    setConfig((c) => ({ ...c, presetTimes: c.presetTimes.slice(0, -1) }))
    setDirty(true)
  }

  /** 把某一整段按"每节时长 + 课间"等间隔重排 */
  function refillSection(
    section: 'morning' | 'afternoon' | 'evening',
    label: string,
    start: string,
  ): void {
    setConfig((c) => {
      const others = c.presetTimes.filter((t) => t.label !== label)
      const count = c[section].count
      const regenerated: PeriodTimeSpec[] = []
      for (let i = 0; i < count; i += 1) {
        const s =
          i === 0
            ? start
            : addMinutesToTime(
                regenerated[i - 1]?.end ?? start,
                c.breakMinutes,
              )
        regenerated.push({
          index: 0,
          label,
          start: s,
          end: addMinutesToTime(s, c.periodMinutes),
        })
      }
      const merged = [...others, ...regenerated].sort((a, b) => a.start.localeCompare(b.start))
      return {
        ...c,
        presetTimes: merged.map((t, i) => ({ ...t, index: i + 1 })),
      }
    })
    setDirty(true)
  }

  async function handleSave(): Promise<void> {
    if (invalid) {
      toast('有时间不合法：结束时间必须晚于开始时间', 'error')
      return
    }
    setBusy(true)
    try {
      const count = await applyScheduleConfig(repos, semester.id, config)
      await refresh()
      setDirty(false)
      toast(`作息已保存：共 ${count} 节，课表已重新生成`, 'success')
    } catch (err) {
      toast(`保存失败：${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!loaded) return <p className="text-xs text-muted">正在读取作息…</p>

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
            toast('已恢复为内置作息（12 节）')
          }}
        >
          恢复内置作息
        </button>
      </div>

      <div className="rounded-lg border border-border p-3">
        {/* ── 快捷填充：每节时长 + 课间 ─────────────────────── */}
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <p className="mb-1 text-[11px] text-muted">每节时长（分钟）</p>
            <div className="flex flex-wrap gap-1">
              {PERIOD_PRESETS.map((n) => (
                <Chip
                  key={n}
                  active={config.periodMinutes === n}
                  onClick={() => {
                    setConfig((c) => ({ ...c, periodMinutes: n }))
                    setDirty(true)
                  }}
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
                onChange={(e) => {
                  setConfig((c) => ({ ...c, periodMinutes: clamp(Number(e.target.value), 20, 120) }))
                  setDirty(true)
                }}
              />
            </div>
          </div>
          <div>
            <p className="mb-1 text-[11px] text-muted">课间休息（分钟）</p>
            <div className="flex flex-wrap gap-1">
              {BREAK_PRESETS.map((n) => (
                <Chip
                  key={n}
                  active={config.breakMinutes === n}
                  onClick={() => {
                    setConfig((c) => ({ ...c, breakMinutes: n }))
                    setDirty(true)
                  }}
                >
                  {n}
                </Chip>
              ))}
              <input
                type="number"
                min={0}
                max={60}
                className="w-14 px-1.5 py-1 text-xs"
                value={config.breakMinutes}
                onChange={(e) => {
                  setConfig((c) => ({ ...c, breakMinutes: clamp(Number(e.target.value), 0, 60) }))
                  setDirty(true)
                }}
              />
            </div>
          </div>
        </div>

        {/* ── 一键重排某一段 ─────────────────────────────── */}
        <div className="mb-3 space-y-1.5">
          <p className="text-[11px] text-muted">
            一键按「时长 + 课间」重排某一段（会覆盖该段现有时间）：
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ['morning', '上午', '08:00'],
                ['afternoon', '下午', '13:45'],
                ['evening', '晚上', '18:30'],
              ] as const
            ).map(([key, label, start]) => (
              <div key={key} className="flex items-center gap-1">
                <span className="text-[11px] text-muted">{label}</span>
                <input
                  type="time"
                  className="w-[5.6rem] px-1 py-0.5 text-[11px]"
                  value={config[key].start}
                  onChange={(e) => {
                    setConfig((c) => ({ ...c, [key]: { ...c[key], start: e.target.value } }))
                    setDirty(true)
                  }}
                />
                <input
                  type="number"
                  min={0}
                  max={8}
                  className="w-10 px-1 py-0.5 text-[11px]"
                  value={config[key].count}
                  onChange={(e) => {
                    setConfig((c) => ({
                      ...c,
                      [key]: { ...c[key], count: clamp(Number(e.target.value), 0, 8) },
                    }))
                    setDirty(true)
                  }}
                />
                <button
                  type="button"
                  className="rounded border border-border px-1.5 py-0.5 text-[11px] hover:bg-surface-alt"
                  onClick={() => refillSection(key, label, config[key].start || start)}
                >
                  重排
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* ── 每节时刻逐条编辑（真正的时刻来源）────────────── */}
        <div className="mb-3">
          <p className="mb-1 text-[11px] text-muted">
            每节起止时间（共 {times.length} 节，可逐条修改）
          </p>
          <div className="max-h-56 overflow-y-auto rounded-md border border-border">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-surface-alt text-muted">
                <tr>
                  <th className="w-10 px-1 py-1 text-left font-medium">节</th>
                  <th className="px-1 py-1 text-left font-medium">开始</th>
                  <th className="px-1 py-1 text-left font-medium">结束</th>
                </tr>
              </thead>
              <tbody>
                {times.map((t) => {
                  const bad = !isValidTime(t.start) || !isValidTime(t.end) || t.end <= t.start
                  return (
                    <tr key={t.index} className="border-t border-border">
                      <td className="px-1 py-1 text-muted">{t.index}</td>
                      <td className="px-1 py-1">
                        <input
                          type="time"
                          className="w-[5.6rem] px-1 py-0.5 text-[11px]"
                          value={t.start}
                          onChange={(e) => patchStart(t.index, e.target.value)}
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          type="time"
                          className={'w-[5.6rem] px-1 py-0.5 text-[11px] ' + (bad ? 'border-danger' : '')}
                          value={t.end}
                          onChange={(e) => patchPeriod(t.index, { end: e.target.value })}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-1.5 flex gap-2">
            <button
              type="button"
              className="rounded border border-border px-2 py-0.5 text-[11px] hover:bg-surface-alt"
              onClick={addPeriod}
            >
              + 增加一节
            </button>
            <button
              type="button"
              className="rounded border border-border px-2 py-0.5 text-[11px] hover:bg-surface-alt disabled:opacity-40"
              disabled={times.length <= 1}
              onClick={removeLastPeriod}
            >
              − 删除最后一节
            </button>
          </div>
        </div>

        {invalid ? (
          <p className="mb-2 text-[11px] text-danger">结束时间必须晚于开始时间，请修正后再保存。</p>
        ) : null}

        <button
          type="button"
          disabled={busy || !dirty || invalid || times.length === 0}
          className="w-full rounded-lg bg-brand py-2 text-xs font-medium text-white disabled:opacity-50"
          onClick={() => void handleSave()}
        >
          {busy ? '保存中…' : dirty ? '保存并重建课表' : '已是最新'}
        </button>
        <p className="mt-1.5 text-[10px] leading-relaxed text-muted">
          保存后作息表按新时间重排，课表随之重新生成。节次与场次的标识是确定性的，
          <strong>已有课程不会错位，提醒与笔记也不会失联</strong>。
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

/** 内置作息常量在界面上也用到（"恢复内置作息"提示）——保留引用避免 tree-shaking 误判 */
export const BUILTIN_PERIOD_COUNT = PRESET_TIME_SPECS.length
