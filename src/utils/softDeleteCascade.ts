/**
 * 软删除级联辅助（v1.43.1 / v1.43.2）
 *
 * 后端 delete_task 会级联软删除全部尚未删除的后代，并共用同一 deleted_at。
 * 若批量操作同时传入祖先与后代 ID，且各自独立调用 delete_task，
 * 后代可能因“独立删除”拿到不同时间戳，导致恢复父任务时无法连带恢复。
 *
 * 本工具在前端批量删除前剪掉可被祖先级联覆盖的后代 ID；
 * 并提供回收站“同次级联子任务隐藏”的环安全判定（任意长度 parent 环）。
 */

export interface SoftDeleteParentRef {
  id: number
  parent_id?: number | null
}

export type ParentChainOutcome =
  | 'cycle_to_origin'
  | 'open_tree'
  | 'cycle_other'
  | 'unknown'

/**
 * 从 start 沿 parent_id 向上遍历，判断是否回到 origin。
 * - cycle_to_origin：任意长度环且 origin 在环上（自环/双环/三环+）
 * - open_tree：走到 NULL，正常树
 * - cycle_other：撞到不含 origin 的环（环外挂接子任务常见）
 * - unknown：深度上限/缺失节点 → 调用方应保守展示
 */
export function classifyParentChain(
  parentById: Map<number, number | null | undefined>,
  start: number,
  origin: number,
  maxDepth = 64,
): ParentChainOutcome {
  let current = start
  const visited = new Set<number>([origin])

  for (let depth = 0; depth < maxDepth; depth += 1) {
    if (current === origin) return 'cycle_to_origin'
    if (visited.has(current)) return 'cycle_other'
    visited.add(current)

    if (!parentById.has(current)) return 'unknown'
    const pid = parentById.get(current)
    if (pid == null) return 'open_tree'
    current = pid
  }
  return 'unknown'
}

/**
 * 是否应作为“与父任务同次级联删除的子任务”从回收站顶层隐藏。
 * 任意长度 parent 环上的节点一律不隐藏，保证至少有恢复入口。
 * 环外挂接的同戳后代仍可隐藏。
 */
export function shouldHideSameStampCascadedChild(
  task: { id: number; parent_id?: number | null; deleted_at?: string | null },
  parentById: Map<number, number | null | undefined>,
  parentDeletedAt: string | null | undefined,
): boolean {
  const parentId = task.parent_id ?? null
  if (parentId == null) return false
  if (parentId === task.id) return false
  if (!task.deleted_at || parentDeletedAt !== task.deleted_at) return false

  const outcome = classifyParentChain(parentById, parentId, task.id)
  // 开树或父链进入不含自身的环：隐藏；自身在环上/未知：展示
  return outcome === 'open_tree' || outcome === 'cycle_other'
}

/**
 * 是否存在仍在回收站中的严格祖先（环上同伴不计入阻塞）。
 */
export function hasDeletedAncestorInMap(
  taskId: number,
  parentById: Map<number, number | null | undefined>,
  deletedAtById: Map<number, string | null | undefined>,
  maxDepth = 64,
): boolean {
  let current = taskId
  const visited = new Set<number>([taskId])

  for (let depth = 0; depth < maxDepth; depth += 1) {
    const pid = parentById.get(current) ?? null
    if (pid == null) return false
    if (pid === current || visited.has(pid)) return false
    visited.add(pid)

    if (deletedAtById.get(pid)) {
      // 若该“祖先”又能回到自身，说明是环上同伴
      if (classifyParentChain(parentById, pid, taskId) === 'cycle_to_origin') {
        return false
      }
      return true
    }
    current = pid
  }
  return false
}

/**
 * 从待删除 ID 集合中移除会被祖先级联覆盖的后代。
 * 保留原始顺序中的祖先 ID；未知 parent 的 ID 原样保留。
 * 若父链出现环，保守保留当前 ID，交由后端幂等删除。
 */
export function pruneRedundantCascadeDeleteIds(
  tasks: SoftDeleteParentRef[],
  ids: number[],
): number[] {
  if (ids.length <= 1) return [...ids]

  const parentById = new Map<number, number | null | undefined>()
  for (const t of tasks) {
    parentById.set(t.id, t.parent_id)
  }

  const selected = new Set(ids)
  return ids.filter((id) => {
    // 未知任务：保守保留，交给后端幂等处理
    if (!parentById.has(id)) return true

    // 先完整走父链：检测到环/异常深度则保留；无环再判断是否有选中祖先
    const visited = new Set<number>([id])
    const ancestors: number[] = []
    let pid = parentById.get(id) ?? null
    let depth = 0
    while (pid != null) {
      if (visited.has(pid) || depth >= 64) {
        // 环或异常深度：不剪掉当前 ID，避免误删到空集合
        return true
      }
      visited.add(pid)
      ancestors.push(pid)
      pid = parentById.get(pid) ?? null
      depth += 1
    }

    return !ancestors.some((ancestorId) => selected.has(ancestorId))
  })
}
