#!/usr/bin/env node
/**
 * 一键保存到 GitHub。
 *
 * 做的事：把当前改动记入版本库 → 推送到 GitHub，然后打印结果。
 * 用中文说清每一步，给不懂技术的人用。
 *
 * 用法：
 *   node scripts/save.mjs "把课表表格的分割线调淡了"
 *   node scripts/save.mjs                  # 不写说明则自动生成一句
 *
 * 令牌不用你操心：Windows 已经记住了 GitHub 登录凭证，
 * 推送时 git 会自动取用，不会弹窗要密码。
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** 跑一条 git 命令；失败时把 git 的真实报错带出来 */
function git(args, { quiet = false } = {}) {
  try {
    return execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: quiet ? ['ignore', 'pipe', 'ignore'] : ['ignore', 'inherit', 'inherit'],
    })
  } catch (err) {
    if (err.code === 'EPERM') {
    console.error(`
✘ 无法启动 git（系统权限被限制）

  这是本机运行环境的限制，不是项目的问题。
  请在普通 PowerShell 窗口里自己执行下面的命令：

    cd ${ROOT}
    git add -A
    git commit -m "你的说明"
    git push
`)
      process.exit(3)
    }
    throw err
  }
}

const rawMessage = process.argv.slice(2).join(' ').trim()

console.log('\n正在保存到 GitHub…\n')

// 1) 看有没有改动
const status = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim()
if (!status) {
  console.log('  没有需要保存的改动 —— 本地已经是最新的。')

  // 顺便看是否已推送到位
  const branch = execFileSync('git', ['branch', '--show-current'], { cwd: ROOT, encoding: 'utf8' }).trim()
  const localHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim()
  let remoteHead = ''
  try {
    remoteHead = execFileSync('git', ['rev-parse', `origin/${branch}`], {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim()
  } catch {
    /* 没有远程分支 */
  }

  if (remoteHead && remoteHead !== localHead) {
    console.log('  但本地有提交还没推到 GitHub，正在推送…\n')
    git(['push', 'origin', branch])
    console.log('\n✔ 推送完成')
  } else {
    console.log('  GitHub 上也已经是最新的。')
  }
  console.log('')
  process.exit(0)
}

// 2) 列出将保存的文件（最多 10 个）
const changed = status.split('\n').filter(Boolean)
console.log(`  这次要保存 ${changed.length} 个文件的改动：`)
for (const l of changed.slice(0, 10)) console.log(`    ${l}`)
if (changed.length > 10) console.log(`    …… 还有 ${changed.length - 10} 个`)

// 3) 生成提交说明
const stamp = new Date().toLocaleString('zh-CN', { hour12: false })
const message = rawMessage || `保存于 ${stamp} 的改动（${changed.length} 个文件）`

// 4) 提交
git(['add', '-A'])
git(['commit', '-m', message, '--quiet'])
console.log(`\n  ✔ 已记入版本库：${message}`)

// 5) 推送（带重试）
//
// 本机到 github.com 的连接**不稳定**（间歇性 connection reset / 连接超时，
// 实测常在第 2~3 次才成功）。因此这里自动重试，而不是让用户手工再跑一遍。
const branch = execFileSync('git', ['branch', '--show-current'], { cwd: ROOT, encoding: 'utf8' }).trim()
console.log(`\n  正在推送到 GitHub（分支 ${branch}）…`)

const MAX_TRIES = 5
let pushed = false
for (let attempt = 1; attempt <= MAX_TRIES; attempt += 1) {
  try {
    execFileSync('git', ['push', 'origin', branch], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    pushed = true
    if (attempt > 1) console.log(`  ✔ 第 ${attempt} 次尝试推送成功`)
    break
  } catch (err) {
    const detail = String(err.stderr ?? err.message ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(-1)[0]
    if (attempt === MAX_TRIES) {
      console.log(`  ✘ 连续 ${MAX_TRIES} 次推送失败`)
      console.log(`    最后一次的错误：${detail}`)
      console.log(`\n  改动**已经提交到本地**，没有丢失。网络恢复后执行下面这行即可补推：`)
      console.log(`\n    cd ${ROOT}`)
      console.log(`    git push\n`)
      process.exit(4)
    }
    const wait = attempt * 6
    console.log(`  第 ${attempt} 次失败（${detail || '网络错误'}），${wait} 秒后重试…`)
    await new Promise((r) => setTimeout(r, wait * 1000))
  }
}

if (pushed) {
  console.log('\n✔ 全部完成 —— 代码已保存到 GitHub')
  console.log('  查看地址：https://github.com/ArrSk/jiwei\n')
}
