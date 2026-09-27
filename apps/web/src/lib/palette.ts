/**
 * 课程配色。
 *
 * 采用**浅色浮起底 + 同色系深字 + 左侧同色竖线**（与成熟课表 App 一致）：
 * 长时间盯屏更柔和，且深字浅底的对比度比"白字彩底"更高。
 * 每个色板给出配套的 bg / border / text，保证三者永远同色系。
 */

export interface BlockPalette {
  /** 中文显示名，便于将来做"手动指定颜色" */
  label: string
  /** 卡片底色（很浅） */
  bg: string
  /** 左侧竖线与描边（中等饱和） */
  border: string
  /** 正文颜色（很深，保证对比度） */
  text: string
}

/** 10 组柔和色板，刻意避开刺眼的纯红/纯绿 */
export const BLOCK_PALETTES: BlockPalette[] = [
  { label: '粉', bg: '#fdeaf1', border: '#f19ec2', text: '#9d2e63' },
  { label: '杏', bg: '#fdeee0', border: '#f3bd85', text: '#9a5b16' },
  { label: '蜜', bg: '#fbf5da', border: '#e8d27a', text: '#8a6d13' },
  { label: '芽', bg: '#eef7e0', border: '#bcdd8a', text: '#4f6f1d' },
  { label: '翠', bg: '#e2f5ec', border: '#97d6ba', text: '#1f6b4d' },
  { label: '青', bg: '#e0f4f6', border: '#8fd2da', text: '#17646d' },
  { label: '湖', bg: '#e4effa', border: '#9cc3e8', text: '#1f5388' },
  { label: '黛', bg: '#ece7fa', border: '#b9a7ea', text: '#513a97' },
  { label: '紫', bg: '#f7e8f8', border: '#ddaae1', text: '#83358a' },
  { label: '石', bg: '#eceff3', border: '#b6c1cd', text: '#42505f' },
]

/** 常见课程 → 固定色板下标，避免中文课名哈希后撞色 */
const SEED_INDEX: Array<[RegExp, number]> = [
  [/高数|高等数学|数学/, 6], // 湖蓝
  [/英语|外语/, 0], // 粉
  [/物理/, 5], // 青
  [/化学/, 4], // 翠
  [/思想|政治|马克思|毛概|近代史|军事/, 2], // 蜜黄
  [/体育|篮球|足球/, 1], // 杏
  [/计算机|程序|数据结构|算法|软件/, 7], // 黛紫
  [/电路|电子|信号/, 6], // 湖蓝
  [/实验/, 5], // 青
]

/** 课程名的稳定哈希 */
function hashTitle(title: string): number {
  let hash = 0
  for (let i = 0; i < title.length; i += 1) {
    hash = (hash * 31 + title.charCodeAt(i)) % 1_000_003
  }
  return hash
}

/** 取课程色板：优先匹配常见课程，其次按名称哈希。同一门课颜色永远稳定。 */
export function paletteForTitle(title: string): BlockPalette {
  for (const [pattern, index] of SEED_INDEX) {
    if (pattern.test(title)) return BLOCK_PALETTES[index] ?? BLOCK_PALETTES[0]!
  }
  return BLOCK_PALETTES[hashTitle(title) % BLOCK_PALETTES.length] ?? BLOCK_PALETTES[0]!
}

/**
 * 按"课程自选颜色"取完整色板。
 *
 * 表单里用户选的是某个色板的 `bg`（浅底），这里把配套的左边线与文字色一并取回；
 * 若色值不在内置色板里（例如来自旧数据），就以该色为底、沿用标题派生的文字色，
 * 保证"深字浅底"的对比度不被破坏。
 */
export function paletteForBlock(block: { title: string; color?: string }): BlockPalette {
  const fallback = paletteForTitle(block.title)
  if (!block.color) return fallback
  const known = BLOCK_PALETTES.find((p) => p.bg === block.color)
  return known ?? { ...fallback, bg: block.color }
}
