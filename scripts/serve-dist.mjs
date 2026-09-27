/**
 * 托管构建产物的零依赖静态服务器。
 *
 * 用途：给自动化检查（Playwright / 无头浏览器）提供一个稳定的地址。
 *
 * 为什么不用 `vite preview`：Vite 依赖 esbuild 的服务子进程，在本机受限沙箱下会
 * EPERM（见 docs/ENVIRONMENT.md 根因 R3）。构建产物是纯静态文件，
 * 用 Node 内置 http 直接托管即可，**完全绕开构建工具**。
 *
 * 用法： node scripts/serve-dist.mjs [端口]
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DIST = path.join(ROOT, 'apps', 'web', 'dist')
const PORT = Number(process.argv[2] ?? 4173)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

if (!existsSync(DIST)) {
  console.error(`构建产物不存在：${DIST}\n请先执行 pnpm build`)
  process.exit(1)
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
  let pathname = decodeURIComponent(url.pathname)
  if (pathname === '/') pathname = '/index.html'

  let file = path.join(DIST, pathname)

  // 安全：不允许跳出 dist
  if (!file.startsWith(DIST)) {
    res.writeHead(403).end('403')
    return
  }

  try {
    const s = await stat(file)
    if (s.isDirectory()) file = path.join(file, 'index.html')
  } catch {
    // SPA 回退：找不到的路径交给 index.html
    file = path.join(DIST, 'index.html')
  }

  try {
    const body = await readFile(file)
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] ?? 'application/octet-stream',
      // 自动化检查时避免缓存干扰
      'cache-control': 'no-store',
    })
    res.end(body)
  } catch (err) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end(`404 ${pathname}\n${String(err)}`)
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`静态产物服务已启动: http://127.0.0.1:${PORT}/  (${DIST})`)
})
