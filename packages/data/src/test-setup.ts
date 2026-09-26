/**
 * 测试环境：Node 里没有 IndexedDB，用 fake-indexeddb 顶上。
 * 这是选择 IndexedDB 方案（ADR-003）后必须有的基础设施。
 */
import 'fake-indexeddb/auto'
