export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: unknown
  ) {
    super(message)
  }
}

export function handleApiError(error: unknown, context: string): AppError {
  console.error(`[${context}] Error:`, error)
  if (error instanceof Error) {
    return new AppError(error.message, 'API_ERROR', context)
  }
  return new AppError('未知错误', 'UNKNOWN', context)
}
