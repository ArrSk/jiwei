/**
 * @jiwei/core —— 几微的核心：领域模型 + 时间纯函数。
 *
 * 依赖方向（docs/ARCHITECTURE.md 第 6 节）：
 *   features → shell / ui / data / platform → core
 * 本包处于最底层，**不依赖 DOM、Node API、React 或任何存储引擎**。
 */
export * from './schema'
export * from './date'
export * from './semester'
export * from './materialize'
export * from './occurrences'
export * from './adjustments'
