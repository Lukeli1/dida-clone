/**
 * 周视图全天区高度约束。
 *
 * - 默认高度仍由全天任务行数决定（见 WeekView）；
 * - 用户通过分隔线调整后的高度只保留在当前运行期（uiStore），不写数据库 / 同步格式；
 * - 最小高度保留一行 20px 任务条与上下内边距，最大高度避免挤占过多小时网格。
 */

/** 全天区最小可见高度：保留一行 20px 任务条 + 上下内边距 */
export const ALL_DAY_AREA_MIN_HEIGHT = 32
/** 全天区最大可见高度：避免在周视图内挤占过多小时网格 */
export const ALL_DAY_AREA_MAX_HEIGHT = 320
/** 全天区与小时网格之间分隔线的可拖动高度 */
export const ALL_DAY_DIVIDER_HEIGHT = 8
/** 键盘方向键单次调整高度：与一行全天任务行高一致 */
export const ALL_DAY_AREA_KEYBOARD_STEP = 24
/** 与 index.css 中全局滚动条宽度保持一致，用于溢出时表头/网格的右侧占位 */
export const ALL_DAY_SCROLLBAR_WIDTH = 6

export function clampAllDayAreaHeight(height: number): number {
  return Math.max(ALL_DAY_AREA_MIN_HEIGHT, Math.min(ALL_DAY_AREA_MAX_HEIGHT, Math.round(height)))
}
