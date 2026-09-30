/**
 * 构建产物冒烟检查（零依赖，不需要浏览器）。
 *
 * 检查"打包之后还活着"这件事有没有被破坏：
 *   1. dist 目录与 index.html 存在
 *   2. index.html 引用的 JS / CSS 文件都真实存在
 *   3. 关键样式类真的进了产物 CSS
 *   4. PWA 必需文件（manifest / sw.js）已生成
 *   5. manifest 里 display 是 standalone（iOS 上这直接影响数据是否会被清理）
 *   6. manifest 的 start_url 是相对路径、图标真的存在、iOS 图标标签已声明
 *
 * 为什么需要它：本项目踩过"源码里写了、产物里没有"的坑
 * （Tailwind 跨包扫描，见 docs/DESIGN-VERSIONS.md 第八节），
 * 也踩过"本地完全正常、部署到子目录就坏"的坑
 * （manifest.start_url 写成 `/`，iPhone 加到主屏幕后点开是 404）。
 * 跑一遍 3 秒，比在真机上肉眼确认更早发现问题。
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
/**
 * 这些类必须在产物 CSS 里，否则说明样式没生效。
 * 改版时若删掉某个类，记得同步这里 —— 否则会出现"检查通过但其实样式丢了"的假象。
 */
const mustHaveClasses = [
  'tg-cell', // 网格格子（透明底，横向淡线）
  'tg-cell--today', // 今日列的极淡着色
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

    /*
     * ★ start_url 必须是相对路径。
     *
     * 这是"添加到主屏幕后用不了"的根因，踩过一次：
     * 写成 `/` 时本地开发完全正常（应用就在根目录），
     * 但部署到 GitHub Pages 子目录后，点桌面图标会打开
     * `https://用户名.github.io/` —— 那是账号根目录，404。
     * 而且 `/` 落在 scope（`/jiwei/`）之外，manifest 会被判为不适用。
     *
     * 所以这里断言：既不能是绝对路径，也不能跑出 scope。
     */
    const startUrl = String(manifest.start_url ?? '')
    ok(
      'manifest.start_url 是相对路径（子目录部署不会点开死页面）',
      startUrl !== '' && !startUrl.startsWith('/') && !/^https?:/i.test(startUrl),
      startUrl || '(缺失)',
    )
    const scope = String(manifest.scope ?? './')
    ok(
      'manifest.start_url 落在 scope 内',
      startUrl === '' || scope === './' || startUrl.startsWith(scope),
      `scope=${scope}`,
    )

    // 图标必须真的存在：曾经声明了两个图标但 public/ 下从来没有它们，
    // 线上一直 404，导致桌面图标是空白的
    const icons = Array.isArray(manifest.icons) ? manifest.icons : []
    ok('manifest 声明了图标', icons.length > 0, `${icons.length} 个`)
    for (const icon of icons) {
      const src = String(icon?.src ?? '')
      if (!src) {
        ok('图标 src 非空', false)
        continue
      }
      const iconPath = path.join(DIST, src)
      const exists = existsSync(iconPath)
      // 只判断存在还不够：一个 0 字节的占位文件也能"存在"
      const size = exists ? statSync(iconPath).size : 0
      ok(
        `图标存在且非空: ${src}${icon?.purpose ? ` (${icon.purpose})` : ''}`,
        exists && size > 1024,
        exists ? `${size} bytes` : '缺失',
      )
    }
  } catch (err) {
    ok('manifest 可解析', false, String(err))
  }
}

// 5b. iOS 主屏幕图标：manifest 里的 icons 在 iOS 上不怎么管用，
// 不写 apple-touch-icon 的话 iOS 会把页面截图当图标
ok(
  'index.html 声明了 apple-touch-icon（否则 iOS 用页面截图当图标）',
  /rel="apple-touch-icon"/.test(html),
)
ok(
  'apple-touch-icon.png 已生成',
  existsSync(path.join(DIST, 'apple-touch-icon.png')),
)
ok(
  'index.html 声明了 apple-mobile-web-app-capable',
  /name="apple-mobile-web-app-capable"/.test(html),
)

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
