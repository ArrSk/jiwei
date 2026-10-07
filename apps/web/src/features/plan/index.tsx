import { ListIcon, type FeatureModule } from '@jiwei/ui'
import { PlannerPage } from './PlannerPage'

export const agendaModule: FeatureModule = {
  id: 'agenda',
  title: '计划',
  icon: ListIcon,
  order: 20,
  render: PlannerPage,
}
