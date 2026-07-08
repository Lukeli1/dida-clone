import { invoke as rawInvoke, convertFileSrc } from '@tauri-apps/api/core'

/**
 * 统一 invoke 客户端（P2-09）
 *
 * 所有 API 子模块通过此入口调用 Tauri command，禁止直接 import @tauri-apps/api/core。
 * 职责：
 *   1. 统一 command 调用入口，便于测试 mock（测试只需 mock 此文件的 rawInvoke）。
 *   2. 统一错误转换：Tauri command 错误统一为 Error 对象，保留原始 message。
 *   3. 保留与原生 invoke 完全一致的签名，零成本替换。
 *
 * `isTauri` 与 mock 兜底仍由各 api 子模块自行处理（保持现有行为）。
 * convertFileSrc 一并从此 re-export，避免其他文件直接依赖 @tauri-apps/api/core。
 */

/** 统一 invoke：与 @tauri-apps/api/core 的 invoke 签名一致，附加错误归一化 */
export async function invokeCommand<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    // args 为 undefined 时不传第二参数，保持与原生 invoke 一致的调用形态（便于测试断言）
    return args === undefined ? await rawInvoke<T>(cmd) : await rawInvoke<T>(cmd, args)
  } catch (e) {
    // Tauri command 错误通常是字符串或 { message }，统一为 Error 便于上层 catch 处理
    if (e instanceof Error) throw e
    const message = typeof e === 'string' ? e : String(e)
    throw new Error(message)
  }
}

/** 原始 invoke 透传（供需要原生行为、不希望错误归一化的场景，如流式监听初始化） */
export { rawInvoke as invokeRaw }

/** re-export convertFileSrc，避免其他文件直接依赖 @tauri-apps/api/core */
export { convertFileSrc }
