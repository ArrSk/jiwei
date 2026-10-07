import { describe, expect, it, vi } from 'vitest'
import type { Block } from '@jiwei/core'
import type { Repos } from '@jiwei/data'
import { loadDemoAgenda, loadDemoTasks } from './demoData'

function memoryRepos() {
  const blocks = new Map<string, Block>()
  const savePlan = vi.fn(async (block: Block) => { blocks.set(block.id, block) })
  const repos = { blocks: { get: async (id: string) => blocks.get(id) ?? null }, savePlan } as unknown as Repos
  return { repos, blocks, savePlan }
}

describe('示例导入', () => {
  it('重复和并发导入不复制事项，也不覆盖用户编辑和完成状态', async () => {
    const { repos, blocks, savePlan } = memoryRepos()
    await Promise.all([loadDemoTasks(repos), loadDemoTasks(repos)])
    expect(blocks.size).toBe(4)
    expect(savePlan).toHaveBeenCalledTimes(4)
    const block = [...blocks.values()][0]!
    blocks.set(block.id, { ...block, title: '我的修改', done: true })
    expect(await loadDemoTasks(repos)).toBe(0)
    expect(blocks.get(block.id)?.title).toBe('我的修改')
    expect(blocks.get(block.id)?.done).toBe(true)
  })

  it('中途失败后重试只补齐缺少的事项', async () => {
    const { repos, blocks, savePlan } = memoryRepos()
    savePlan.mockImplementationOnce(async (block) => { blocks.set(block.id, block) })
      .mockRejectedValueOnce(new Error('写入失败'))
    await expect(loadDemoAgenda(repos)).rejects.toThrow('写入失败')
    expect(blocks.size).toBe(1)
    expect(await loadDemoAgenda(repos)).toBe(4)
    expect(blocks.size).toBe(5)
    expect([...blocks.values()].every((block) => block.title.startsWith('【示例】'))).toBe(true)
  })
})
