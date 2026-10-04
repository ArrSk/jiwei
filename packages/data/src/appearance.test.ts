import { afterEach, describe, expect, it } from 'vitest'
import { bootstrap, createDexieEngine, createRepos, type Engine, type Repos } from './index'
import { defaultAppearance, loadAppearance, saveAppearance } from './appearance'

let engines: Engine[] = []
function fresh(): Repos {
  const engine = createDexieEngine(`jiwei_appearance_${Math.random().toString(36).slice(2, 8)}`)
  engines.push(engine)
  return createRepos(engine)
}
afterEach(async () => {
  for (const engine of engines) {
    engine.db.close()
    await engine.db.delete()
  }
  engines = []
})

describe('appearance preferences', () => {
  it('没有设置时返回默认值', async () => {
    const repos = fresh()
    await bootstrap(repos, { startDate: '2026-09-28' })
    expect(await loadAppearance(repos)).toEqual(defaultAppearance())
  })

  it('保存后可以读回字号和密度', async () => {
    const repos = fresh()
    await bootstrap(repos, { startDate: '2026-09-28' })
    await saveAppearance(repos, { readingSize: 'large', density: 'comfortable' })
    expect(await loadAppearance(repos)).toEqual({ readingSize: 'large', density: 'comfortable' })
  })

  it('损坏的设置会安全回退默认值', async () => {
    const repos = fresh()
    await bootstrap(repos, { startDate: '2026-09-28' })
    await repos.meta.set('appearance:v1', '{bad json')
    expect(await loadAppearance(repos)).toEqual(defaultAppearance())
  })
})
