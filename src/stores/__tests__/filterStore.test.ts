import { describe, it, expect, beforeEach } from 'vitest'
import { useFilterStore } from '../filterStore'
import type { FilterState } from '../filterStore'

// 初始状态数据字段（不含 actions，setState 时做浅合并以保留 actions）
const initialFilterState: FilterState = {
  priority: null,
  dateRange: 'all',
  tagId: null,
  listId: null,
}

describe('filterStore', () => {
  beforeEach(() => {
    // 每个 case 前重置过滤器状态为初始值
    useFilterStore.setState({ ...initialFilterState })
  })

  // 1. 初始状态
  it('初始状态：priority 为 null、dateRange 为 all、tagId/listId 为 null', () => {
    const state = useFilterStore.getState()
    expect(state.priority).toBeNull()
    expect(state.dateRange).toBe('all')
    expect(state.tagId).toBeNull()
    expect(state.listId).toBeNull()
  })

  // 2. setFilter 设置 priority
  it('setFilter 设置 priority 字段', () => {
    useFilterStore.getState().setFilter('priority', 3)
    expect(useFilterStore.getState().priority).toBe(3)
    // 其它字段不受影响
    expect(useFilterStore.getState().dateRange).toBe('all')
  })

  // 3. setFilter 切换 dateRange（过滤器切换逻辑）
  it('setFilter 切换 dateRange 为 today / week / month / overdue', () => {
    const store = useFilterStore.getState()

    store.setFilter('dateRange', 'today')
    expect(useFilterStore.getState().dateRange).toBe('today')

    useFilterStore.getState().setFilter('dateRange', 'week')
    expect(useFilterStore.getState().dateRange).toBe('week')

    useFilterStore.getState().setFilter('dateRange', 'overdue')
    expect(useFilterStore.getState().dateRange).toBe('overdue')
  })

  // 4. setFilter 设置 tagId / listId
  it('setFilter 设置 tagId 和 listId', () => {
    useFilterStore.getState().setFilter('tagId', 5)
    useFilterStore.getState().setFilter('listId', 9)

    expect(useFilterStore.getState().tagId).toBe(5)
    expect(useFilterStore.getState().listId).toBe(9)
  })

  // 5. setFilter 是类型安全的字段更新（一次只改一个字段，不覆盖其它）
  it('setFilter 仅更新指定字段，不覆盖其它字段', () => {
    useFilterStore.getState().setFilter('priority', 1)
    useFilterStore.getState().setFilter('dateRange', 'today')
    useFilterStore.getState().setFilter('tagId', 2)

    const state = useFilterStore.getState()
    expect(state.priority).toBe(1)
    expect(state.dateRange).toBe('today')
    expect(state.tagId).toBe(2)
    expect(state.listId).toBeNull()
  })

  // 6. resetFilters 将所有过滤器恢复为初始值
  it('resetFilters 将所有字段恢复为初始值', () => {
    // 先污染所有字段
    useFilterStore.getState().setFilter('priority', 5)
    useFilterStore.getState().setFilter('dateRange', 'month')
    useFilterStore.getState().setFilter('tagId', 7)
    useFilterStore.getState().setFilter('listId', 8)

    useFilterStore.getState().resetFilters()

    const state = useFilterStore.getState()
    expect(state.priority).toBeNull()
    expect(state.dateRange).toBe('all')
    expect(state.tagId).toBeNull()
    expect(state.listId).toBeNull()
  })

  // 7. selector / 订阅视角：getState 返回最新引用且包含 actions
  it('getState 返回的对象包含 setFilter 与 resetFilters 方法', () => {
    const state = useFilterStore.getState()
    expect(typeof state.setFilter).toBe('function')
    expect(typeof state.resetFilters).toBe('function')
  })
})
