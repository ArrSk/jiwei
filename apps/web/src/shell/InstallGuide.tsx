import { useEffect, useState } from 'react'
import { useJiwei } from '../JiweiContext'

/** 浏览器没有安装按钮时仍能看到手动安装步骤。 */
export function InstallGuide() {
  const { platform } = useJiwei()
  const [, tick] = useState(0)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const app = platform.app
  useEffect(() => app.subscribe(() => tick((value) => value + 1)), [app])

  async function install() {
    setBusy(true)
    try {
      const result = await app.install()
      setFeedback(result === 'accepted' ? '已接受安装，请在桌面查看几微图标。'
        : result === 'dismissed' ? '已取消安装，可以随时重试。' : '请按下方步骤从浏览器菜单添加。')
    } catch {
      setFeedback('安装没有完成，请从浏览器菜单手动添加。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mb-4">
      <h3 className="mb-2 text-sm font-medium">安装与离线使用</h3>
      <div className="space-y-3 rounded-lg border border-border p-3 text-sm leading-relaxed">
        {app.isInstalled() ? <p className="font-medium text-brand">当前已从桌面应用打开</p> : <>
          {app.canInstall() ? <button type="button" disabled={busy} className="min-h-[44px] w-full rounded-lg bg-brand px-3 text-white disabled:opacity-50" onClick={() => void install()}>安装几微</button> : null}
          <p><strong>iPhone / iPad：</strong>在 Safari 中打开页面，点“分享”，选择“添加到主屏幕”，再点“添加”。</p>
          <p><strong>安卓：</strong>在 Chrome 中打开页面，点右上角菜单，选择“安装应用”或“添加到主屏幕”。</p>
          <p><strong>电脑：</strong>在 Chrome / Edge 中查看地址栏安装图标，或浏览器菜单中的安装选项。</p>
        </>}
        {feedback ? <p role="status" className="text-brand">{feedback}</p> : null}
        <p className="text-xs text-muted">先联网打开一次，再断网重新打开，确认能看见自己的课程。局域网体验地址主要供预览；手机安装和离线启动请使用 HTTPS 正式网址。</p>
        <p className="text-xs text-muted">不同网址、浏览器和设备分别保存数据。安装或换设备前，请先导出备份；添加到桌面不等于自动同步。</p>
      </div>
    </section>
  )
}

export function InstallHelpSheet({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div role="dialog" aria-modal="true" aria-label="安装几微到桌面"
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-surface p-4 shadow-xl sm:max-w-md sm:rounded-2xl"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
        <div className="mb-3 flex justify-end">
          <button autoFocus type="button" className="min-h-[44px] rounded-lg border border-border px-3 text-sm" onClick={onClose}>关闭安装说明</button>
        </div>
        <InstallGuide />
      </div>
    </div>
  )
}
