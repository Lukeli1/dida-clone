# 滴答清单复刻 项目长期记忆

## 双模型协作开发策略

- **贵模型**（DeepSeekV4Pro / GLM5.2）：架构设计、复杂逻辑、代码评审、疑难 Bug、新模块方案
- **便宜模型**（Step7Flash / DeepSeekV4Flash）：按方案写代码、样式批量修改、文档更新、简单重构
- 原则：贵的做决策（架构师+CR），便宜的做执行（程序员）
- 反例：不要让便宜模型做架构决策（会硬编码一个 useState 糊弄）

## Git 操作注意事项

- `git pull/push` 在 bash 中因 Windows Credential Manager 不可用会失败
- 解决方案：`GIT_ASKPASS=echo git pull` / `GIT_ASKPASS=echo git push`
- 优先在完成任务后从 bash 用此方式 push

## 版本号同步

- 每次发版需同步 3 个文件：`package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`
- 历史教训：tauri.conf.json 和 Cargo.toml 多次滞后于 package.json
