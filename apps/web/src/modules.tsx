/**
 * 模块注册表（ADR-005）。
 *
 * 静态导入全部模块，保持类型安全与 tree-shaking（不用动态扫描目录）。
 * 加模块 = 加一行 import + 加一行数组元素。
 */
import type { FeatureModule } from '@jiwei/ui'
import { ListIcon } from '@jiwei/ui'
import { timetableModule } from './features/timetable'
import { agendaModule } from './features/plan'
import { todayModule } from './features/today'
import { settingsModule } from './shell/settingsModule'
import { ComingSoonPage } from './shell/ComingSoonPage'
import { tasksModule } from './features/tasks'

const placeholder = (id: string, title: string, stage: string, order: number): FeatureModule => ({ id, title, icon: ListIcon, order, render: () => <ComingSoonPage title={title} stage={stage} /> })

export const modules: FeatureModule[] = [
  todayModule,
  timetableModule,
  agendaModule,
  tasksModule,
  placeholder('ledger', '记账', 'M5', 40),
  placeholder('notes', '笔记', 'M7', 50),
  placeholder('assistant', 'AI 助手', 'M8', 60),
  settingsModule,
].sort((a, b) => a.order - b.order)

export function findModule(id: string): FeatureModule | undefined {
  return modules.find((m) => m.id === id)
}
