/**
 * 模块契约（ADR-005）—— "以后加很多功能而不用重构"的落地机制。
 *
 * 每个功能（课表、日程、任务、笔记…）导出**一个** `FeatureModule`，
 * 外壳据此生成导航与首页 widget 网格。加模块 = 加一个目录 + 加一行注册。
 *
 * 约束：feature 之间禁止互相 import；跨模块协作走 `@jiwei/core` 类型与 `@jiwei/data` 仓储。
 */
import type { ComponentType, ReactNode } from 'react'

/** 首页可放置的卡片（widget） */
export interface WidgetDef {
  id: string
  title: string
  /** 排序权重，小的靠前 */
  order?: number
  /** 卡片尺寸，供首页网格做粗粒度排版 */
  span?: 1 | 2
  render: () => ReactNode
}

export interface FeatureModule {
  /** 稳定标识，用于持久化"用户隐藏了哪些模块" */
  id: string
  /** 导航里显示的名字 */
  title: string
  icon: ComponentType<{ className?: string }>
  order: number
  /** 独立页面渲染入口（M0 不做路由，外壳直接渲染当前模块） */
  render: ComponentType
  widgets?: WidgetDef[]
  /** 模块被挂载时执行一次（注册查询、迁移等） */
  setup?: () => void | Promise<void>
}

/** 外壳状态：当前选中的模块 */
export interface ShellState {
  activeModuleId: string
  setActiveModuleId: (id: string) => void
}
