/**
 * 构建产物冒烟检查（零依赖，不需要浏览器）。
 *
 * 检查"打包之后还活着"这件事有没有被破坏：
 *   1. dist 目录与 index.html 存在
 *   2. index.html 引用的 JS / CSS 文件都真实存在
 *   3. 关键样式类真的进了产物 CSS
 *   4. PWA 必需文件（manifest / sw.js）已生成
 *   5. manifest 里 display 是 standalone（iOS 上这直接影响数据是否会被清理）
 *
 * 为什么需要它：本项目踩过"源码里写了、产物里没有"的坑
 * （Tailwind 跨包扫描，见 docs/DESIGN-VERSIONS.md 第八节）。
 * 跑一遍 3 秒，比在浏览器里肉眼确认更早发现问题。
 *
 * 用法： node scripts/smoke.mjs        （需先 pnpm build）
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DIST = path.join(ROOT, 'apps', 'web', 'dist')

const checks = []
const ok = (name, pass, detail = '') => checks.push({ name, pass, detail })

if (!existsSync(DIST)) {
  console.error('构建产物不存在，请先执行：pnpm build')
  process.exit(1)
}

// 1. 入口文件
const indexPath = path.join(DIST, 'index.html')
const hasIndex = existsSync(indexPath)
ok('dist/index.html 存在', hasIndex)
if (!hasIndex) {
  console.error('缺少 index.html，无法继续检查')
  process.exit(1)
}
const html = readFileSync(indexPath, 'utf8')

// 2. index.html 引用的资源是否都在
const refs = [...html.matchAll(/(?:src|href)="\.?\/?(assets\/[^"]+)"/g)].map((m) => m[1])
ok('index.html 引用了构建资源', refs.length > 0, `${refs.length} 个`)
for (const ref of refs) {
  ok(`资源存在: ${ref}`, existsSync(path.join(DIST, ref)))
}

// 2b. 资源必须用**相对路径**引用。
// 部署到 GitHub Pages 时页面在 `用户名.github.io/jiwei/`，
// 绝对路径 `/assets/...` 会指向域名根目录 → JS/CSS 全部 404 → 页面白屏。
const allRefs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((r) => !/^(https?:)?\/\//.test(r) && !r.startsWith('data:'))
const absoluteRefs = allRefs.filter((r) => r.startsWith('/'))
ok(
  '资源引用使用相对路径（部署到子目录不会白屏）',
  absoluteRefs.length === 0,
  absoluteRefs.length === 0 ? `${allRefs.length} 个引用均为相对路径` : `绝对路径: ${absoluteRefs.join(', ')}`,
)

// 3. 关键样式类（改 UI 后最容易"以为生效其实没生成"）
const cssFiles = readdirSync(path.join(DIST, 'assets')).filter((f) => f.endsWith('.css'))
const css = cssFiles
  .map((f) => readFileSync(path.join(DIST, 'assets', f), 'utf8'))
  .join('\n')

/** Tailwind 会转义特殊字符，按同样规则匹配 */
const tw = (name) => `.${name.replace(/[.[\]%()./:#,]/g, (c) => `\\${c}`)}`
const mustHaveClasses = [
  'tg-cell', // 网格格子
  'tg-cell--alt', // 隔行浅色
  'tg-cell--today', // 今日列
  'min-h-[44px]', // 手机触摸目标
  'max-w-[640px]', // 表单弹层宽度
]
for (const cls of mustHaveClasses) {
  ok(`样式类已生成: ${cls}`, css.includes(tw(cls)))
}

// 4. PWA 文件
for (const f of ['manifest.webmanifest', 'sw.js']) {
  ok(`PWA 文件存在: ${f}`, existsSync(path.join(DIST, f)))
}

// 5. manifest 关键字段
const manifestPath = path.join(DIST, 'manifest.webmanifest')
if (existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    // display: standalone 不只是"看起来像 App" ——
    // WebKit 明确：加到主屏的 Web App 有独立的存储计数，不会被 ITP 清理
    ok('manifest.display = standalone', manifest.display === 'standalone', String(manifest.display))
    ok('manifest 有 name', Boolean(manifest.name), String(manifest.name ?? ''))
  } catch (err) {
    ok('manifest 可解析', false, String(err))
  }
}

// 6. 产物体积（防止误把大文件打进包）
const totalKb = readdirSync(path.join(DIST, 'assets')).reduce((sum, f) => {
  const p = path.join(DIST, 'assets', f)
  return statSync(p).isFile() ? sum + statSync(p).size : sum
}, 0)
ok('产物体积合理（< 3MB）', totalKb < 3 * 1024 * 1024, `${(totalKb / 1024).toFixed(0)} KB`)

// 汇总
console.log('\n构建产物冒烟检查\n')
let failed = 0
for (const c of checks) {
  if (!c.pass) failed += 1
  console.log(`  ${c.pass ? '✔' : '✘'} ${c.name}${c.detail ? `  (${c.detail})` : ''}`)
}
console.log(
  failed === 0 ? `\n全部通过（${checks.length} 项）` : `\n有 ${failed} 项失败`,
)
process.exit(failed === 0 ? 0 : 1)
