/**
 * 课程配色。
 *
 * 色值直接取自 `plugin-campus/index.html` 的 7 组配色，保持与之完全一致的观感：
 * **浅色底 + 同色系深字**（长时间盯屏柔和，且深字浅底的对比度比白字彩底更高）。
 */

export type ColorName = 'green' | 'blue' | 'yellow' | 'red' | 'purple' | 'orange' | 'cyan'

export interface BlockPalette {
  /** 色名（落库时存这个） */
  name: ColorName
  /** 中文显示名，用于配色选择器的提示 */
  label: string
  /** 卡片底色（浅） */
  bg: string
  /** 正文颜色（同色系深色，保证对比度） */
  text: string
}

/** 7 组配色，色值与你提供的示例完全一致 */
export const BLOCK_PALETTES: BlockPalette[] = [
  { name: 'green', label: '绿', bg: '#e3f6e5', text: '#3d9c4e' },
  { name: 'blue', label: '蓝', bg: '#e0edff', text: '#4a7de0' },
  { name: 'yellow', label: '黄', bg: '#fdf6d8', text: '#b8971f' },
  { name: 'red', label: '红', bg: '#fde3e3', text: '#e05a5a' },
  { name: 'purple', label: '紫', bg: '#f1e4fb', text: '#9b59d0' },
  { name: 'orange', label: '橙', bg: '#fdeadb', text: '#e08a3c' },
  { name: 'cyan', label: '青', bg: '#dcf3f6', text: '#3aa6b5' },
]

/** 停课等失效场次：置灰 */
export const MUTED_PALETTE: BlockPalette = {
  name: 'green',
  label: '失效',
  bg: '#f1f5f9',
  text: '#94a3b8',
}

const BY_NAME = new Map(BLOCK_PALETTES.map((p) => [p.name, p]))

/**
 * 常见课程 → 固定配色，避免中文课名哈希后撞色。
 * 这套映射刻意让示例课表覆盖多个色系（数学蓝、英语红、物理青、体育橙…）。
 */
const SEED_COLOR: Array<[RegExp, ColorName]> = [
  [/高数|高等数学|数学|线性代数/, 'blue'],
  [/英语|外语/, 'red'],
  [/物理/, 'cyan'],
  [/化学/, 'green'],
  [/思想|政治|马克思|毛概|近代史|军事/, 'yellow'],
  [/体育|篮球|足球/, 'orange'],
  [/计算机|程序|数据结构|算法|软件/, 'purple'],
  [/电路|电子|信号/, 'blue'],
  [/实验/, 'green'],
]

/** 课程名的稳定哈希 */
function hashTitle(title: string): number {
  let hash = 0
  for (let i = 0; i < title.length; i += 1) {
    hash = (hash * 31 + title.charCodeAt(i)) % 1_000_003
  }
  return hash
}

/** 由课程名派生的色名：优先匹配常见课程，其次按名称哈希 */
export function colorNameForTitle(title: string): ColorName {
  for (const [pattern, name] of SEED_COLOR) {
    if (pattern.test(title)) return name
  }
  return BLOCK_PALETTES[hashTitle(title) % BLOCK_PALETTES.length]!.name
}

/**
 * 取课程配色。
 *
 * `block.color` 里存的是**色名**（如 `blue`）；旧数据可能存的是色值，
 * 两种情况都能识别，未知值则退回按课名派生，保证永远有可用配色。
 */
export function paletteForBlock(block: { title: string; color?: string }): BlockPalette {
  const stored = block.color?.trim()
  if (stored) {
    const byName = BY_NAME.get(stored as ColorName)
    if (byName) return byName
    const byBg = BLOCK_PALETTES.find((p) => p.bg === stored)
    if (byBg) return byBg
  }
  return BY_NAME.get(colorNameForTitle(block.title)) ?? BLOCK_PALETTES[0]!
}

/** 按色名取配色（表单里选色时用） */
export function paletteByName(name: ColorName): BlockPalette {
  return BY_NAME.get(name) ?? BLOCK_PALETTES[0]!
}
