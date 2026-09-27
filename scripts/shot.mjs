/**
 * 用系统已安装的 Edge/Chrome，通过 CDP（Chrome DevTools Protocol）截图 + 取页面信息。
 *
 * 为什么自己写而不用 Playwright：
 * 1. Playwright 需要下载 ~150MB 的 Chromium —— 本机网络不稳定，不现实。
 * 2. 系统已装 Edge，CDP 是浏览器原生协议，**零依赖**（Node 24 自带 WebSocket）。
 *
 * 用途：改完 UI 后自己"看一眼"，而不是每次都让用户拍照确认。
 *
 * 前置：需要一个能访问构建产物的地址（`node scripts/serve-dist.mjs` 或 vite dev）。
 *
 * ⚠️ 沙箱：与 vite/vitest 同样受限制 —— 浏览器进程创建需要更宽的文件访问权限，
 *    受限模式下会 EPERM（不得换法重试，按文档升级权限即可）。
 *
 * 用法：
 *   node scripts/shot.mjs --url http://127.0.0.1:4173/ --out shot.png --width 390 --height 1400
 *   node scripts/shot.mjs --url ... --probe        # 只输出页面结构信息，不截图
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const flag = (name) => args.includes(`--${name}`)

const URL_TO_OPEN = opt('url', 'http://127.0.0.1:4173/')
const OUT = opt('out', path.join(tmpdir(), 'jiwei-shot.png'))
const WIDTH = Number(opt('width', '390'))
const HEIGHT = Number(opt('height', '1400'))
const PROBE_ONLY = flag('probe')
const SETTLE_MS = Number(opt('settle', '2500'))

const CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
]

const browserPath = CANDIDATES.find((p) => existsSync(p))
if (!browserPath) {
  console.error('未找到 Edge/Chrome 可执行文件，尝试过：\n  ' + CANDIDATES.join('\n  '))
  process.exit(2)
}

const port = 9222 + Math.floor(Math.random() * 500)
const profile = mkdtempSync(path.join(tmpdir(), 'jiwei-cdp-'))

const child = spawn(
  browserPath,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${port}`,
    `--window-size=${WIDTH},${HEIGHT}`,
    'about:blank',
  ],
  { stdio: 'ignore', detached: false },
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getTarget() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`)
      const list = await res.json()
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) return page
    } catch {
      /* 端口还没起来，继续等 */
    }
    await sleep(250)
  }
  throw new Error('浏览器调试端口未就绪')
}

const target = await getTarget()
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true })
  ws.addEventListener('error', reject, { once: true })
})

let seq = 0
const pending = new Map()
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString())
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
  }
})

function send(method, params = {}) {
  const id = (seq += 1)
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
}

await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', {
  width: WIDTH,
  height: HEIGHT,
  deviceScaleFactor: 2,
  mobile: true,
})

await send('Page.navigate', { url: URL_TO_OPEN })
await sleep(SETTLE_MS)

/** 在页面里跑一段表达式并取回结果 */
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails))
  return r.result?.value
}

const probe = await evaluate(`(() => {
  const q = (s) => document.querySelector(s)
  const all = (s) => Array.from(document.querySelectorAll(s))
  const grid = q('.tg-grid > .grid') || q('.grid')
  const cells = all('.tg-cell')
  const blocks = all('.tg-grid .grid > div[style*="grid-column"]')
  const axis = all('.tg-cell')
    .filter((el) => (el.style.gridColumn || '') === '1')
    .slice(0, 4)
    .map((el) => el.textContent.trim())
  return {
    title: document.title,
    bodyText: (document.body.innerText || '').slice(0, 400),
    gridFound: !!grid,
    gridColumns: grid ? getComputedStyle(grid).gridTemplateColumns : null,
    cellCount: cells.length,
    blockCount: blocks.length,
    axisFirst4: axis,
    docScrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
  }
})()`)

console.log('=== 页面探针 ===')
console.log(JSON.stringify(probe, null, 2))

if (!PROBE_ONLY) {
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'))
  console.log(`\n截图已保存: ${OUT}`)
}

ws.close()
child.kill()
process.exit(0)
