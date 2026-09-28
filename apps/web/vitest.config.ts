import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))

/**
 * 只跑**纯逻辑**的单元测试（周次解析、格式化这类）。
 *
 * 刻意不引 jsdom / Testing Library：那会把依赖和启动成本拉高一大截，
 * 而当前值得单测的恰好都是不碰 DOM 的纯函数。等做端到端时再单独引 Playwright。
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@jiwei/core': path.resolve(root, '../../packages/core/src/index.ts'),
      '@jiwei/data': path.resolve(root, '../../packages/data/src/index.ts'),
      '@jiwei/ui': path.resolve(root, '../../packages/ui/src/index.ts'),
      '@jiwei/platform': path.resolve(root, '../../packages/platform/src/index.ts'),
    },
  },
})
