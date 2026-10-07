
import { useState } from 'react'

const previews: Record<string, string[]> = {
  '记账': ['食堂午餐 · 支出 ¥18.00', '校园兼职 · 收入 ¥120.00', '今日结余 · +¥102.00'],
  '笔记': ['高等数学 · 课堂笔记', '今天复习：极限与连续', '手写笔记将在后续阶段加入'],
  'AI 助手': ['你：明晚八点提醒我准备展示', '助手草稿：明天 20:00 · 准备展示', '未来流程：确认草稿后才写入事项'],
}

export function ComingSoonPage({ title, stage }: { title: string; stage: string }) {
  const [showPreview, setShowPreview] = useState(false)
  return <div className="flex h-full flex-col bg-canvas"><main className="min-h-0 flex-1 overflow-y-auto p-4"><div className="mx-auto mt-10 max-w-md rounded-xl border border-dashed border-border bg-surface p-6 text-center"><h1 className="text-base font-semibold">{title}</h1><p className="mt-2 text-sm text-muted">这个功能会在 {stage} 开放，当前入口只是为了让你可以提前安排模块。</p><span className="mt-4 inline-block rounded-full bg-surface-alt px-2 py-1 text-[11px] text-muted">尚未开放</span><div className="mt-4"><button type="button" className="min-h-[44px] rounded-lg px-3 text-sm text-brand" aria-expanded={showPreview} onClick={() => setShowPreview(!showPreview)}>{showPreview ? '收起示例' : '查看示例效果'}</button></div>{showPreview ? <div className="mt-3 rounded-xl bg-surface-alt p-3 text-left"><p className="mb-3 text-xs text-muted">效果示意 · 这些内容不会保存，当前不能实际操作</p><div className="space-y-2">{(previews[title] ?? []).map((line) => <p key={line} className="rounded-lg bg-surface px-3 py-3 text-sm">{line}</p>)}</div></div> : null}</div></main></div>
}
