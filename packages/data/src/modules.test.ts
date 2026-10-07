import { afterEach, describe, expect, it } from 'vitest'
import { bootstrap, createDexieEngine, createRepos, type Engine, type Repos } from './index'
import { defaultModulePreferences, loadModulePreferences, saveModulePreferences } from './modules'

let engines: Engine[] = []
function fresh(): Repos {
  const engine = createDexieEngine(`jiwei_modules_${Math.random().toString(36).slice(2, 8)}`)
  engines.push(engine)
  return createRepos(engine)
}
afterEach(async () => {
  for (const engine of engines) { engine.db.close(); await engine.db.delete() }
  engines = []
})

describe('module preferences', () => {
  it('默认只开放课程表和日程', async () => {
    const repos = fresh()
    await bootstrap(repos, { startDate: '2026-09-28' })
    expect(await loadModulePreferences(repos)).toEqual(defaultModulePreferences())
  })

  it('保存后可以分别关闭课程表和计划', async () => {
    const repos = fresh()
    await bootstrap(repos, { startDate: '2026-09-28' })
    await saveModulePreferences(repos, { ...defaultModulePreferences(), timetable: false, agenda: false })
    const saved = await loadModulePreferences(repos)
    expect(saved.agenda).toBe(false)
    expect(saved.timetable).toBe(false)
  })

  it('损坏的设置会安全回退默认值', async () => {
    const repos = fresh()
    await bootstrap(repos, { startDate: '2026-09-28' })
    await repos.meta.set('modules:v1', '{bad json')
    expect(await loadModulePreferences(repos)).toEqual(defaultModulePreferences())
  })
})
