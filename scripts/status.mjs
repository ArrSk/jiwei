/**
 * 项目状态速查（给不懂技术的人看）。
 *
 * 一条命令看清：当前分支、最近一次改动、有没有未保存的改动、本地和 GitHub 是否一致。
 * 纯只读，不改任何东西。
 *
 * 实现上刻意**不启动 git 命令**，而是直接读 `.git` 目录里的文件：
 * 本机环境禁止 Node 启动外部程序（EPERM），启动 git 会失败；
 * 直接读文件则任何环境都能跑，也更快。
 *
 * 用法： node scripts/status.mjs
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const GIT = path.join(ROOT, '.git')

const out = (label, value) => console.log(`  ${label.padEnd(14)}${value}`)

/** 读文本文件，失败返回 null */
function readText(p) {
  try {
    return readFileSync(p, 'utf8')
  } catch {
    return null
  }
}

/** 解压并解析一个 git 对象；返回 {type, body} 或 null */
function readObject(hash) {
  if (!hash || !/^[0-9a-f]{4,40}$/i.test(hash)) return null
  const p = path.join(GIT, 'objects', hash.slice(0, 2), hash.slice(2))
  try {
    const raw = inflateSync(readFileSync(p))
    const nul = raw.indexOf(0)
    if (nul < 0) return null
    const header = raw.subarray(0, nul).toString('utf8')
    const [type] = header.split(' ')
    return { type, body: raw.subarray(nul + 1).toString('utf8') }
  } catch {
    return null
  }
}

/** 解析 HEAD，得到当前分支名与提交号 */
function readHead() {
  const head = readText(path.join(GIT, 'HEAD'))
  if (!head) return null
  const ref = head.trim()
  if (ref.startsWith('ref: ')) {
    const refPath = ref.slice(5).trim()
    const hash = readText(path.join(GIT, refPath))?.trim() ?? null
    return { branch: refPath.replace('refs/heads/', ''), hash }
  }
  return { branch: '（游离状态）', hash: ref }
}

/** 解析一条 commit 对象，取出作者与说明 */
function parseCommit(hash) {
  const obj = readObject(hash)
  if (!obj || obj.type !== 'commit') return null
  const [headers, ...rest] = obj.body.split('\n\n')
  const lines = headers.split('\n')
  const parent = lines.find((l) => l.startsWith('parent '))?.slice(7).trim() ?? null
  const author = lines.find((l) => l.startsWith('author '))?.slice(7) ?? ''
  // author 形如：名字 <邮箱> 1758888888 +0800
  const match = author.match(/^(.*?) <(.*?)> (\d+) ([+-]\d{4})$/)
  const epoch = match ? Number(match[3]) : null
  const subject = (rest.join('\n\n').split('\n')[0] ?? '').trim()
  return {
    parent,
    author: match?.[1] ?? '(未知)',
    email: match?.[2] ?? '',
    date: epoch ? new Date(epoch * 1000) : null,
    subject,
  }
}

/** 从 HEAD 往回走，数出提交总数（封顶防止异常数据卡死） */
function countCommits(startHash, cap = 5000) {
  let n = 0
  let cur = startHash
  while (cur && n < cap) {
    const c = parseCommit(cur)
    if (!c) break
    n += 1
    cur = c.parent
  }
  return n
}

console.log('\n几微 · 项目状态\n')

if (!existsSync(GIT)) {
  out('版本库', '不存在 ← 这个目录没有 .git，无法查看状态')
  console.log('')
  process.exit(0)
}

const head = readHead()
if (!head?.hash) {
  out('提交记录', '还没有任何提交')
  console.log('')
  process.exit(0)
}

out('当前分支', head.branch)
out('本地版本', head.hash.slice(0, 7))

const commit = parseCommit(head.hash)
if (commit) {
  const when = commit.date ? commit.date.toLocaleString('zh-CN', { hour12: false }) : '（未知时间）'
  out('最近一次', `${commit.subject.slice(0, 40)}`)
  out('提交时间', when)
  out('提交人', `${commit.author}${commit.email ? ` <${commit.email}>` : ''}`)
}

const total = countCommits(head.hash)
out('提交总数', total >= 5000 ? '5000+ 次' : `${total} 次`)

// 与 GitHub 上的版本对比（读本地缓存的远程引用，不联网）
const remoteRef = readText(path.join(GIT, 'refs', 'remotes', 'origin', head.branch))?.trim()
if (remoteRef) {
  out('线上版本', remoteRef.slice(0, 7))
  if (remoteRef === head.hash) {
    out('同步情况', '一致 ✅ 本地和 GitHub 内容相同')
  } else {
    // 判断谁领先：远程那个提交是否在本地的祖先链上
    let cur = head.hash
    let localAhead = 0
    let found = false
    while (cur && localAhead < 500) {
      if (cur === remoteRef) {
        found = true
        break
      }
      const c = parseCommit(cur)
      if (!c) break
      cur = c.parent
      localAhead += 1
    }
    out(
      '同步情况',
      found
        ? `本地领先 ${localAhead} 次 ← 有新改动还没推到 GitHub`
        : '两边不一致 ← 需要推送或拉取（详情可跑 git status）',
    )
  }
} else {
  out('线上版本', '未记录 ← 还没推送过，或还没执行 git fetch')
}

// 工作区是否有未提交改动（用文件修改时间与 git 索引对比，纯文件读取）
const indexMtime = existsSync(path.join(GIT, 'index')) ? statSync(path.join(GIT, 'index')).mtimeMs : 0
const trackedDirs = ['apps', 'packages', 'docs', 'scripts']
let newerThanIndex = 0
function walk(dir, depth = 0) {
  if (depth > 6) return
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walk(full, depth + 1)
    else {
      try {
        if (statSync(full).mtimeMs > indexMtime) newerThanIndex += 1
      } catch {
        /* 忽略 */
      }
    }
  }
}
for (const d of trackedDirs) {
  const full = path.join(ROOT, d)
  if (existsSync(full)) walk(full)
}
out(
  '未提交改动',
  newerThanIndex === 0 ? '似乎没有 ✅' : `约 ${newerThanIndex} 个文件比上次提交更新 ← 可能还没提交`,
)

// 关键目录与依赖
const mustHave = ['package.json', 'apps/web', 'packages/core', 'packages/data', 'docs']
const missing = mustHave.filter((p) => !existsSync(path.join(ROOT, p)))
out('项目完整性', missing.length === 0 ? '正常 ✅' : `缺少 ${missing.join('、')}`)
out('依赖是否已装', existsSync(path.join(ROOT, 'node_modules')) ? '是 ✅' : '否 ← 需要跑 pnpm install')

console.log('')
