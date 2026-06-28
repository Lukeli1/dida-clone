// 命令模块入口：声明子模块并 re-export 全部公开项，
// 使 lib.rs 中 `commands::get_tasks` 等路径保持不变。
//
// 模块布局（commands/ 目录）：
//   - task_commands.rs   任务相关 command + struct + 重复任务计算辅助函数
//   - list_commands.rs   清单相关 command + struct
//   - tag_commands.rs    标签相关 command + struct
//   - habit_commands.rs  习惯相关（占位，P3-06 填充）
//   - window_commands.rs 窗口控制 command

mod task_commands;
mod list_commands;
mod tag_commands;
mod habit_commands;
mod window_commands;

pub use task_commands::*;
pub use list_commands::*;
pub use tag_commands::*;
pub use habit_commands::*;
pub use window_commands::*;

/// 辅助函数：获取当前时间的 RFC3339 字符串（消除重复 chrono::Local::now().to_rfc3339()）
/// 被 task_commands / list_commands / tag_commands 共用。
fn now_rfc3339() -> String {
    chrono::Local::now().to_rfc3339()
}
