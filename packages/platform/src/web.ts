/**
 * Web 实现。
 *
 * 刻意把"Web 做不到的事"如实暴露：
 * - `canAlarm: false` —— 浏览器会冻结后台定时器，且 Web Push 无权响铃/震动/绕过静音。
 *   所以 Web 端的产品文案是"提醒"，不是"闹钟"（docs/ALARM-STUDY.md 第 6 节结论 2）。
 * - `schedule()` 只是页面内定时器：页面关掉就不响，这也必须让用户知道。
 * 原生实现在 M5 用 Capacitor 补上，接口不变。
 */
import type {
  AlarmAdapter,
  Capabilities,
  FilesAdapter,
  NotificationsAdapter,
  NotifyOptions,
  PermissionState,
  Platform,
  StorageAdapter,
} from './types'

function detectCapabilities(): Capabilities {
  const hasWindow = typeof window !== 'undefined'
  return {
    runtime: 'web',
    // ★ 关键：Web 永远不能承诺闹钟。见 docs/ALARM-STUDY.md
    canAlarm: false,
    canBackgroundPush: false,
    canVibrate: hasWindow && 'vibrate' in navigator,
    canBadge: hasWindow && 'setAppBadge' in navigator,
    canFilesystem: hasWindow && 'showSaveFilePicker' in window,
    canPersistStorage: hasWindow && 'storage' in navigator && 'persist' in navigator.storage,
  }
}

const timers = new Map<string, ReturnType<typeof setTimeout>>()

function createNotifications(): NotificationsAdapter {
  const supported = (): boolean => typeof window !== 'undefined' && 'Notification' in window

  const permission = async (): Promise<PermissionState> => {
    if (!supported()) return 'unsupported'
    return Notification.permission as PermissionState
  }

  return {
    supported,
    permission,
    async requestPermission(): Promise<PermissionState> {
      if (!supported()) return 'unsupported'
      try {
        return (await Notification.requestPermission()) as PermissionState
      } catch {
        return 'denied'
      }
    },
    schedule(options: NotifyOptions): () => void {
      const key = options.tag ?? `n_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      const delay = Math.max(0, (options.at ?? Date.now()) - Date.now())
      const timer = setTimeout(() => {
        timers.delete(key)
        void this.notifyNow(options)
      }, delay)
      timers.set(key, timer)
      return () => {
        const t = timers.get(key)
        if (t) clearTimeout(t)
        timers.delete(key)
      }
    },
    async notifyNow(options: NotifyOptions): Promise<boolean> {
      if (!supported()) return false
      if ((await permission()) !== 'granted') return false
      try {
        // eslint-disable-next-line no-new -- Notification 必须实例化才会显示
        new Notification(options.title, { body: options.body ?? '', tag: options.tag })
        return true
      } catch {
        return false
      }
    },
  }
}

const alarmStub: AlarmAdapter = {
  supported: () => false,
  list: async () => [],
  async schedule() {
    throw new Error(
      '当前平台不支持闹钟：浏览器无法在后台/锁屏时保证响铃。请改用「提醒」或把课表订阅到系统日历。',
    )
  },
  async cancel() {
    /* Web 无已排定闹钟，空实现 */
  },
}

const storage: StorageAdapter = {
  async requestPersistence(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false
    try {
      return await navigator.storage.persist()
    } catch {
      return false
    }
  },
  async persisted(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.storage?.persisted) return false
    try {
      return await navigator.storage.persisted()
    } catch {
      return false
    }
  },
  async estimate() {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null
    try {
      const e = await navigator.storage.estimate()
      return { usage: e.usage ?? 0, quota: e.quota ?? 0 }
    } catch {
      return null
    }
  },
}

const files: FilesAdapter = {
  supported: () => typeof document !== 'undefined',
  download(filename: string, content: string, mime = 'application/json'): void {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  },
}

export function createWebPlatform(): Platform {
  return {
    capabilities: detectCapabilities(),
    notifications: createNotifications(),
    alarm: alarmStub,
    storage,
    files,
  }
}

/**
 * 当前平台能力的中文说明，界面上直接展示。
 *
 * **纪律：只对"现在真的能用"的项目打勾。**
 * 这张表最容易犯的错是把"计划中"写成"可用"—— 用户看到 ✓ 就会去用，
 * 用不到就会认为整个应用是假的。所以没做完的一律 `ok: false`，
 * 并在备注里写清排在哪个里程碑（见 docs/ROADMAP.md）。
 */
export function describeCapabilities(caps: Capabilities): Array<{ label: string; ok: boolean; note: string }> {
  return [
    { label: '课程表', ok: true, note: '周视图 / 日视图，可增删改' },
    { label: '离线使用', ok: true, note: '本地优先，数据存在本机' },
    { label: '备份与恢复', ok: true, note: '导出/导入 JSON 文件' },
    { label: '日程表', ok: false, note: '计划中（M4）' },
    { label: '待办与笔记', ok: false, note: '计划中（M6 / M7）' },
    { label: '应用内提醒', ok: false, note: '计划中（M5），页面开着才会响' },
    { label: '系统日历订阅 (iCal)', ok: false, note: '计划中（M3）' },
    {
      label: '后台推送',
      ok: caps.canBackgroundPush,
      note: caps.canBackgroundPush ? '可用' : 'Web 端受限，需原生 App',
    },
    {
      label: '闹钟（锁屏响铃）',
      ok: caps.canAlarm,
      note: caps.canAlarm ? '可用' : 'Web 做不到，需原生 App（见 docs/ALARM-STUDY.md）',
    },
  ]
}
