import { describe, expect, it } from 'vitest'
import { pruneRedundantCascadeDeleteIds } from '../softDeleteCascade'

describe('pruneRedundantCascadeDeleteIds', () => {
  const tasks = [
    { id: 1, parent_id: null },
    { id: 2, parent_id: 1 },
    { id: 3, parent_id: 2 },
    { id: 4, parent_id: null },
    { id: 5, parent_id: 4 },
  ]

  it('同时选中父与子时只保留父，避免拆开级联时间戳', () => {
    expect(pruneRedundantCascadeDeleteIds(tasks, [1, 2])).toEqual([1])
    expect(pruneRedundantCascadeDeleteIds(tasks, [2, 1])).toEqual([1])
  })

  it('祖/父/孙全选时只保留祖先', () => {
    expect(pruneRedundantCascadeDeleteIds(tasks, [1, 2, 3])).toEqual([1])
    expect(pruneRedundantCascadeDeleteIds(tasks, [3, 1, 2])).toEqual([1])
  })

  it('仅选中子任务时保留子任务（独立删除语义）', () => {
    expect(pruneRedundantCascadeDeleteIds(tasks, [2])).toEqual([2])
    expect(pruneRedundantCascadeDeleteIds(tasks, [2, 3])).toEqual([2])
  })

  it('无关任务与另一棵树的父子各自独立处理', () => {
    expect(pruneRedundantCascadeDeleteIds(tasks, [1, 2, 4, 5])).toEqual([1, 4])
  })

  it('未知 parent 的 ID 保守保留', () => {
    expect(pruneRedundantCascadeDeleteIds(tasks, [99, 1])).toEqual([99, 1])
  })

  it('空集合与单元素直接返回副本', () => {
    expect(pruneRedundantCascadeDeleteIds(tasks, [])).toEqual([])
    expect(pruneRedundantCascadeDeleteIds(tasks, [4])).toEqual([4])
  })

  it('自环任务单选时保守保留', () => {
    const cyclic = [{ id: 10, parent_id: 10 }]
    expect(pruneRedundantCascadeDeleteIds(cyclic, [10])).toEqual([10])
  })

  it('双节点循环单选时保守保留', () => {
    const cyclic = [
      { id: 20, parent_id: 21 },
      { id: 21, parent_id: 20 },
    ]
    expect(pruneRedundantCascadeDeleteIds(cyclic, [20])).toEqual([20])
    expect(pruneRedundantCascadeDeleteIds(cyclic, [21])).toEqual([21])
  })

  it('双节点循环且双方均选中时均保守保留，不剪成空集合', () => {
    const cyclic = [
      { id: 20, parent_id: 21 },
      { id: 21, parent_id: 20 },
    ]
    expect(pruneRedundantCascadeDeleteIds(cyclic, [20, 21])).toEqual([20, 21])
  })

  it('父、子、孙三层均选时仅保留祖先（正常树）', () => {
    expect(pruneRedundantCascadeDeleteIds(tasks, [1, 2, 3])).toEqual([1])
  })

  it('保持无关树之间的删除顺序与既有行为一致', () => {
    expect(pruneRedundantCascadeDeleteIds(tasks, [5, 2, 4, 1, 3])).toEqual([4, 1])
  })
})
