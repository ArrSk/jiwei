import { z } from 'zod'
import type { Repos } from './types'

/** 官方模块的稳定 id。插件接入时可在此基础上扩展自己的命名空间。 */
export const ModuleId = z.enum(['today', 'timetable', 'agenda', 'tasks', 'ledger', 'notes', 'assistant', 'settings'])
export type ModuleId = z.infer<typeof ModuleId>

const PreferencesSchema = z.partialRecord(ModuleId, z.boolean())
export type ModulePreferences = Record<ModuleId, boolean>

const KEY = 'modules:v1'

export const defaultModulePreferences = (): ModulePreferences => ({
  today: true,
  timetable: true,
  agenda: true,
  tasks: true,
  ledger: false,
  notes: false,
  assistant: false,
  settings: true,
})

export async function loadModulePreferences(repos: Repos): Promise<ModulePreferences> {
  const defaults = defaultModulePreferences()
  const raw = await repos.meta.get(KEY)
  if (!raw) return defaults
  try {
    const parsed = PreferencesSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return defaults
    return { ...defaults, ...parsed.data, settings: true }
  } catch {
    return defaults
  }
}

export async function saveModulePreferences(repos: Repos, value: ModulePreferences): Promise<void> {
  await repos.meta.set(KEY, JSON.stringify({ ...defaultModulePreferences(), ...PreferencesSchema.parse(value), settings: true }))
}
