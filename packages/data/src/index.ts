/**
 * @jiwei/data —— 几微数据层。
 *
 * 对外只暴露**仓储接口 + 引擎工厂**（ADR-007）：
 *
 * ```ts
 * const repos = createRepos(createDexieEngine())
 * await bootstrap(repos)
 * const courses = await repos.blocks.listCourses()
 * ```
 *
 * 将来换 SQLite 或接服务端同步 → 换 `createRepos()` 的入参，上层零改动。
 */
export * from './types'
export * from './ids'
export * from './seed'
export * from './schedule'
export { createDatabase, JiweiDatabase, DB_VERSION, type OccurrenceRow } from './engine/dexie/db'
export { createDexieRepos } from './engine/dexie/repos'

import { createDatabase, type JiweiDatabase } from './engine/dexie/db'
import { createDexieRepos } from './engine/dexie/repos'
import type { Repos } from './types'

export interface Engine {
  kind: 'dexie' | 'sqlite'
  db: JiweiDatabase
}

/** 创建 IndexedDB 引擎（首版默认） */
export function createDexieEngine(dbName?: string): Engine {
  return { kind: 'dexie', db: createDatabase(dbName) }
}

/** 工厂：把引擎装配成仓储集合。**web 层唯一需要认识的存储入口**。 */
export function createRepos(engine: Engine): Repos {
  return createDexieRepos(engine.db)
}
