/**
 * 底部弹层外壳（所有弹层共用）。
 *
 * 抽出来的理由：手机上这套参数**错一个就难受** ——
 *   - `88dvh` 而不是 `88vh`：iOS 地址栏收缩时 vh 会跳
 *   - 底部叠加 `env(safe-area-inset-bottom)`：避开 iPhone 的 Home Indicator
 *   - 遮罩 `bg-black/40` + 点遮罩关闭
 * 之前每个弹层各写一份，改一次要改四处，必然漏。
 */
import type { ReactNode } from 'react'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  /** 底部操作区（按钮行），会跟着弹层一起被安全区顶起来 */
  footer?: ReactNode
  /** 头部右侧的补充操作（例如「全部展开」） */
  headerExtra?: ReactNode
  /** 弹层最大高度，默认 88dvh。内容特别长时可调小 */
  maxHeight?: string
}

export function Sheet({ title, onClose, children, footer, headerExtra, maxHeight = '88dvh' }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
      {/* 点遮罩关闭：独立的兄弟节点，避免点击弹层内部时冒泡到遮罩 */}
      <button
        type="button"
        aria-label="关闭"
        tabIndex={-1}
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-[640px] overflow-y-auto rounded-t-[18px] bg-surface px-[18px] pt-[18px] shadow-xl"
        style={{
          maxHeight,
          paddingBottom: 'calc(18px + env(safe-area-inset-bottom))',
        }}
      >
        <div className="mb-3.5 flex items-center gap-2">
          <h3 className="flex-1 text-center text-base font-semibold">{title}</h3>
          {headerExtra}
          <button
            type="button"
            className="shrink-0 rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-alt"
            onClick={onClose}
          >
            关闭
          </button>
        </div>

        {children}

        {footer ? <div className="mt-4 flex gap-2.5">{footer}</div> : null}
      </div>
    </div>
  )
}

/** 输入框统一样式：浅底、聚焦高亮、手机 44px 触摸高度 */
export const inputClass =
  'min-w-0 flex-1 rounded-lg border border-border bg-surface-alt px-2.5 py-2 text-sm ' +
  'outline-none transition-colors min-h-[44px] focus:border-brand focus:bg-surface sm:min-h-0'

/** 表单一行：左标签固定宽 + 右侧内容 */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="w-[58px] shrink-0 text-sm text-muted">{label}</span>
      {children}
    </div>
  )
}
