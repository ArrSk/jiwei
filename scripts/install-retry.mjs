#!/usr/bin/env node
/**
 * 反复执行 `pnpm install` 直到成功。
 *
 * 为什么需要它：本机到 npm registry 的 TLS 连接不稳定，单次 install 常在中途
 * 因元数据请求超时而失败。但**已下载的包会进入 pnpm store 并被复用**，
 * 所以反复执行会逐步推进，最终收敛。
 *
 * 用法：node scripts/install-retry.mjs [最大轮数]
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const maxRounds = Number(process.argv[2] ?? 10)
const root = fileURLToPath(new URL('..', import.meta.url))

for (let round = 1; round <= maxRounds; round += 1) {
  console.log(`\n=== pnpm install 第 ${round}/${maxRounds} 轮 ===`)
  const result = spawnSync('pnpm', ['install', '--reporter=append-only'], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  })

  if (result.status === 0) {
    console.log(`\n安装成功（第 ${round} 轮）。`)
    process.exit(0)
  }

  console.log(`第 ${round} 轮失败（退出码 ${result.status}），继续重试…`)
}

console.error(`\n连续 ${maxRounds} 轮仍未成功。可以稍后重跑本脚本（已下载的包会被复用）。`)
process.exit(1)
