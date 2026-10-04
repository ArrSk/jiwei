import { useAppearance } from './AppearanceContext'

export function ReadingSettings() {
  const { value, ready, saving, save } = useAppearance()
  return (
    <section className="mb-4">
      <h3 className="mb-2 text-sm font-medium">阅读与显示</h3>
      <div className="space-y-3 rounded-lg border border-border p-3 text-sm">
        <fieldset disabled={!ready || saving}>
          <legend className="mb-1.5">阅读字号</legend>
          <div className="flex gap-2">
            {(['standard', 'large'] as const).map((size) => (
              <button key={size} type="button" aria-pressed={value.readingSize === size}
                className={'min-h-[44px] flex-1 rounded-lg border px-3 disabled:opacity-50 ' + (value.readingSize === size ? 'border-brand bg-brand-soft text-brand' : 'border-border')}
                onClick={() => void save({ ...value, readingSize: size })}>
                {size === 'standard' ? '标准字号' : '大字模式'}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset disabled={!ready || saving}>
          <legend className="mb-1.5">课表显示密度</legend>
          <div className="flex gap-2">
            {(['compact', 'comfortable'] as const).map((density) => (
              <button key={density} type="button" aria-pressed={value.density === density}
                className={'min-h-[44px] flex-1 rounded-lg border px-3 disabled:opacity-50 ' + (value.density === density ? 'border-brand bg-brand-soft text-brand' : 'border-border')}
                onClick={() => void save({ ...value, density })}>
                {density === 'compact' ? '紧凑' : '宽松'}
              </button>
            ))}
          </div>
        </fieldset>
        <p className="text-xs leading-relaxed text-muted">字号用于今天、课程卡片和日视图；宽松模式增加课表行高。自动保存，重新打开也有效。深色模式跟随系统。</p>
      </div>
    </section>
  )
}
