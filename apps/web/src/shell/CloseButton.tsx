/** 轻量关闭入口：保留触控面积，视觉上只显示小图标。 */
export function CloseButton({ onClose, label = '关闭' }: { onClose: () => void; label?: string }) {
  return <button type="button" aria-label={label} title={label} className="panel-close" onClick={onClose}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="h-[18px] w-[18px]" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
  </button>
}
