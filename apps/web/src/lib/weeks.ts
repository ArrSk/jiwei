/**
 * 周次的展示与互转。
 *
 * 两处的需求不同，之前各写了一份、格式还不一致（一个 `1-16周`、一个 `1-16 周`）。
 * 统一放在这里，顺便给编辑表单提供一个**能被 parseWeeks 原样解析回去**的格式。
 */

/**
 * 给**展示**用的短格式：`1-16周`、`1-16单周`、`1,3,5周`。
 * 用在课表块与课程清单上 —— 空间小，越短越好。
 */
export function formatWeeks(weeks: number[]): string {
  if (weeks.length === 0) return ''
  const sorted = [...weeks].sort((a, b) => a - b)
  const last = sorted[sorted.length - 1] ?? 0
  const contiguous = sorted.every((w, i) => i === 0 || w === (sorted[i - 1] ?? 0) + 1)
  if (contiguous) return `${sorted[0]}-${last}周`

  const allOdd = sorted.every((w) => w % 2 === 1)
  const allEven = sorted.every((w) => w % 2 === 0)
  const expectedOdd = Array.from({ length: Math.ceil(last / 2) }, (_, i) => i * 2 + 1)
  if (allOdd && expectedOdd.length === sorted.length) return `1-${last}单周`
  if (allEven && sorted.length === Math.floor(last / 2)) return `1-${last}双周`

  return `${sorted.join(',')}周`
}

/**
 * 给**编辑表单**用的格式：必须能被 `CourseForm` 里的 `parseWeeks` 解析回同一组周次。
 *
 * 因此用 `1-16` / `1-16单` / `1-16双` / `1,3,5` 这种写法，
 * 而不是展示用的 `1-16周`（带"周"字 parseWeeks 会忽略，但单双周必须写成"单/双"）。
 */
export function weeksToFormText(weeks: number[]): string {
  if (weeks.length === 0) return ''
  const sorted = [...weeks].sort((a, b) => a - b)
  const last = sorted[sorted.length - 1] ?? 0
  const contiguous = sorted.every((w, i) => i === 0 || w === (sorted[i - 1] ?? 0) + 1)
  if (contiguous) return `${sorted[0]}-${last}`

  const allOdd = sorted.every((w) => w % 2 === 1)
  const allEven = sorted.every((w) => w % 2 === 0)
  const expectedOdd = Array.from({ length: Math.ceil(last / 2) }, (_, i) => i * 2 + 1)
  if (allOdd && expectedOdd.length === sorted.length) return `1-${last}单`
  if (allEven && sorted.length === Math.floor(last / 2)) return `1-${last}双`

  return sorted.join(',')
}

/**
 * 把用户输入的周次文本解析成周次数组。
 *
 * 支持的写法（三种可以混用，用逗号分隔）：
 * - `1-16`      连续范围
 * - `1-16单`    只留奇数周（也认 `单周`）
 * - `1,3,5,7`   逐个列举
 *
 * **跳过周次靠列举实现**（例如 `1-16` 里不想上第 5、6 周就写 `1-4,7-16`）：
 * 没有专门的"减掉某几周"界面，但语义上够用，且这个文本格式是用户可见、可复制的。
 *
 * 放在 lib 而不是页面组件里：课表表单与批量编辑都要用它，
 * 留在页面里会形成"组件 import 组件"的循环依赖。
 */
export function parseWeeks(text: string, totalWeeks: number): number[] {
  const raw = text.trim()
  if (!raw) return []
  const oddOnly = raw.includes('单')
  const evenOnly = raw.includes('双')
  const cleaned = raw.replace(/[单双周\s]/g, '')
  const weeks = new Set<number>()

  for (const part of cleaned.split(/[,，]/)) {
    if (!part) continue
    const range = part.match(/^(\d+)\s*[-~]\s*(\d+)$/)
    if (range) {
      const from = Number(range[1])
      const to = Number(range[2])
      for (let w = Math.min(from, to); w <= Math.max(from, to); w += 1) weeks.add(w)
      continue
    }
    if (/^\d+$/.test(part)) weeks.add(Number(part))
  }

  return [...weeks]
    .filter((w) => w >= 1 && w <= totalWeeks)
    .filter((w) => (oddOnly ? w % 2 === 1 : true))
    .filter((w) => (evenOnly ? w % 2 === 0 : true))
    .sort((a, b) => a - b)
}

/**
 * 从确定性场次 id 里取回起始节次。
 *
 * id 形如 `occ_<blockId>#<date>#<periodStart>`（见 `@jiwei/core` 的 occurrenceId）。
 * 课表网格、日视图都要用它来定位"第几节"，因此放在共用位置。
 */
export function periodStartOf(occurrenceId: string): number {
  const last = occurrenceId.split('#').pop()
  const n = Number(last)
  return Number.isFinite(n) ? n : 0
}
