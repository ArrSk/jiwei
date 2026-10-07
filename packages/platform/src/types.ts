/**
 * 能力适配层的契约（ADR-005 / docs/research/ALARM-STUDY.md）。
 *
 * 铁律：业务代码**不得直接调用 Web API**（`new Notification()`、`navigator.vibrate()` …），
 * 一律经这里。原因很具体：闹钟必须走原生系统调度，如果 Web 调用散落在业务代码里，
 * M5 接入 Capacitor 时就要全量翻改，而不是换一个实现。
 */

/** 平台能力探测结果。`false` 表示该能力在当前平台不可用，界面必须降级展示。 */
export interface Capabilities {
  /** 是否平台（web / pwa / native） */
  runtime: 'web' | 'native'
  /** 能否做"锁屏必响的闹钟"。**Web/PWA 恒为 false**（浏览器会冻结后台定时器） */
  canAlarm: boolean
  /** 应用不在前台时能否收到推送 */
  canBackgroundPush: boolean
  /** 能否震动 */
  canVibrate: boolean
  /** 能否设置应用角标 */
  canBadge: boolean
  /** 能否读写本地文件（导出备份、Markdown 笔记落盘） */
  canFilesystem: boolean
  /** 能否申请持久化存储（避免浏览器清理数据） */
  canPersistStorage: boolean
}

export type PermissionState = 'granted' | 'denied' | 'default' | 'unsupported'

export interface NotifyOptions {
  title: string
  body?: string
  /** 毫秒时间戳；不传表示立即 */
  at?: number
  tag?: string
}

export interface NotificationsAdapter {
  supported(): boolean
  permission(): Promise<PermissionState>
  requestPermission(): Promise<PermissionState>
  /**
   * 安排一条提醒（应用内）。
   * Web 实现依赖页面存活 —— 页面关闭后不会触发，这是平台限制，不是实现缺陷。
   * 返回取消函数。
   */
  schedule(options: NotifyOptions): () => void
  /** 立即发一条（用于自测/调试） */
  notifyNow(options: NotifyOptions): Promise<boolean>
}

/** 闹钟适配器。Web 实现永远返回"不支持"，并给出降级建议。 */
export interface AlarmAdapter {
  supported(): boolean
  /** 列出未来已排定的闹钟（原生实现走系统调度） */
  list(): Promise<Array<{ id: string; at: number; title: string }>>
  /** 排定一个闹钟。Web 端抛错并提示改用"提醒 + 系统日历" */
  schedule(options: { id: string; at: number; title: string; body?: string }): Promise<void>
  cancel(id: string): Promise<void>
}

export interface StorageAdapter {
  /** 申请持久化存储，降低被浏览器自动清理的风险（本地优先的关键保障） */
  requestPersistence(): Promise<boolean>
  persisted(): Promise<boolean>
  /** 用量估算，用于界面提示"还剩多少空间" */
  estimate(): Promise<{ usage: number; quota: number } | null>
}

export interface FilesAdapter {
  supported(): boolean
  /** 让用户下载一个文件（导出 JSON 备份 / CSV） */
  download(filename: string, content: string, mime?: string): void
}

/** 应用外壳状态：网络连接与“添加到主屏幕”入口。 */
export interface AppAdapter {
  isOnline(): boolean
  isInstalled(): boolean
  canInstall(): boolean
  subscribe(listener: () => void): () => void
  install(): Promise<'accepted' | 'dismissed' | 'unavailable'>
}

export interface Platform {
  capabilities: Capabilities
  notifications: NotificationsAdapter
  alarm: AlarmAdapter
  storage: StorageAdapter
  files: FilesAdapter
  app: AppAdapter
}
