/**
 * 课程配色。
 *
 * 采用**实色底 + 白字**（与上一版一致）：在课表这种小色块密集的场景里识别度最高。
 *
 * 颜色按课程名稳定派生 —— 同一门课每次渲染颜色固定，用户不需要手动选色。
 * 常见的公共课给了约定俗成的固定色（数学偏靛蓝、英语偏玫红……），
 * 其余课程按名称哈希分配到色相环上，保证同屏内颜色分散。
 */

/** 常见课程 → 固定色，避免中文课名哈希后撞色 */
const SEED_COLORS: Array<[RegExp, string]> = [
  [/高数|高等数学|数学/, '#4f46e5'], // 靛蓝
  [/英语|外语/, '#e11d48'], // 玫红
  [/物理/, '#0891b2'], // 青
  [/化学/, '#059669'], // 绿
  [/思想|政治|马克思|毛概|近代史/, '#d97706'], // 琥珀
  [/体育/, '#65a30d'], // 橄榄
  [/计算机|程序|数据结构|算法|软件/, '#7c3aed'], // 紫
  [/电路|电子|信号/, '#0284c7'], // 天蓝
  [/实验/, '#0d9488'], // 蓝绿
]

/** 其它课程的兜底色相池：彼此间隔足够大，同屏不会糊成一片 */
const HUE_POOL = [237, 199, 160, 39, 290, 348, 172, 88, 20, 262]

/** 课程名的稳定哈希 */
function hashTitle(title: string): number {
  let hash = 0
  for (let i = 0; i < title.length; i += 1) {
    hash = (hash * 31 + title.charCodeAt(i)) % 1_000_003
  }
  return hash
}

/**
 * 取课程色（实色，配白字使用）。
 * 优先匹配常见课程，其次按哈希取色相；统一用固定饱和度与明度，保证白字对比度足够。
 */
export function colorForTitle(title: string): string {
  for (const [pattern, color] of SEED_COLORS) {
    if (pattern.test(title)) return color
  }
  const hue = HUE_POOL[hashTitle(title) % HUE_POOL.length] ?? HUE_POOL[0]!
  return `hsl(${hue} 62% 45%)`
}
