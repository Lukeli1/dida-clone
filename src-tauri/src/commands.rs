// 命令模块入口：声明子模块并 re-export 全部公开项，
// 使 lib.rs 中 `commands::get_tasks` 等路径保持不变。
//
// 模块布局（commands/ 目录）：
//   - task_commands.rs   任务模块入口：re-export task_crud + task_ops
//   - task_crud.rs       任务 CRUD：get/create/update/delete/duplicate + struct
//   - task_ops.rs        任务操作：reorder/complete + 重复规则辅助函数
//   - list_commands.rs   清单相关 command + struct
//   - tag_commands.rs    标签相关 command + struct
//   - habit_commands.rs  习惯相关（占位，P3-06 填充）
//   - window_commands.rs 窗口控制 command

pub mod attachment_commands;
mod data_commands;
pub mod file_commands;
pub mod goal_commands;
mod habit_commands;
mod list_commands;
pub mod repeat_commands;
pub mod report_commands;
pub mod secret_commands;
pub mod snapshot_commands;
pub mod sync_commands;
pub mod sync_log_commands;
mod tag_commands;
mod task_commands;
mod task_ops;
pub mod template_commands;
pub mod time_tracking_commands;
pub mod webdav_commands;
mod window_commands;

pub use attachment_commands::*;
pub use data_commands::*;
pub use file_commands::*;
pub use goal_commands::*;
pub use habit_commands::*;
pub use list_commands::*;
pub use repeat_commands::*;
pub use report_commands::*;
pub use secret_commands::*;
pub use snapshot_commands::*;
pub use sync_commands::*;
pub use sync_log_commands::*;
pub use tag_commands::*;
pub use task_commands::*;
pub use template_commands::*;
pub use time_tracking_commands::*;
pub use webdav_commands::*;
pub use window_commands::*;

/// 辅助函数：获取当前时间的 RFC3339 字符串（消除重复 chrono::Local::now().to_rfc3339()）
/// 被 task_commands / list_commands / tag_commands 共用。
fn now_rfc3339() -> String {
    chrono::Local::now().to_rfc3339()
}
