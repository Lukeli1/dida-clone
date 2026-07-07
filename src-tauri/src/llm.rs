use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

/// 大模型配置（流式接口复用）
/// #[serde(rename_all = "camelCase")] 让 Rust 蛇形字段名与前端驼峰名自动映射
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LLMConfig {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub reasoning: bool,
    pub reasoning_effort: Option<String>,
}

/// 构建完整 API URL：兼容 base_url 是否已含 /v1
/// - "https://api.openai.com" + "/models" -> "https://api.openai.com/v1/models"
/// - "https://api.openai.com/v1" + "/models" -> "https://api.openai.com/v1/models"
fn build_url(base_url: &str, endpoint: &str) -> String {
    let base = base_url.trim_end_matches('/');
    if base.ends_with("/v1") {
        format!("{}{}", base, endpoint)
    } else {
        format!("{}/v1{}", base, endpoint)
    }
}

/// 测试大模型 API 连接，返回可用模型列表
#[tauri::command]
pub async fn test_llm_connection(base_url: String, api_key: String) -> Result<Vec<String>, String> {
    let url = build_url(&base_url, "/models");
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
        .map_err(|e| format!("连接失败: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {}: {}", status, body));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    let models: Vec<String> = body["data"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|m| m["id"].as_str().map(|s| s.to_string()))
        .collect();

    if models.is_empty() {
        return Err("未找到可用模型".to_string());
    }

    Ok(models)
}

/// 调用大模型对话接口（支持多轮对话）
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn llm_chat(
    base_url: String,
    api_key: String,
    model: String,
    system_prompt: String,
    user_message: String,
    reasoning: Option<bool>,
    reasoning_effort: Option<String>,
    history: Option<Vec<ChatMessage>>,
) -> Result<String, String> {
    let url = build_url(&base_url, "/chat/completions");
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let reasoning_enabled = reasoning.unwrap_or(false);
    let effort = reasoning_effort.unwrap_or_else(|| "medium".to_string());

    // 构建消息列表：system + history + user
    let mut messages: Vec<serde_json::Value> =
        vec![serde_json::json!({"role": "system", "content": system_prompt})];
    if let Some(hist) = &history {
        for msg in hist {
            messages.push(serde_json::json!({"role": msg.role, "content": msg.content}));
        }
    }
    messages.push(serde_json::json!({"role": "user", "content": user_message}));

    let mut body = serde_json::json!({
        "model": model,
        "messages": messages
    });
    if reasoning_enabled {
        body["reasoning_effort"] = serde_json::Value::String(effort);
    } else {
        body["temperature"] = serde_json::json!(0.3);
    }

    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {}: {}", status, body));
    }

    let resp_body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    let content = resp_body["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string();

    Ok(content)
}

/// 调用大模型对话接口（流式 SSE，通过 Tauri 事件逐步推送 token）
///
/// 发送两类事件：
/// - `llm-chat-chunk`：每收到一段增量内容（delta）时触发，payload 为该段字符串
/// - `llm-chat-done`：流结束时触发，payload 为完整拼接内容
///
/// 保留 `llm_chat` 作为非流式 fallback，本函数与之共享 `build_url` 与 reasoning 处理逻辑。
#[tauri::command]
pub async fn llm_chat_stream(
    app: AppHandle,
    config: LLMConfig,
    messages: Vec<ChatMessage>,
    skill: Option<String>,
) -> Result<(), String> {
    // 当前 messages 已可包含 system 角色消息；skill 预留给未来基于技能构建 system prompt 的扩展。
    let _ = &skill;

    let url = build_url(&config.base_url, "/chat/completions");
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let mut body = serde_json::json!({
        "model": config.model,
        "messages": messages,
        "stream": true,
    });

    // 如果配置了 reasoning，添加 reasoning_effort
    if config.reasoning {
        if let Some(effort) = &config.reasoning_effort {
            body["reasoning_effort"] = serde_json::Value::String(effort.clone());
        }
    }

    let mut response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("HTTP {}: {}", status, body));
    }

    let mut buffer = String::new();
    let mut full_content = String::new();

    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| format!("读取流失败: {}", e))?
    {
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        // SSE 格式：每个事件以 \n\n 结尾。
        // chunk 可能不完整（半个 JSON）或多事件合并，故用 buffer 累积到完整事件再解析。
        while let Some(pos) = buffer.find("\n\n") {
            let event = buffer[..pos].to_string();
            buffer = buffer[pos + 2..].to_string();

            // 一个事件内可能含多行（以 \n 分隔），逐行处理，兼容 \r\n 行尾
            for line in event.split('\n') {
                let line = line.trim_end_matches('\r');
                let json_str = match line.strip_prefix("data: ") {
                    Some(s) => s,
                    None => continue,
                };

                if json_str == "[DONE]" {
                    app.emit("llm-chat-done", &full_content)
                        .map_err(|e| e.to_string())?;
                    return Ok(());
                }

                // 单行 JSON 仍可能因网络分包而不完整，但已由 \n\n 边界保证完整事件；
                // 解析失败时跳过该行，避免单条坏数据中断整条流。
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(json_str) {
                    if let Some(delta) = parsed["choices"][0]["delta"]["content"].as_str() {
                        if !delta.is_empty() {
                            full_content.push_str(delta);
                            app.emit("llm-chat-chunk", delta)
                                .map_err(|e| e.to_string())?;
                        }
                    }
                }
            }
        }
    }

    // 流自然结束（未收到 [DONE]）也要发送完成事件
    app.emit("llm-chat-done", &full_content)
        .map_err(|e| e.to_string())?;
    Ok(())
}
