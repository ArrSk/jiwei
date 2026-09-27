/**
 * 检查构建产物 CSS 里是否真的生成了指定的工具类。
 *
 * 为什么需要它：本项目踩过两次"源码里写了类名、产物里没有"的坑
 * （见 docs/DESIGN-VERSIONS.md 第八节：Tailwind 对跨包源码的扫描不可靠）。
 * 改完 UI 后跑一遍，比在浏览器里肉眼确认更早发现问题。
 *
 * 用法： node scripts/check-classes.mjs "max-w-[640px]" "min-h-[44px]" ...
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const ASSETS = path.join(ROOT, 'apps', 'web', 'dist', 'assets')

const wanted = process.argv.slice(2)
if (wanted.length === 0) {
  console.error('用法: node scripts/check-classes.mjs "<class>" [...]')
  process.exit(2)
}

const cssFile = readdirSync(ASSETS)
  .filter((f) => f.endsWith('.css'))
  .map((f) => path.join(ASSETS, f))
  .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]

if (!cssFile) {
  console.error('未找到构建产物 CSS，请先 pnpm build')
  process.exit(1)
}

const css = readFileSync(cssFile, 'utf8')
console.log(`检查 ${path.basename(cssFile)}（${css.length} 字节）\n`)

/**
 * Tailwind 会把类名里的特殊字符转义（`[` → `\[`、`%` → `\%`、`.` → `\.`）。
 * 因此把目标类名按同样规则转义后再做**子串**查找，避开正则转义地狱。
 */
function escapeLikeTailwind(name) {
  return name.replace(/[.[\]%()./:#,]/g, (c) => `\\${c}`)
}

let missing = 0
for (const name of wanted) {
  const needle = `.${escapeLikeTailwind(name)}`
  const found = css.includes(needle)
  if (!found) missing += 1
  console.log(`  ${found ? '✔' : '�’'} ${name}${found ? '' : '   ← 产物里没有！'}`)
}

console.log(
  missing === 0
    ? '\n全部已生成'
    : `\n有 ${missing} 个类未生成 —— 检查 Tailwind 的 @source 是否覆盖了该文件`,
)
process.exit(missing === 0 ? 0 : 1)
