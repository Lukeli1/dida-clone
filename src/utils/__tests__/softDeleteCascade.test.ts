import { describe, expect, it } from 'vitest'
import {
  classifyParentChain,
  hasDeletedAncestorInMap,
  pruneRedundantCascadeDeleteIds,
  shouldHideSameStampCascadedChild,
} from '../softDeleteCascade'

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

describe('shouldHideSameStampCascadedChild / classifyParentChain', () => {
  it('正常树：同戳子任务应隐藏', () => {
    const parentById = new Map<number, number | null>([
      [1, null],
      [2, 1],
      [3, 2],
    ])
    expect(
      shouldHideSameStampCascadedChild(
        { id: 2, parent_id: 1, deleted_at: 't1' },
        parentById,
        't1',
      ),
    ).toBe(true)
    expect(
      shouldHideSameStampCascadedChild(
        { id: 3, parent_id: 2, deleted_at: 't1' },
        parentById,
        't1',
      ),
    ).toBe(true)
    expect(
      shouldHideSameStampCascadedChild(
        { id: 1, parent_id: null, deleted_at: 't1' },
        parentById,
        null,
      ),
    ).toBe(false)
  })

  it('独立删除（不同 deleted_at）不隐藏', () => {
    const parentById = new Map<number, number | null>([
      [1, null],
      [2, 1],
    ])
    expect(
      shouldHideSameStampCascadedChild(
        { id: 2, parent_id: 1, deleted_at: 't-child' },
        parentById,
        't-parent',
      ),
    ).toBe(false)
  })

  it('自环/双环/三环均不隐藏，保证回收站入口', () => {
    const selfLoop = new Map<number, number | null>([[10, 10]])
    expect(
      shouldHideSameStampCascadedChild(
        { id: 10, parent_id: 10, deleted_at: 't' },
        selfLoop,
        't',
      ),
    ).toBe(false)

    const dual = new Map<number, number | null>([
      [20, 21],
      [21, 20],
    ])
    expect(
      shouldHideSameStampCascadedChild(
        { id: 20, parent_id: 21, deleted_at: 't' },
        dual,
        't',
      ),
    ).toBe(false)
    expect(
      shouldHideSameStampCascadedChild(
        { id: 21, parent_id: 20, deleted_at: 't' },
        dual,
        't',
      ),
    ).toBe(false)

    // A→B→C→A
    const triple = new Map<number, number | null>([
      [1, 2],
      [2, 3],
      [3, 1],
    ])
    expect(classifyParentChain(triple, 2, 1)).toBe('cycle_to_origin')
    expect(classifyParentChain(triple, 3, 2)).toBe('cycle_to_origin')
    expect(classifyParentChain(triple, 1, 3)).toBe('cycle_to_origin')
    for (const id of [1, 2, 3]) {
      const parentId = triple.get(id) ?? null
      expect(
        shouldHideSameStampCascadedChild(
          { id, parent_id: parentId, deleted_at: 't' },
          triple,
          't',
        ),
      ).toBe(false)
    }
  })

  it('环外挂接同戳后代可隐藏；环上节点不隐藏', () => {
    // A→B→C→A，D 挂在 A 下
    const parentById = new Map<number, number | null>([
      [1, 2],
      [2, 3],
      [3, 1],
      [4, 1],
    ])
    expect(
      shouldHideSameStampCascadedChild(
        { id: 4, parent_id: 1, deleted_at: 't' },
        parentById,
        't',
      ),
    ).toBe(true)
    expect(
      shouldHideSameStampCascadedChild(
        { id: 1, parent_id: 2, deleted_at: 't' },
        parentById,
        't',
      ),
    ).toBe(false)
  })

  it('环上同伴不计入 hasDeletedAncestorInMap 阻塞', () => {
    const parentById = new Map<number, number | null>([
      [1, 2],
      [2, 3],
      [3, 1],
    ])
    const deletedAtById = new Map<number, string | null>([
      [1, 't'],
      [2, 't'],
      [3, 't'],
    ])
    expect(hasDeletedAncestorInMap(1, parentById, deletedAtById)).toBe(false)
    expect(hasDeletedAncestorInMap(2, parentById, deletedAtById)).toBe(false)
    expect(hasDeletedAncestorInMap(3, parentById, deletedAtById)).toBe(false)
  })

  it('正常树：父仍删除时 hasDeletedAncestorInMap 为 true', () => {
    const parentById = new Map<number, number | null>([
      [1, null],
      [2, 1],
    ])
    const deletedAtById = new Map<number, string | null>([
      [1, 't-parent'],
      [2, 't-child'],
    ])
    expect(hasDeletedAncestorInMap(2, parentById, deletedAtById)).toBe(true)
  })
})
