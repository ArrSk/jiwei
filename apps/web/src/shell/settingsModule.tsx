import { SettingsIcon, type FeatureModule } from '@jiwei/ui'
import { SettingsModulePage } from './SettingsModulePage'

export const settingsModule: FeatureModule = {
  id: 'settings',
  title: '设置',
  icon: SettingsIcon,
  order: 90,
  render: SettingsModulePage,
}
