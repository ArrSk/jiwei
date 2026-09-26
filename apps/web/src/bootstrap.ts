/**
 * 几微 —— 应用引导。
 *
 * 这里是"存储 + 能力"两个适配层的**唯一装配点**：
 * - 存储：`createRepos(createDexieEngine())`。将来换 SQLite 或接服务端同步，只改这一行（ADR-007）。
 * - 能力：`getPlatform()`。M5 接入原生时，只改 platform 包内部的实现（ADR-005）。
 */
import { bootstrap, createDexieEngine, createRepos, type Repos } from '@jiwei/data'
import { getPlatform, type Platform } from '@jiwei/platform'

export interface JiweiRuntime {
  repos: Repos
  platform: Platform
}

/**
 * 幂等的初始化。StrictMode 下 React 会挂载两次副作用，这里缓存同一个 Promise，
 * 保证 `bootstrap()`（首次创建学期与作息）只执行一次。
 */
let cached: Promise<JiweiRuntime> | null = null

export function initJiwei(): Promise<JiweiRuntime> {
  if (!cached) {
    cached = (async () => {
      const repos = createRepos(createDexieEngine())
      await bootstrap(repos)
      const platform = getPlatform()
      // 请求持久化存储：降低浏览器自动清理数据的风险（本地优先的关键保障，ADR-002）
      if (platform.capabilities.canPersistStorage) {
        void platform.storage.requestPersistence()
      }
      return { repos, platform }
    })().catch((err: unknown) => {
      // 失败不要缓存，允许用户点"重试"
      cached = null
      throw err
    })
  }
  return cached
}
