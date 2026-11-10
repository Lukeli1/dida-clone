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
    /// 当前对话的稳定会话标识；仅对 OpenCode 网关作为 x-opencode-session 发送。
    /// 不是 API Key，不写入日志或请求体。
    #[serde(default)]
    pub session_id: Option<String>,
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

fn create_http_client(timeout_secs: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))
}

/// /models 仅用于连接测试；保持既有行为，不携带会话头。
fn build_models_request(
    client: &reqwest::Client,
    base_url: &str,
    api_key: &str,
) -> reqwest::RequestBuilder {
    client
        .get(build_url(base_url, "/models"))
        .header("Authorization", format!("Bearer {}", api_key))
}

const OPENCODE_SESSION_HEADER: &str = "x-opencode-session";

/// 仅 opencode.ai 及其子域需要 x-opencode-session；其他 OpenAI-compatible
/// provider 不注入任何额外头，避免改变既有兼容性。
fn is_opencode_gateway(base_url: &str) -> bool {
    reqwest::Url::parse(base_url)
        .ok()
        .and_then(|url| url.host_str().map(|host| host.to_ascii_lowercase()))
        .map(|host| host == "opencode.ai" || host.ends_with(".opencode.ai"))
        .unwrap_or(false)
}

fn build_chat_request(
    client: &reqwest::Client,
    base_url: &str,
    api_key: &str,
    session_id: Option<&str>,
) -> reqwest::RequestBuilder {
    let request = client
        .post(build_url(base_url, "/chat/completions"))
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json");

    match session_id.map(str::trim).filter(|id| !id.is_empty()) {
        Some(id) if is_opencode_gateway(base_url) => request.header(OPENCODE_SESSION_HEADER, id),
        _ => request,
    }
}

/// 发送 chat/completions 请求并统一状态码错误；流式与非流式共用同一请求边界。
async fn send_chat_request(
    client: &reqwest::Client,
    base_url: &str,
    api_key: &str,
    session_id: Option<&str>,
    body: &serde_json::Value,
) -> Result<reqwest::Response, String> {
    let resp = build_chat_request(client, base_url, api_key, session_id)
        .json(body)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {}: {}", status, body));
    }

    Ok(resp)
}

/// 测试大模型 API 连接，返回可用模型列表
#[tauri::command]
pub async fn test_llm_connection(base_url: String, api_key: String) -> Result<Vec<String>, String> {
    let client = create_http_client(30)?;

    let resp = build_models_request(&client, &base_url, &api_key)
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
    session_id: Option<String>,
) -> Result<String, String> {
    let client = create_http_client(60)?;

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

    let resp =
        send_chat_request(&client, &base_url, &api_key, session_id.as_deref(), &body).await?;

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

    let client = create_http_client(120)?;

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

    let mut response = send_chat_request(
        &client,
        &config.base_url,
        &config.api_key,
        config.session_id.as_deref(),
        &body,
    )
    .await?;

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

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::{SocketAddr, TcpListener, TcpStream};
    use std::sync::{Arc, Mutex};
    use std::thread;

    #[derive(Debug, Clone)]
    struct CapturedRequest {
        method: String,
        path: String,
        headers: Vec<(String, String)>,
    }

    impl CapturedRequest {
        fn header(&self, name: &str) -> Option<&str> {
            self.headers
                .iter()
                .find(|(header_name, _)| header_name == name)
                .map(|(_, value)| value.as_str())
        }
    }

    fn find_header_end(bytes: &[u8]) -> Option<usize> {
        bytes.windows(4).position(|window| window == b"\r\n\r\n")
    }

    fn read_http_request(stream: &mut TcpStream) -> CapturedRequest {
        let mut buffer = Vec::new();
        let mut chunk = [0u8; 1024];

        let header_end = loop {
            let read = stream.read(&mut chunk).expect("read request headers");
            if read == 0 {
                panic!("connection closed before request headers completed");
            }
            buffer.extend_from_slice(&chunk[..read]);
            if let Some(pos) = find_header_end(&buffer) {
                break pos;
            }
        };

        let header_text = String::from_utf8_lossy(&buffer[..header_end]).to_string();
        let mut lines = header_text.split("\r\n");
        let request_line = lines.next().unwrap_or_default();
        let mut request_parts = request_line.split_whitespace();
        let method = request_parts.next().unwrap_or_default().to_string();
        let path = request_parts.next().unwrap_or_default().to_string();

        let mut headers = Vec::new();
        let mut content_length = 0usize;
        for line in lines {
            if let Some((name, value)) = line.split_once(':') {
                let name = name.trim().to_ascii_lowercase();
                let value = value.trim().to_string();
                if name == "content-length" {
                    content_length = value.parse().unwrap_or(0);
                }
                headers.push((name, value));
            }
        }

        let body_start = header_end + 4;
        while buffer.len() < body_start + content_length {
            let read = stream.read(&mut chunk).expect("read request body");
            if read == 0 {
                break;
            }
            buffer.extend_from_slice(&chunk[..read]);
        }

        CapturedRequest {
            method,
            path,
            headers,
        }
    }

    fn write_http_response(stream: &mut TcpStream, status: u16, body: &str) {
        let reason = match status {
            200 => "OK",
            400 => "Bad Request",
            _ => "Error",
        };
        let response = format!(
            "HTTP/1.1 {} {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            status,
            reason,
            body.len(),
            body
        );
        stream
            .write_all(response.as_bytes())
            .expect("write response");
    }

    /// 同进程本地 mock：/models 不校验会话头；OpenCode 的 chat/completions 缺少
    /// 会话头时复刻服务端 400 MissingSessionID。返回监听地址与捕获到的请求。
    fn spawn_mock_gateway() -> (SocketAddr, Arc<Mutex<Vec<CapturedRequest>>>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind mock gateway");
        let addr = listener.local_addr().expect("mock gateway addr");
        let captured = Arc::new(Mutex::new(Vec::new()));
        let captured_in_thread = Arc::clone(&captured);

        thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { continue };
                let request = read_http_request(&mut stream);
                let host = request
                    .header("host")
                    .unwrap_or_default()
                    .to_ascii_lowercase();
                let is_chat =
                    request.method == "POST" && request.path.contains("/chat/completions");
                let has_session = request
                    .header("x-opencode-session")
                    .map(|value| !value.trim().is_empty())
                    .unwrap_or(false);

                let (status, body) = if is_chat && host.contains("opencode.ai") && !has_session {
                    (
                        400,
                        r#"{"type":"MissingSessionID","message":"Request is missing x-opencode-session"}"#,
                    )
                } else if is_chat {
                    (200, r#"{"choices":[{"message":{"content":"mock reply"}}]}"#)
                } else if request.method == "GET" && request.path.contains("/models") {
                    (200, r#"{"data":[{"id":"mock-model"}]}"#)
                } else {
                    (404, r#"{"error":"not found"}"#)
                };

                captured_in_thread
                    .lock()
                    .expect("capture lock")
                    .push(request);
                write_http_response(&mut stream, status, body);
            }
        });

        (addr, captured)
    }

    fn mock_client(addr: SocketAddr) -> reqwest::Client {
        reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .no_proxy()
            .resolve("opencode.ai", addr)
            .resolve("api.openai.com", addr)
            .build()
            .expect("build mock client")
    }

    fn captured_request(
        captured: &Arc<Mutex<Vec<CapturedRequest>>>,
        method: &str,
    ) -> CapturedRequest {
        captured
            .lock()
            .expect("capture lock")
            .iter()
            .find(|request| request.method == method)
            .cloned()
            .expect("matching captured request")
    }

    #[test]
    fn models_connection_test_does_not_require_session_header() {
        let (addr, captured) = spawn_mock_gateway();
        let client = mock_client(addr);

        let models = tauri::async_runtime::block_on(async {
            let response = build_models_request(&client, "http://opencode.ai/zen/v1", "test-key")
                .send()
                .await
                .expect("models request");
            assert!(response.status().is_success());
            response
                .json::<serde_json::Value>()
                .await
                .expect("models json")
        });

        assert_eq!(models["data"][0]["id"], "mock-model");
        assert!(captured_request(&captured, "GET")
            .header("x-opencode-session")
            .is_none());
    }

    #[test]
    fn opencode_chat_without_session_header_reproduces_missing_session_id() {
        let (addr, _captured) = spawn_mock_gateway();
        let client = mock_client(addr);

        let error = tauri::async_runtime::block_on(async {
            send_chat_request(
                &client,
                "http://opencode.ai/zen/v1",
                "test-key",
                None,
                &serde_json::json!({"model":"mock-model","messages":[]}),
            )
            .await
            .expect_err("missing session must be rejected")
        });

        assert!(
            error.contains("MissingSessionID"),
            "unexpected error: {error}"
        );
    }

    #[test]
    fn streaming_chat_with_session_header_is_accepted() {
        let (addr, captured) = spawn_mock_gateway();
        let client = mock_client(addr);

        let response = tauri::async_runtime::block_on(async {
            send_chat_request(
                &client,
                "http://opencode.ai/zen/v1",
                "test-key",
                Some("test-session-id"),
                &serde_json::json!({"model":"mock-model","messages":[],"stream":true}),
            )
            .await
            .expect("streaming chat should be accepted")
        });

        assert!(response.status().is_success());
        assert_eq!(
            captured_request(&captured, "POST").header("x-opencode-session"),
            Some("test-session-id")
        );
    }

    #[test]
    fn non_stream_chat_with_session_header_is_accepted() {
        let (addr, captured) = spawn_mock_gateway();
        let client = mock_client(addr);

        let response = tauri::async_runtime::block_on(async {
            send_chat_request(
                &client,
                "http://opencode.ai/zen/v1",
                "test-key",
                Some("test-session-id"),
                &serde_json::json!({"model":"mock-model","messages":[],"temperature":0.3}),
            )
            .await
            .expect("non-streaming chat should be accepted")
        });

        assert!(response.status().is_success());
        assert_eq!(
            captured_request(&captured, "POST").header("x-opencode-session"),
            Some("test-session-id")
        );
    }

    #[test]
    fn opencode_gateway_detection_is_host_scoped() {
        assert!(is_opencode_gateway("https://opencode.ai/zen/v1"));
        assert!(is_opencode_gateway("https://api.opencode.ai/zen/v1"));
        assert!(!is_opencode_gateway("https://api.openai.com/v1"));
        assert!(!is_opencode_gateway("https://opencode.ai.evil.example/v1"));
        assert!(!is_opencode_gateway("https://notopencode.ai/v1"));
        assert!(!is_opencode_gateway("not a url"));
    }

    #[test]
    fn session_header_is_not_sent_to_other_providers() {
        let (addr, captured) = spawn_mock_gateway();
        let client = mock_client(addr);

        let response = tauri::async_runtime::block_on(async {
            send_chat_request(
                &client,
                "http://api.openai.com/v1",
                "test-key",
                Some("test-session-id"),
                &serde_json::json!({"model":"mock-model","messages":[]}),
            )
            .await
            .expect("non-opencode chat should be accepted")
        });

        assert!(response.status().is_success());
        assert!(captured_request(&captured, "POST")
            .header("x-opencode-session")
            .is_none());
    }

    #[test]
    fn blank_session_id_is_not_sent() {
        let (addr, _captured) = spawn_mock_gateway();
        let client = mock_client(addr);

        let error = tauri::async_runtime::block_on(async {
            send_chat_request(
                &client,
                "http://opencode.ai/zen/v1",
                "test-key",
                Some("   "),
                &serde_json::json!({"model":"mock-model","messages":[]}),
            )
            .await
            .expect_err("blank session must not be sent")
        });

        assert!(
            error.contains("MissingSessionID"),
            "unexpected error: {error}"
        );
    }
}
