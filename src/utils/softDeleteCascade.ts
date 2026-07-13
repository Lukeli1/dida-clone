/**
 * 软删除级联辅助（v1.43.1）
 *
 * 后端 delete_task 会级联软删除全部尚未删除的后代，并共用同一 deleted_at。
 * 若批量操作同时传入祖先与后代 ID，且各自独立调用 delete_task，
 * 后代可能因“独立删除”拿到不同时间戳，导致恢复父任务时无法连带恢复。
 *
 * 本工具在前端批量删除前剪掉可被祖先级联覆盖的后代 ID。
 */

export interface SoftDeleteParentRef {
  id: number
  parent_id?: number | null
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
