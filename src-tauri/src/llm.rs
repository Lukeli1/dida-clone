use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
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
    let client = reqwest::Client::new();

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

/// 调用大模型对话接口
#[tauri::command]
pub async fn llm_chat(
    base_url: String,
    api_key: String,
    model: String,
    system_prompt: String,
    user_message: String,
) -> Result<String, String> {
    let url = build_url(&base_url, "/chat/completions");
    let client = reqwest::Client::new();

    let body = serde_json::json!({
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ],
        "temperature": 0.3
    });

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
