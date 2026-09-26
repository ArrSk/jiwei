/**
 * @jiwei/platform —— 能力适配层。
 *
 * 为什么首版只有一个模块也要有它（ADR-005）：
 * 它把"当前平台能做什么"与"业务代码想做什么"分开。
 * M5 接入 Capacitor 时，只需在这里多一个 `createNativePlatform()`，
 * 业务代码一行不改，闹钟就从"不可用"变成"可用"。
 */
export * from './types'
export { createWebPlatform, describeCapabilities } from './web'

import { createWebPlatform } from './web'
import type { Platform } from './types'

/**
 * 取得当前平台实现。
 * M5 判断到原生容器（Capacitor）时会返回原生实现，此处是唯一的分支点。
 */
export function getPlatform(): Platform {
  return createWebPlatform()
}
