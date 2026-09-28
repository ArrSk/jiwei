/**
 * 添加课程表单。
 *
 * 布局参照 `plugin-campus/index.html` 的底部弹层（`.mask` + `.sheet` + `.form-row`）：
 * 遮罩点击关闭、圆角上边距、label 固定宽度左对齐、输入框浅灰底聚焦变白、
 * 底部三按钮等分。
 *
 * 手机端适配要点：
 * - 弹层 `max-height: 88dvh`（dvh 而非 vh，避免 iOS 地址栏伸缩时跳动）
 * - 底部内边距叠加 `env(safe-area-inset-bottom)`，避开 Home Indicator
 * - 输入框 `min-height: 44px`，达到触摸目标下限
 * - 主表单不自动聚焦：手机上会立刻弹键盘把布局顶乱
 */
import { useState } from 'react'
import { WEEKDAY_LABELS } from '@jiwei/core'
import { BLOCK_PALETTES } from '../../../lib/palette'
import { parseWeeks } from '../../../lib/weeks'

export interface CourseFormValue {
  title: string
  teacher: string
  location: string
  weekday: number
  periodStart: number
  periodEnd: number
  /** 周次文本，如 `1-16` / `1-16单` / `1,3,5,7`；留空表示每周 */
  weeksText: string
  /** 课程颜色（取自 BLOCK_PALETTES 的 bg；留空则按课程名自动配色） */
  color: string
}

export function emptyCourseForm(weekday = 1, periodStart = 1): CourseFormValue {
  return {
    title: '',
    teacher: '',
    location: '',
    weekday,
    periodStart,
    periodEnd: Math.min(periodStart + 1, 12),
    weeksText: '',
    color: '',
  }
}

interface Props {
  value: CourseFormValue
  onChange: (value: CourseFormValue) => void
  onSubmit: (value: CourseFormValue) => Promise<void>
  onClose: () => void
  maxPeriod: number
  totalWeeks: number
  /** 编辑已有课程：标题变「编辑课程」并显示删除按钮 */
  isEditing?: boolean
  /** 编辑模式下删除当前课程 */
  onDelete?: () => Promise<void>
}

/** 周次快捷选择：把「1-16」这类文本归纳成 全周 / 单周 / 双周 */
export function detectWeekMode(text: string): 'all' | 'odd' | 'even' | 'custom' {
  const t = text.trim()
  if (!t) return 'all'
  if (/单周|单$/.test(t)) return 'odd'
  if (/双周|双$/.test(t)) return 'even'
  return 'custom'
}

export function CourseForm({
  value,
  onChange,
  onSubmit,
  onClose,
  maxPeriod,
  totalWeeks,
  isEditing = false,
  onDelete,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const weekMode = detectWeekMode(value.weeksText)

  function patch(part: Partial<CourseFormValue>): void {
    onChange({ ...value, ...part })
  }

  function applyWeekMode(mode: 'all' | 'odd' | 'even'): void {
    if (mode === 'all') patch({ weeksText: '' })
    else if (mode === 'odd') patch({ weeksText: `1-${totalWeeks}单` })
    else patch({ weeksText: `1-${totalWeeks}双` })
  }

  /**
   * 当前生效的周次。
   *
   * 注意"留空 = 每周"这个约定：输入框为空时是**全部周**，而不是"一周都不上"。
   * 所以展示与点选都必须基于 `onWeeks`（空 → 全部），
   * 否则一打开表单就会看到 20 个周次全被划掉 —— 与真实含义正好相反。
   */
  const onWeeks = (() => {
    const parsed = parseWeeks(value.weeksText, totalWeeks)
    return parsed.length > 0 ? parsed : range(1, totalWeeks)
  })()

  /** 点掉/点上一周：结果一律写成**显式列举**，所见即所得 */
  function toggleWeek(week: number): void {
    const current = new Set(onWeeks)
    if (current.has(week)) current.delete(week)
    else current.add(week)

    const next = [...current].sort((a, b) => a - b)
    // 全选时回到"留空"这个更简洁的表示（也和后端的"空 = 每周"一致）
    patch({ weeksText: next.length === totalWeeks ? '' : next.join(',') })
  }

  async function handleSubmit(): Promise<void> {
    if (!value.title.trim()) {
      setError('请填写课程名称')
      return
    }
    if (value.periodEnd < value.periodStart) {
      setError('结束节次不能早于开始节次')
      return
    }
    setError(null)
    setBusy(true)
    try {
      await onSubmit(value)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
      <div
        className="w-full max-w-[640px] overflow-y-auto rounded-t-[18px] bg-surface px-[18px] pt-[18px] shadow-xl"
        style={{
          maxHeight: '88dvh',
          paddingBottom: 'calc(18px + env(safe-area-inset-bottom))',
        }}
      >
        <h3 className="mb-3.5 text-center text-base font-semibold">
          {isEditing ? '编辑课程' : '添加课程'}
        </h3>

        <Row label="课程名">
          <input
            autoFocus={!isTouchDevice()}
            className={inputClass}
            placeholder="如：高等数学A（I）上"
            value={value.title}
            onChange={(e) => patch({ title: e.target.value })}
          />
        </Row>

        <Row label="教师">
          <input
            className={inputClass}
            placeholder="选填"
            value={value.teacher}
            onChange={(e) => patch({ teacher: e.target.value })}
          />
        </Row>

        <Row label="教室">
          <input
            className={inputClass}
            placeholder="选填，如：教西—101"
            value={value.location}
            onChange={(e) => patch({ location: e.target.value })}
          />
        </Row>

        <Row label="星期">
          <select
            className={inputClass}
            value={value.weekday}
            onChange={(e) => patch({ weekday: Number(e.target.value) })}
          >
            {WEEKDAY_LABELS.map((label, i) => (
              <option key={label} value={i + 1}>
                周{label}
              </option>
            ))}
          </select>
        </Row>

        <Row label="节次">
          <div className="flex flex-1 items-center gap-2">
            <select
              className={inputClass + ' flex-1'}
              value={value.periodStart}
              onChange={(e) => {
                const start = Number(e.target.value)
                // 起始超过结束时就一起把结束推后，避免出现非法区间
                patch({ periodStart: start, periodEnd: Math.max(start, value.periodEnd) })
              }}
            >
              {range(1, maxPeriod).map((n) => (
                <option key={n} value={n}>
                  第 {n} 节
                </option>
              ))}
            </select>
            <span className="shrink-0 text-[13px] text-muted">至</span>
            <select
              className={inputClass + ' flex-1'}
              value={value.periodEnd}
              onChange={(e) => patch({ periodEnd: Number(e.target.value) })}
            >
              {range(value.periodStart, maxPeriod).map((n) => (
                <option key={n} value={n}>
                  第 {n} 节
                </option>
              ))}
            </select>
          </div>
        </Row>

        <Row label="颜色">
          <div className="flex flex-1 flex-wrap items-center gap-2.5">
            {/* 「自动」= 不指定，按课程名稳定派生 */}
            <button
              type="button"
              title="自动配色"
              aria-label="自动配色"
              onClick={() => patch({ color: '' })}
              className={
                'grid h-7 w-7 place-items-center rounded-full border text-[10px] transition-transform ' +
                (value.color === ''
                  ? 'border-ink ring-2 ring-ink/20'
                  : 'border-border text-muted')
              }
            >
              自
            </button>
            {BLOCK_PALETTES.map((p) => {
              // 存的是**色名**（如 green），渲染时再查底色与文字色；
              // 也兼容旧数据里存的色值，选中态两种都能识别。
              const selected = value.color === p.name || value.color === p.bg
              return (
                <button
                  key={p.name}
                  type="button"
                  title={p.label}
                  aria-label={`颜色 ${p.label}`}
                  onClick={() => patch({ color: p.name })}
                  className={
                    'h-8 w-8 rounded-full border-2 transition-transform active:scale-95 ' +
                    (selected ? 'border-ink' : 'border-black/10')
                  }
                  // 色块用它自己的底色 + 同色系文字，所见即所得
                  style={{ backgroundColor: p.bg, color: p.text }}
                >
                  <span className="text-[11px]">{p.label}</span>
                </button>
              )
            })}
          </div>
        </Row>

        <Row label="周次">
          <div className="flex flex-1 gap-2">
            {(
              [
                ['all', '全周'],
                ['odd', '单周'],
                ['even', '双周'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                className={
                  'min-h-[38px] flex-1 rounded-lg border py-1.5 text-[13px] transition-colors ' +
                  (weekMode === mode
                    ? 'border-brand bg-brand text-white'
                    : 'border-border bg-surface-alt text-ink')
                }
                onClick={() => applyWeekMode(mode)}
              >
                {label}
              </button>
            ))}
          </div>
        </Row>

        <Row label="">
          <input
            className={inputClass}
            placeholder={`如 1-16 或 1,3,5（留空 = 每周，共 ${totalWeeks} 周）`}
            value={value.weeksText}
            onChange={(e) => patch({ weeksText: e.target.value })}
          />
        </Row>

        {/*
          逐周开关：解决"跳过某几周"（例如第 5 周实习、第 9 周放假）。
          为什么要有它：光靠手打 `1-4,7-16` 也能表达，但用户要先心算一遍，
          而且一旦错了很难发现。点一下更直观，写回去仍是那个可读的文本格式。
        */}
        <div className="mb-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] text-muted">逐周开关（点一下去掉/加上这一周）</span>
            <span className="text-[11px] text-muted">已选 {onWeeks.length} 周</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {range(1, totalWeeks).map((w) => {
              const on = onWeeks.includes(w)
              return (
                <button
                  key={w}
                  type="button"
                  aria-pressed={on}
                  aria-label={`第 ${w} 周`}
                  className={
                    'h-7 w-7 rounded-md border text-[11px] transition-colors ' +
                    (on
                      ? 'border-brand bg-brand/10 text-brand'
                      : 'border-border bg-surface-alt text-muted line-through')
                  }
                  onClick={() => toggleWeek(w)}
                >
                  {w}
                </button>
              )
            })}
          </div>
        </div>

        {error ? <p className="mb-2 text-center text-xs text-danger">{error}</p> : null}

        <div className="mt-4 flex gap-2.5">
          {/* 编辑模式下多一个删除按钮，占 30% 宽度 */}
          {isEditing && onDelete ? (
            <button
              type="button"
              disabled={busy}
              className="min-h-[46px] shrink-0 basis-[30%] rounded-xl bg-danger/10 text-[15px] text-danger disabled:opacity-60"
              onClick={() => {
                setBusy(true)
                void onDelete().finally(() => setBusy(false))
              }}
            >
              删除
            </button>
          ) : null}
          <button
            type="button"
            className="min-h-[46px] flex-1 rounded-xl bg-surface-alt text-[15px] text-ink"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            disabled={busy}
            className="min-h-[46px] flex-1 rounded-xl bg-brand text-[15px] font-medium text-white disabled:opacity-60"
            onClick={() => void handleSubmit()}
          >
            {busy ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** 输入框统一样式：浅底、聚焦高亮、手机 44px 触摸高度 */
const inputClass =
  'min-w-0 flex-1 rounded-lg border border-border bg-surface-alt px-2.5 py-2 text-sm ' +
  'outline-none transition-colors min-h-[44px] focus:border-brand focus:bg-surface sm:min-h-0'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="w-[58px] shrink-0 text-sm text-muted">{label}</span>
      {children}
    </div>
  )
}

/** 触屏设备：用媒体查询判断，比 UA 嗅探可靠 */
function isTouchDevice(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(hover: none)').matches
}

function range(from: number, to: number): number[] {
  return Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i)
}
