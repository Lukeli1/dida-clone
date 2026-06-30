# 滴答清单复刻 — Phase 4 功能增强与体验打磨文档

**生成日期**：2026-06-29 10:15 (Asia/Shanghai)
**当前版本**：v1.23.0（Phase 3 深度优化已完成）
**前置条件**：Phase 1 ✅、Phase 2 ✅、Phase 3 ✅
**项目路径**：`C:\Users\50441\Documents\trae开发\滴答清单复刻`

---

## 一、Phase 4 目标

**从前三阶段的"整理代码"转向"增强功能 + 提升体验"。让软件从"能用"升级到"好用"。**

| 方向 | 核心目标 | 量化指标 |
|---|---|---|
| A. 拆分最后 3 个大文件 | 0 个文件超过 500 行 | 3 个 → 0 个 |
| B. LLM 流式响应 | AI 对话打字机效果 | 当前全量返回 → SSE 流式 |
| C. 数据导出/导入 | 支持 JSON/CSV/Markdown 备份 | 0 种 → 3 种格式 |
| D. 全文搜索增强 | 任务标题+备注+子任务搜索 | 当前仅标题 → 全字段 |
| E. CI/CD 基础 | GitHub Actions 自动测试 | 0 → 1 条流水线 |

**原则**：
- A 方向：纯重构（同 Phase 2/3）
- B-E 方向：功能增强，需手动测试

---

## 二、当前状态（v1.23.0 基线）

### 2.1 仍超过 500 行的文件（3 个）

| 文件 | 行数 | 问题 |
|---|---|---|
| `WeekView.tsx` | 600 | 周视图+任务条+拖拽+点击交互全在一个文件 |
| `MonthView.tsx` | 531 | 月视图+任务条+拖拽+农历+辅助函数 |
| `task_commands.rs` | 585 | 7 个任务 command 含复杂 SQL 逻辑 |

### 2.2 接近 500 行的文件（3 个，不拆）

| 文件 | 行数 | 备注 |
|---|---|---|
| `TaskContextMenu.tsx` | 441 | P3-02 新拆出的，可接受 |
| `AIAssistant.tsx` | 430 | 本次要加流式响应，暂不拆 |
| `CalendarView.tsx` | 473 | 容器+3 个子组件，可接受 |
| `DayView.tsx` | 430 | 日视图，结构清晰 |

### 2.3 AI 对话现状
- 当前：`llm_chat` Tauri command 一次性返回完整响应
- 问题：长回答等待 5-10 秒无反馈，用户体验差
- 目标：SSE 流式返回，打字机效果

### 2.4 数据导出现状
- 当前：仅设置页有"数据导出"按钮，导出格式不明
- 目标：支持 JSON（完整备份）/ CSV（Excel 可开）/ Markdown（可读）

### 2.5 搜索现状
- 当前：`searchQuery` 只搜索任务标题
- 目标：搜索标题 + 备注 + 子任务标题

### 2.6 CI/CD 现状
- 当前：无 CI/CD，推送后无自动验证
- 目标：GitHub Actions 跑 `npm run test` + `tsc --noEmit`

---

## 三、任务清单（8 个任务，5 个方向）

### 方向 A：拆分最后 3 个大文件（2 个任务）

---

### P4-01：拆分 `WeekView.tsx` + `MonthView.tsx`（600+531行 → ≤300行）

**当前**：两个日历视图文件都超过 500 行，结构类似（任务条渲染 + 拖拽 + 点击交互）

**拆分方案**：
```
src/components/calendar/
├── shared/
│   ├── TaskBar.tsx (80 行) — 任务条组件（月视图和周视图共用）
│   ├── lunarUtils.ts (40 行) — 农历标签计算
│   ├── taskBarColor.ts (20 行) — 任务条颜色计算
│   └── types.ts (30 行) — 共享类型
├── MonthView.tsx (250 行) — 月视图主组件
└── WeekView.tsx (300 行) — 周视图主组件
```

**操作步骤**：
1. 创建 `src/components/calendar/` 目录
2. 提取 `getTaskBarColor` 和 `getLunarLabel` 到 `shared/` 目录
3. 提取任务条渲染逻辑到 `TaskBar.tsx`（两个视图共用）
4. 提取共享类型到 `types.ts`
5. `MonthView.tsx` 和 `WeekView.tsx` 引用共享组件
6. 更新 `CalendarView.tsx` 的 import 路径
7. 验证：`tsc --noEmit` 通过

**验收**：
- [ ] `MonthView.tsx` ≤ 300 行
- [ ] `WeekView.tsx` ≤ 300 行
- [ ] 共享组件被两个视图复用
- [ ] 月视图/周视图功能不变（任务条/拖拽/点击/农历）
- [ ] `tsc --noEmit` 通过

---

### P4-02：拆分 `task_commands.rs`（585行 → ≤300行）

**当前**：`src-tauri/src/commands/task_commands.rs` 585 行，7 个 Tauri command

**拆分方案**：
```
src-tauri/src/commands/
├── task_commands.rs (30 行) — mod 声明 + re-export
├── task_crud.rs (200 行) — get_tasks / create_task / update_task / delete_task / duplicate_task
└── task_ops.rs (200 行) — reorder_tasks / complete_task（含重复规则处理）
```

**操作步骤**：
1. 按职责把 7 个函数分到 2 个子模块
2. `task_commands.rs` 改为 `mod task_crud; mod task_ops; pub use task_crud::*; pub use task_ops::*;`
3. `commands/mod.rs` 的 import 路径不变
4. 验证：`cargo check` 通过

**验收**：
- [ ] `task_commands.rs` ≤ 30 行
- [ ] 每个子模块 ≤ 200 行
- [ ] `cargo check` 通过
- [ ] 任务 CRUD / 排序 / 完成 / 重复规则处理全部正常

---

### 方向 B：LLM 流式响应（2 个任务）

---

### P4-03：后端 `llm_chat` 改为 SSE 流式

**当前**：`src-tauri/src/llm.rs` 的 `llm_chat` 一次性返回完整响应

**目标**：改为 Tauri event 流式返回，前端通过 `listen` 接收

**Rust 端改动**（`src-tauri/src/llm.rs`）：
```rust
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub async fn llm_chat_stream(
    app: AppHandle,
    config: LLMConfig,
    messages: Vec<ChatMessage>,
    skill: Option<String>,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    let mut url = config.base_url.trim_end_matches('/').to_string();
    url.push_str("/chat/completions");

    let body = serde_json::json!({
        "model": config.model,
        "messages": messages,
        "stream": true,
        "reasoning_effort": config.reasoning_effort,
    });

    let mut response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let mut buffer = String::new();
    let mut full_content = String::new();

    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        // SSE 格式：每行 data: {...}\n\n
        while let Some(pos) = buffer.find("\n\n") {
            let line = buffer[..pos].to_string();
            buffer = buffer[pos + 2..].to_string();

            if let Some(json_str) = line.strip_prefix("data: ") {
                if json_str == "[DONE]" {
                    app.emit("llm-chat-done", &full_content).map_err(|e| e.to_string())?;
                    return Ok(());
                }
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(json_str) {
                    if let Some(delta) = parsed["choices"][0]["delta"]["content"].as_str() {
                        full_content.push_str(delta);
                        app.emit("llm-chat-chunk", delta).map_err(|e| e.to_string())?;
                    }
                }
            }
        }
    }

    app.emit("llm-chat-done", &full_content).map_err(|e| e.to_string())?;
    Ok(())
}
```

**操作步骤**：
1. 在 `llm.rs` 中新增 `llm_chat_stream` 函数（保留原 `llm_chat` 作为 fallback）
2. 在 `lib.rs` 的 `generate_handler!` 中注册 `llm_chat_stream`
3. 验证：`cargo check` 通过

**验收**：
- [ ] `llm_chat_stream` 函数实现
- [ ] `lib.rs` 注册新 command
- [ ] `cargo check` 通过
- [ ] 发送 `llm-chat-chunk` 事件（每个 token）和 `llm-chat-done` 事件（完成）

---

### P4-04：前端 AI 对话接入流式响应

**当前**：`AIAssistant.tsx` 调用 `llm_chat` 一次性显示完整响应

**目标**：调用 `llm_chat_stream`，通过 Tauri event 监听，实现打字机效果

**前端改动**：
1. 在 `api.ts` 添加流式调用封装：
   ```typescript
   import { listen } from '@tauri-apps/api/event'

   export async function llmChatStream(
     config: LLMConfig,
     messages: ChatMessage[],
     skill: string | null,
     onChunk: (delta: string) => void,
     onDone: (full: string) => void,
     onError: (err: string) => void,
   ): Promise<() => void> {
     const unlistenChunk = await listen<string>('llm-chat-chunk', (e) => onChunk(e.payload))
     const unlistenDone = await listen<string>('llm-chat-done', (e) => {
       onDone(e.payload)
       unlistenChunk()
       unlistenDone()
     })

     try {
       await invoke('llm_chat_stream', { config, messages, skill })
     } catch (err) {
       unlistenChunk()
       unlistenDone()
       onError(String(err))
     }

     return () => { unlistenChunk(); unlistenDone() }
   }
   ```

2. 修改 `AIAssistant.tsx`：
   - 发送消息时调用 `llmChatStream`
   - `onChunk` 追加到当前 AI 回复内容
   - `onDone` 标记回复完成
   - 支持中途取消（调用返回的 unlisten 函数）

3. UI 增强：
   - AI 回复时显示"思考中..."动画
   - 打字机效果（每个 chunk 追加显示）
   - 取消按钮（停止生成）

**操作步骤**：
1. 在 `api.ts` 添加 `llmChatStream` 封装
2. 修改 `AIAssistant.tsx` 的 `sendMessage` 函数
3. 添加打字机效果 UI
4. 添加取消生成按钮
5. 保留 `llm_chat`（非流式）作为 fallback
6. 验证：AI 对话有打字机效果，可中途取消

**验收**：
- [ ] AI 回复有打字机效果
- [ ] 可中途取消生成
- [ ] 取消后不残留监听器
- [ ] `tsc --noEmit` 通过
- [ ] 非流式 fallback 仍可用

---

### 方向 C：数据导出/导入（2 个任务）

---

### P4-05：后端导出/导入 Tauri command

**目标**：后端提供导出 JSON / CSV / Markdown 的 Tauri command

**Rust 端新增**（`src-tauri/src/commands/data_commands.rs`）：
```rust
#[tauri::command]
pub fn export_json(state: State<DbState>) -> Result<String, String> {
    // 导出所有任务、清单、标签、习惯为 JSON
}

#[tauri::command]
pub fn export_csv(state: State<DbState>) -> Result<String, String> {
    // 导出任务列表为 CSV
}

#[tauri::command]
pub fn export_markdown(state: State<DbState>) -> Result<String, String> {
    // 导出任务为 Markdown（按清单分组）
}

#[tauri::command]
pub fn import_json(state: State<DbState>, json: String, mode: String) -> Result<ImportResult, String> {
    // 导入 JSON，mode: "merge" | "replace"
}
```

**操作步骤**：
1. 创建 `src-tauri/src/commands/data_commands.rs`
2. 实现 4 个 command
3. 在 `commands/mod.rs` 和 `lib.rs` 中注册
4. 验证：`cargo check` 通过

**导出格式规范**：

**JSON 格式**：
```json
{
  "version": "1.0",
  "exported_at": "2026-06-29T10:00:00+08:00",
  "lists": [...],
  "tasks": [...],
  "tags": [...],
  "habits": [...],
  "habit_records": [...]
}
```

**CSV 格式**：
```
ID,标题,清单,优先级,截止日期,完成,归档,创建时间
1,买牛奶,生活,中,2026-06-29,否,否,2026-06-28
```

**Markdown 格式**：
```markdown
# 任务导出 — 2026-06-29

## 收件箱
- [ ] 买牛奶 (优先级：中，截止：2026-06-29)
- [x] 写周报 (已完成)

## 工作
- [ ] 开会
```

**验收**：
- [ ] `export_json` 返回完整 JSON
- [ ] `export_csv` 返回 CSV 字符串
- [ ] `export_markdown` 返回 Markdown 字符串
- [ ] `import_json` 支持 merge 和 replace 两种模式
- [ ] `cargo check` 通过

---

### P4-06：前端导出/导入 UI

**目标**：设置页"数据"部分增加导出/导入按钮

**前端改动**：
1. 修改 `src/components/settings/SystemPanel.tsx`：
   - 添加"导出数据"区域（3 个按钮：JSON / CSV / Markdown）
   - 添加"导入数据"区域（文件选择 + 模式选择 + 确认）
   - 导出时调用 Tauri save dialog + write file
   - 导入时调用 Tauri open dialog + read file + import_json

2. 在 `api.ts` 添加导出/导入 API 封装

3. UI 流程：
   - 点击"导出 JSON" → 弹出保存对话框 → 选择路径 → 保存文件 → Toast 提示成功
   - 点击"导入数据" → 弹出打开对话框 → 选择 JSON 文件 → 选择模式（合并/替换）→ 确认 → Toast 提示结果

**操作步骤**：
1. 在 `api.ts` 添加 `exportJson` / `exportCsv` / `exportMarkdown` / `importJson` 封装
2. 修改 `SystemPanel.tsx` 添加导出/导入 UI
3. 使用 `@tauri-apps/plugin-dialog` 的 `save` 和 `open`
4. 使用 `@tauri-apps/plugin-fs` 的 `writeTextFile` 和 `readTextFile`
5. 验证：导出 JSON/CSV/Markdown 到文件，导入 JSON 能恢复数据

**验收**：
- [ ] 点击"导出 JSON"能保存文件
- [ ] 点击"导出 CSV"能保存文件（Excel 可打开）
- [ ] 点击"导出 Markdown"能保存文件（可读）
- [ ] 点击"导入数据"能选择文件并导入
- [ ] 导入支持"合并"和"替换"两种模式
- [ ] 导入后有 Toast 提示结果
- [ ] `tsc --noEmit` 通过

---

### 方向 D：全文搜索增强（1 个任务）

---

### P4-07：搜索扩展到备注 + 子任务

**当前**：`useTaskFiltering.ts` 的 `searchQuery` 只匹配 `task.title`

**目标**：匹配 `task.title` + `task.notes` + 子任务标题

**前端改动**（`src/hooks/useTaskFiltering.ts`）：
```typescript
// 当前
const matches = (task: Task) => {
  if (!searchQuery.trim()) return true
  return task.title.toLowerCase().includes(searchQuery.toLowerCase())
}

// 改为
const matches = (task: Task) => {
  if (!searchQuery.trim()) return true
  const q = searchQuery.toLowerCase()
  // 1. 标题
  if (task.title.toLowerCase().includes(q)) return true
  // 2. 备注
  if (task.notes?.toLowerCase().includes(q)) return true
  // 3. 子任务标题
  const childTasks = tasks.filter(t => t.parent_id === task.id)
  if (childTasks.some(ct => ct.title.toLowerCase().includes(q))) return true
  return false
}
```

**UI 增强**：
- 搜索框 placeholder 改为"搜索标题、备注、子任务..."
- 搜索结果中高亮匹配的关键词
- 如果匹配的是备注或子任务，显示一个小标签（"备注命中" / "子任务命中"）

**操作步骤**：
1. 修改 `useTaskFiltering.ts` 的 `matches` 函数
2. 修改 `TaskListPanel.tsx` 的搜索框 placeholder
3. 在 `TaskItem.tsx` 中添加匹配来源标签
4. 添加搜索测试用例到 `__tests__`
5. 验证：搜索能命中备注和子任务

**验收**：
- [ ] 搜索"会议"能命中标题含"会议"的任务
- [ ] 搜索"会议"能命中备注含"会议"的任务
- [ ] 搜索"会议"能命中子任务标题含"会议"的任务
- [ ] 搜索结果有匹配来源标签
- [ ] 新增测试用例 ≥5 个
- [ ] `tsc --noEmit` 通过
- [ ] `npm run test` 通过

---

### 方向 E：CI/CD 基础（1 个任务）

---

### P4-08：GitHub Actions 自动测试流水线

**目标**：推送到 GitHub 时自动跑 `tsc --noEmit` + `npm run test`

**操作步骤**：
1. 创建 `.github/workflows/ci.yml`：
   ```yaml
   name: CI

   on:
     push:
       branches: [main, master]
     pull_request:
       branches: [main, master]

   jobs:
     test:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4

         - name: Setup Node.js
           uses: actions/setup-node@v4
           with:
             node-version: '22'
             cache: 'npm'

         - name: Install dependencies
           run: npm ci

         - name: TypeScript check
           run: npx tsc --noEmit

         - name: Run tests
           run: npm run test

     rust-check:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4

         - name: Setup Rust
           uses: dtolnay/rust-toolchain@stable

         - name: Install system dependencies
           run: |
             sudo apt-get update
             sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev

         - name: Cargo check
           working-directory: src-tauri
           run: cargo check
   ```

2. 确保 `package-lock.json` 是最新的（`npm ci` 依赖它）
3. 确保 vitest 配置不依赖 jsdom 之外的浏览器环境
4. 推送到 GitHub 验证流水线运行

**验收**：
- [ ] `.github/workflows/ci.yml` 创建
- [ ] push 后 GitHub Actions 自动运行
- [ ] TypeScript check + vitest + cargo check 三个 job 都通过
- [ ] PR 页面显示 CI 状态检查

---

## 四、执行顺序 & 里程碑

```
第 1 批（低风险重构 + CI，~5h）：
  P4-01 拆分 WeekView + MonthView    (2h)
  P4-02 拆分 task_commands.rs        (1h)
  P4-08 GitHub Actions CI            (2h)
  → 验收点 A：tsc + cargo + test + CI 绿

第 2 批（功能增强，~8h）：
  P4-03 后端 LLM 流式                 (3h)
  P4-04 前端 AI 打字机效果            (3h)
  P4-07 全文搜索增强                  (2h)
  → 验收点 B：AI 对话打字机效果 + 搜索命中备注/子任务

第 3 批（数据导出/导入，~4h）：
  P4-05 后端导出/导入 command         (2h)
  P4-06 前端导出/导入 UI              (2h)
  → 验收点 C：导出 JSON/CSV/MD + 导入 JSON
```

**每批完成后**：
1. `tsc --noEmit` + `cargo check` + `npm run test` 通过
2. `npm run tauri dev` 手动测试
3. git commit + push
4. CI 自动运行

---

## 五、给 workbuddy / Trae 的指令建议

### 第 1 批指令（P4-01 + P4-02 + P4-08，可并行）

```
# P4-01：拆分 WeekView + MonthView
"重构 src/components/WeekView.tsx (600行) 和 src/components/MonthView.tsx (531行)。
1) 创建 src/components/calendar/ 目录
2) 提取共享逻辑：
   - shared/TaskBar.tsx — 任务条组件（两视图共用）
   - shared/lunarUtils.ts — 农历标签计算
   - shared/taskBarColor.ts — 任务条颜色
   - shared/types.ts — 共享类型
3) MonthView.tsx 和 WeekView.tsx 引用共享组件
4) 更新 CalendarView.tsx 的 import 路径
5) 目标：MonthView ≤ 300 行，WeekView ≤ 300 行
6) tsc --noEmit 通过。纯重构。"

# P4-02：拆分 task_commands.rs
"重构 src-tauri/src/commands/task_commands.rs。当前 585 行，7 个 Tauri command。
1) 拆分为：
   - task_crud.rs — get_tasks / create_task / update_task / delete_task / duplicate_task
   - task_ops.rs — reorder_tasks / complete_task（含重复规则处理）
2) task_commands.rs 改为 mod 声明 + re-export
3) commands/mod.rs 的 import 路径不变
4) cargo check 通过。纯重构。"

# P4-08：GitHub Actions CI
"创建 .github/workflows/ci.yml。
配置两个 job：
1) test：Node 22 + npm ci + tsc --noEmit + npm run test
2) rust-check：Rust stable + 系统依赖 + cargo check
触发条件：push 到 main/master + PR 到 main/master
确保 package-lock.json 是最新的。"
```

### 第 2 批指令（P4-03 + P4-04 + P4-07）

```
# P4-03：后端 LLM 流式
"在 src-tauri/src/llm.rs 中新增 llm_chat_stream 函数。
- 接收 AppHandle + LLMConfig + messages + skill
- 用 reqwest 发送 stream=true 的请求
- 解析 SSE 格式（data: {...}\n\n）
- 每个 chunk 通过 app.emit('llm-chat-chunk', delta) 发送
- 完成后 app.emit('llm-chat-done', full_content)
- 保留原 llm_chat 作为 fallback
在 lib.rs 注册 llm_chat_stream。
cargo check 通过。"

# P4-04：前端 AI 打字机效果
"修改 src/components/AIAssistant.tsx 接入流式响应。
1) 在 api.ts 添加 llmChatStream 封装（用 @tauri-apps/api/event 的 listen）
2) AIAssistant.tsx 的 sendMessage 改为调用 llmChatStream
3) onChunk 追加到当前 AI 回复内容（打字机效果）
4) onDone 标记回复完成
5) 添加'取消生成'按钮（调用返回的 unlisten 函数）
6) AI 思考时显示加载动画
tsc --noEmit 通过。"

# P4-07：全文搜索增强
"修改 src/hooks/useTaskFiltering.ts 的搜索逻辑。
1) 当前只匹配 task.title，扩展为：
   - task.title
   - task.notes
   - 子任务标题（tasks.filter(t => t.parent_id === task.id)）
2) 修改 TaskListPanel.tsx 的搜索框 placeholder 为'搜索标题、备注、子任务...'
3) 在 TaskItem.tsx 中添加匹配来源标签（'备注命中'/'子任务命中'）
4) 新增搜索测试用例 ≥5 个
5) tsc + test 通过。"
```

### 第 3 批指令（P4-05 + P4-06）

```
# P4-05：后端导出/导入
"创建 src-tauri/src/commands/data_commands.rs。
实现 4 个 Tauri command：
1) export_json — 导出所有任务/清单/标签/习惯为 JSON
2) export_csv — 导出任务列表为 CSV
3) export_markdown — 导出任务为 Markdown（按清单分组）
4) import_json — 导入 JSON，支持 merge/replace 两种模式
在 commands/mod.rs 和 lib.rs 注册。
cargo check 通过。"

# P4-06：前端导出/导入 UI
"修改 src/components/settings/SystemPanel.tsx。
1) 在 api.ts 添加 exportJson/exportCsv/exportMarkdown/importJson 封装
2) SystemPanel 添加'导出数据'区域：3 个按钮（JSON/CSV/Markdown）
3) SystemPanel 添加'导入数据'区域：文件选择 + 模式选择（合并/替换）+ 确认
4) 导出用 @tauri-apps/plugin-dialog 的 save + @tauri-apps/plugin-fs 的 writeTextFile
5) 导入用 open + readTextFile
6) 导出/导入后有 Toast 提示
tsc --noEmit 通过。"
```

---

## 六、验收清单（最终）

### 编译
- [ ] `tsc --noEmit` 通过
- [ ] `cargo check` 通过
- [ ] `npm run test` 全部通过（≥156 用例）
- [ ] GitHub Actions CI 绿

### 文件行数
- [ ] 没有任何 `.tsx` / `.ts` 文件超过 500 行
- [ ] 没有任何 `.rs` 文件超过 300 行

### 功能回归
- [ ] 任务 CRUD + 子任务 + 拖拽 + 批量
- [ ] 日历视图（月/周/日/甘特/看板）
- [ ] AI 助手 10 个技能 + **打字机效果** + **可取消**
- [ ] 习惯打卡 + 番茄钟
- [ ] 深色模式 + 字体 + 密度
- [ ] **搜索命中标题/备注/子任务**
- [ ] **导出 JSON/CSV/Markdown**
- [ ] **导入 JSON（合并/替换）**

### CI/CD
- [ ] `.github/workflows/ci.yml` 创建
- [ ] push 后自动运行 tsc + test + cargo check
- [ ] PR 页面显示 CI 状态

### 版本管理
- [ ] 版本号 bump 到 v1.24.0
- [ ] README 更新日志
- [ ] git commit + push

---

## 七、风险控制

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| P4-03 SSE 解析错误 | 中 | 中 | 保留 llm_chat 非 流式 fallback |
| P4-04 event 监听器泄漏 | 中 | 低 | onDone 时 unlisten，组件卸载时清理 |
| P4-05 导入数据格式不兼容 | 低 | 高 | 版本号校验 + dry-run 预览 |
| P4-06 大文件导出卡顿 | 低 | 低 | 后端生成完整字符串，前端一次写入 |
| P4-08 CI 系统依赖安装失败 | 中 | 低 | 用 ubuntu-latest + apt 装 webkit2gtk |

**回滚策略**：
- A 方向：每任务一个 commit
- B 方向：保留非流式 fallback，流式出问题可切回
- C 方向：导入前校验格式，替换模式先备份

---

## 八、Phase 4 之后的展望（Phase 5 候选）

1. **任务模板系统** — 常用任务快速创建
2. **多设备同步** — Git / WebDAV / 网盘
3. **主题市场** — 自定义主题分享
4. **国际化 i18n** — 中/英切换
5. **E2E 测试** — Playwright/Cypress
6. **性能优化** — 虚拟列表、懒加载、SQL 优化
7. **插件系统** — 第三方扩展

---

## 九、不建议在 Phase 4 做的事

1. ❌ **不拆 AIAssistant.tsx** — 加完流式响应后可能超 500 行，Phase 5 再拆
2. ❌ **不拆 CalendarView.tsx** — 473 行可接受，结构清晰
3. ❌ **不做 E2E 测试** — Phase 5 做
4. ❌ **不做多设备同步** — Phase 5 做
5. ❌ **不改数据库表结构** — Phase 3 够用

Phase 4 的核心目标：**拆完最后大文件 + AI 流式 + 数据导出 + 全文搜索 + CI 自动化**。
