// 任务命令模块入口：声明子模块并 re-export 全部公开项，
// 使 commands.rs 中 `pub use task_commands::*;` 路径保持不变。
//
// 原 task_crud.rs（仅 re-export）已合并至此，减少文件碎片。
//
// 拆分布局（commands/ 目录下，与 task_commands.rs 同级）：
//   - task_create.rs  CreateTaskRequest + create_task
//   - task_update.rs  UpdateTaskRequest + update_task
//   - task_query.rs   get_tasks + delete_task + duplicate_task
//   - task_ops.rs     reorder/complete + 重复规则辅助函数（由 commands.rs 声明）
//
// 注：三个子模块文件与 task_commands.rs 同级（而非 task_commands/ 子目录），
// 故使用 #[path] 显式指定文件位置；子模块仍是 task_commands 的下级模块。

#[path = "task_create.rs"]
mod task_create;
#[path = "task_query.rs"]
mod task_query;
#[path = "task_update.rs"]
mod task_update;

pub use super::task_ops::*;
pub use task_create::*;
pub use task_query::*;
pub use task_update::*;
