/** 阅读偏好放在 meta 中，随全量备份一起保存，不影响课程或课次。 */
import { z } from 'zod'
import type { Repos } from './types'

const AppearanceSchema = z.object({
  readingSize: z.enum(['standard', 'large']).default('standard'),
  density: z.enum(['compact', 'comfortable']).default('compact'),
})
export type Appearance = z.infer<typeof AppearanceSchema>
const KEY = 'appearance:v1'
export const defaultAppearance = (): Appearance => ({ readingSize: 'standard', density: 'compact' })

export async function loadAppearance(repos: Repos): Promise<Appearance> {
  const raw = await repos.meta.get(KEY)
  if (!raw) return defaultAppearance()
  try {
    const result = AppearanceSchema.safeParse(JSON.parse(raw))
    return result.success ? result.data : defaultAppearance()
  } catch {
    return defaultAppearance()
  }
}

export async function saveAppearance(repos: Repos, value: Appearance): Promise<void> {
  await repos.meta.set(KEY, JSON.stringify(AppearanceSchema.parse(value)))
}
