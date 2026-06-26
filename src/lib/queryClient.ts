import { QueryClient } from '@tanstack/react-query'
import { isTauri } from '../api'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 浏览器降级模式下不缓存，因为 mock 数据是可变内存
      staleTime: isTauri ? 1000 * 30 : 0,
      gcTime: 1000 * 60 * 5,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
