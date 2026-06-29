// 任务 CRUD 模块入口：拆分为 create / update / query 三个子模块，
// 此处声明子模块并 re-export 全部公开项，保持 commands::get_tasks 等路径不变。
//
// 拆分布局（commands/ 目录下，与 task_crud.rs 同级）：
//   - task_create.rs  CreateTaskRequest + create_task
//   - task_update.rs  UpdateTaskRequest + update_task
//   - task_query.rs    get_tasks + delete_task + duplicate_task
//
// 注：三个子模块文件与 task_crud.rs 同级（而非 task_crud/ 子目录），
// 故使用 #[path] 显式指定文件位置；子模块仍是 task_crud 的下级模块。

#[path = "task_create.rs"]
mod task_create;
#[path = "task_update.rs"]
mod task_update;
#[path = "task_query.rs"]
mod task_query;

pub use task_create::*;
pub use task_update::*;
pub use task_query::*;
