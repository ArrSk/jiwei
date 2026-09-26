/**
 * 添加课程表单（移动端底部弹层）。
 *
 * M0 只做"能录入"的最小集合：名称、老师、地点、星期、起止节次、周次。
 * 编辑已有课程、批量表格编辑排在 M1（docs/ROADMAP.md）。
 */
import { useState } from 'react'
import { WEEKDAY_LABELS } from '@jiwei/core'

export interface CourseFormValue {
  title: string
  teacher: string
  location: string
  weekday: number
  periodStart: number
  periodEnd: number
  /** 周次文本，如 `1-16` / `1-16单` / `1,3,5,7` */
  weeksText: string
}

export function emptyCourseForm(weekday = 1, periodStart = 1): CourseFormValue {
  return {
    title: '',
    teacher: '',
    location: '',
    weekday,
    periodStart,
    periodEnd: Math.min(periodStart + 1, 12),
    weeksText: '1-16',
  }
}

interface Props {
  value: CourseFormValue
  onChange: (value: CourseFormValue) => void
  onSubmit: (value: CourseFormValue) => Promise<void>
  onClose: () => void
  maxPeriod: number
  totalWeeks: number
}

export function CourseForm({ value, onChange, onSubmit, onClose, maxPeriod, totalWeeks }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function patch(part: Partial<CourseFormValue>): void {
    onChange({ ...value, ...part })
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
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 sm:items-center">
      {/*
        手机端：**全屏布局**（而不是底部半屏弹层）—— 表单字段多，
        半屏在小屏上要来回滚动，全屏一次能看全，且底部按钮固定不随滚动跑掉。
        桌面端：仍然是居中弹窗。
      */}
      <div className="flex h-full w-full flex-col bg-surface shadow-xl sm:h-auto sm:max-h-[92dvh] sm:max-w-md sm:rounded-2xl">
        {/* 头部固定 */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <h2 className="text-base font-semibold sm:text-sm">添加课程</h2>
          <button
            type="button"
            className="rounded-md px-3 py-1.5 text-sm text-muted hover:bg-surface-alt sm:text-xs"
            onClick={onClose}
          >
            取消
          </button>
        </div>

        {/* 主体可滚动；手机上输入框加大到 44px 触摸高度 */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 text-base [&_input]:min-h-[44px] [&_select]:min-h-[44px] sm:space-y-3 sm:text-sm sm:[&_input]:min-h-0 sm:[&_select]:min-h-0">
          <Field label="课程名称">
            {/* 手机上不自动聚焦：会立刻弹起键盘，把刚打开的布局顶乱 */}
            <input
              autoFocus={!isTouchDevice()}
              className="w-full"
              placeholder="例如：高等数学"
              value={value.title}
              onChange={(e) => patch({ title: e.target.value })}
            />
          </Field>

          {/* 手机上一行一个，宽屏才并排 */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3">
            <Field label="老师（可选）">
              <input
                className="w-full"
                placeholder="张老师"
                value={value.teacher}
                onChange={(e) => patch({ teacher: e.target.value })}
              />
            </Field>
            <Field label="地点（可选）">
              <input
                className="w-full"
                placeholder="教三 201"
                value={value.location}
                onChange={(e) => patch({ location: e.target.value })}
              />
            </Field>
          </div>

          <Field label="星期">
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAY_LABELS.map((label, i) => {
                const weekday = i + 1
                const active = value.weekday === weekday
                return (
                  <button
                    key={weekday}
                    type="button"
                    className={
                      'h-11 rounded-md border text-sm transition-colors sm:h-9 sm:text-xs ' +
                      (active
                        ? 'border-brand bg-brand text-white'
                        : 'border-border bg-surface hover:bg-surface-alt')
                    }
                    onClick={() => patch({ weekday })}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-4 sm:gap-3">
            <Field label="开始节次">
              <select
                className="w-full"
                value={value.periodStart}
                onChange={(e) => patch({ periodStart: Number(e.target.value) })}
              >
                {range(1, maxPeriod).map((n) => (
                  <option key={n} value={n}>
                    第 {n} 节
                  </option>
                ))}
              </select>
            </Field>
            <Field label="结束节次（含）">
              <select
                className="w-full"
                value={value.periodEnd}
                onChange={(e) => patch({ periodEnd: Number(e.target.value) })}
              >
                {range(value.periodStart, maxPeriod).map((n) => (
                  <option key={n} value={n}>
                    第 {n} 节
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label={`周次（共 ${totalWeeks} 周）`} hint="支持 1-16、1,3,5、1-16单、1-16双">
            <input
              className="w-full"
              placeholder="1-16"
              value={value.weeksText}
              onChange={(e) => patch({ weeksText: e.target.value })}
            />
          </Field>
        </div>

        {/* 底部操作区固定；手机端留出 Home Indicator 安全区 */}
        <div className="shrink-0 border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {error ? <p className="mb-2 text-xs text-danger">{error}</p> : null}
          <button
            type="button"
            disabled={busy}
            className="w-full rounded-lg bg-brand py-3 text-sm font-medium text-white disabled:opacity-60 sm:py-2.5"
            onClick={() => void handleSubmit()}
          >
            {busy ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** 触屏设备：用媒体查询判断，比 UA 嗅探可靠 */
function isTouchDevice(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(hover: none)').matches
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">
        {label}
        {hint ? <span className="ml-1 opacity-70">（{hint}）</span> : null}
      </span>
      {children}
    </label>
  )
}

function range(from: number, to: number): number[] {
  return Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i)
}
