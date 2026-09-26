/**
 * 课程块配色。
 *
 * 参考成熟课表 App 的做法：**浅色底 + 同色系深色字**，而不是实色块配白字。
 * 前者在长时间盯屏时更柔和，且文字对比度更高（深字浅底比白字彩底更易读）。
 *
 * 每个色板给出一组配套值，保证"底色 / 左侧竖线 / 文字"始终同色系：
 * - `bg`：卡片底色（很浅，用于大面积）
 * - `border`：左侧竖线（中等饱和，用于识别）
 * - `text`：正文颜色（很深，保证对比度）
 */
export interface BlockPalette {
  /** 色板标识（语义名，便于将来做"手动指定颜色"时展示） */
  name: string
  /** 中文显示名 */
  label: string
  bg: string
  border: string
  text: string
}

/** 10 组柔和色板。刻意避开纯红/纯绿等刺眼色相。 */
export const BLOCK_PALETTES: BlockPalette[] = [
  { name: 'rose', label: '粉', bg: '#fdeaf1', border: '#f19ec2', text: '#9d2e63' },
  { name: 'apricot', label: '杏', bg: '#fdeee0', border: '#f3bd85', text: '#9a5b16' },
  { name: 'honey', label: '蜜', bg: '#fbf5da', border: '#e8d27a', text: '#8a6d13' },
  { name: 'lime', label: '芽', bg: '#eef7e0', border: '#bcdd8a', text: '#4f6f1d' },
  { name: 'jade', label: '翠', bg: '#e2f5ec', border: '#97d6ba', text: '#1f6b4d' },
  { name: 'aqua', label: '青', bg: '#e0f4f6', border: '#8fd2da', text: '#17646d' },
  { name: 'lake', label: '湖', bg: '#e4effa', border: '#9cc3e8', text: '#1f5388' },
  { name: 'iris', label: '黛', bg: '#ece7fa', border: '#b9a7ea', text: '#513a97' },
  { name: 'orchid', label: '紫', bg: '#f7e8f8', border: '#ddaae1', text: '#83358a' },
  { name: 'stone', label: '石', bg: '#eceff3', border: '#b6c1cd', text: '#42505f' },
]

/** 置灰色（停课等失效场次用） */
export const MUTED_PALETTE: BlockPalette = {
  name: 'muted',
  label: '失效',
  bg: '#f1f5f9',
  border: '#cbd5e1',
  text: '#94a3b8',
}

/** 按索引稳定取色 */
export function paletteAt(index: number): BlockPalette {
  const n = BLOCK_PALETTES.length
  return BLOCK_PALETTES[((index % n) + n) % n] ?? BLOCK_PALETTES[0]!
}

/** 按任意字符串稳定取色：同一门课每次渲染颜色一致，不需要用户手动选色 */
export function paletteFor(key: string): BlockPalette {
  let hash = 0
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) % 1_000_003
  }
  return paletteAt(hash)
}
