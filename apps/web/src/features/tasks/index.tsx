import { ListIcon } from '@jiwei/ui'
import type { FeatureModule } from '@jiwei/ui'
import { TasksPage } from './TasksPage'

export const tasksModule: FeatureModule = {
  id: 'tasks',
  title: '待办',
  icon: ListIcon,
  order: 30,
  render: TasksPage,
}
