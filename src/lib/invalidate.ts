import { queryClient } from './queryClient'
import { queryKeys } from './queryKeys'

export function invalidateTasks() {
  queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all })
}

export function invalidateLists() {
  queryClient.invalidateQueries({ queryKey: queryKeys.lists.all })
}

export function invalidateAll() {
  invalidateTasks()
  invalidateLists()
  queryClient.invalidateQueries({ queryKey: queryKeys.tags.all })
}
