// WebDAV 数据同步核心模块（P11-04）
//
// 基于 reqwest crate 实现本地 SQLite 数据库文件（dida.db）与 WebDAV 服务器的双向同步。
// 支持坚果云、Nextcloud、群晖等标准 WebDAV 服务。
// 同步策略：整文件覆盖，通过比较本地/远程文件修改时间决定上传或下载。

use chrono::{DateTime, Utc};
use quick_xml::events::Event;
use quick_xml::Reader as XmlReader;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::path::Path;

/// WebDAV 连接配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebDavConfig {
    /// WebDAV 服务根地址，如 https://dav.jianguoyun.com/dav/
    pub url: String,
    /// 用户名
    pub username: String,
    /// 密码（坚果云为应用密码）
    pub password: String,
    /// 远程文件路径，如 /dida-clone/dida.db
    pub remote_path: String,
}

/// WebDAV 客户端
pub struct WebDavClient {
    config: WebDavConfig,
    client: Client,
}

impl WebDavClient {
    pub fn new(config: WebDavConfig) -> Self {
        // 允许自签证书（群晖 NAS 等自托管场景）
        let client = Client::builder()
            .danger_accept_invalid_certs(true)
            .build()
            .unwrap_or_else(|_| Client::new());
        Self { config, client }
    }

    /// 拼接完整的 WebDAV URL（自动处理首尾斜杠）
    fn build_url(&self, path: &str) -> String {
        let base = self.config.url.trim_end_matches('/');
        let p = path.trim_start_matches('/');
        format!("{}/{}", base, p)
    }

    /// 确保远程目录存在（逐级 MKCOL，忽略已存在的 405 错误）
    pub async fn ensure_remote_dir(&self) -> Result<(), String> {
        let path_parts: Vec<&str> = self
            .config
            .remote_path
            .split('/')
            .filter(|s| !s.is_empty())
            .collect();

        // 逐级创建目录（最后一项是文件名，跳过）
        let mut current_path = String::new();
        for part in &path_parts[..path_parts.len().saturating_sub(1)] {
            if current_path.is_empty() {
                current_path = format!("/{}", part);
            } else {
                current_path = format!("{}/{}", current_path, part);
            }
            let url = self.build_url(&current_path);
            // MKCOL 可能返回 405（目录已存在）或 301，这些都是正常的
            let _ = self
                .client
                .request(reqwest::Method::from_bytes(b"MKCOL").unwrap(), &url)
                .basic_auth(&self.config.username, Some(&self.config.password))
                .send()
                .await;
        }
        Ok(())
    }

    /// 上传本地文件到 WebDAV
    pub async fn upload(&self, local_db_path: &Path) -> Result<(), String> {
        let file_data = tokio::fs::read(local_db_path)
            .await
            .map_err(|e| format!("读取数据库失败: {}", e))?;

        self.ensure_remote_dir().await?;

        let url = self.build_url(&self.config.remote_path);
        let resp = self
            .client
            .put(&url)
            .basic_auth(&self.config.username, Some(&self.config.password))
            .body(file_data)
            .send()
            .await
            .map_err(|e| format!("上传失败: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("上传失败: HTTP {} {}", status, body));
        }
        Ok(())
    }

    /// 下载远程文件到本地
    pub async fn download(&self, local_db_path: &Path) -> Result<(), String> {
        let url = self.build_url(&self.config.remote_path);
        let resp = self
            .client
            .get(&url)
            .basic_auth(&self.config.username, Some(&self.config.password))
            .send()
            .await
            .map_err(|e| format!("下载失败: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("下载失败: HTTP {} {}", status, body));
        }

        let data = resp
            .bytes()
            .await
            .map_err(|e| format!("读取响应失败: {}", e))?;

        tokio::fs::write(local_db_path, &data)
            .await
            .map_err(|e| format!("写入文件失败: {}", e))?;
        Ok(())
    }

    /// 测试连接：通过 PROPFIND 请求验证 URL 和凭据
    pub async fn test_connection(&self) -> Result<bool, String> {
        let url = self.build_url("");
        let body = r#"<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:resourcetype/>
  </D:prop>
</D:propfind>"#;

        let resp = self
            .client
            .request(reqwest::Method::from_bytes(b"PROPFIND").unwrap(), &url)
            .header("Depth", "0")
            .header("Content-Type", "application/xml")
            .basic_auth(&self.config.username, Some(&self.config.password))
            .body(body)
            .send()
            .await
            .map_err(|e| format!("连接失败: {}", e))?;

        let status = resp.status().as_u16();
        // 207 Multi-Status 是 PROPFIND 成功的标准响应
        // 200 也视为成功（部分服务器返回 200）
        Ok(status == 207 || status == 200)
    }

    /// 获取远程文件的最后修改时间（PROPFIND + XML 解析）
    /// 返回 None 表示远程文件不存在
    pub async fn get_remote_mtime(&self) -> Result<Option<DateTime<Utc>>, String> {
        let url = self.build_url(&self.config.remote_path);
        let body = r#"<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:getlastmodified/>
  </D:prop>
</D:propfind>"#;

        let resp = self
            .client
            .request(reqwest::Method::from_bytes(b"PROPFIND").unwrap(), &url)
            .header("Depth", "0")
            .header("Content-Type", "application/xml")
            .basic_auth(&self.config.username, Some(&self.config.password))
            .body(body)
            .send()
            .await
            .map_err(|e| format!("PROPFIND 失败: {}", e))?;

        let status = resp.status().as_u16();
        // 404 表示远程文件不存在
        if status == 404 {
            return Ok(None);
        }
        if !resp.status().is_success() && status != 207 {
            return Err(format!("PROPFIND 失败: HTTP {}", status));
        }

        let text = resp
            .text()
            .await
            .map_err(|e| format!("读取响应失败: {}", e))?;

        // 解析 XML，提取 getlastmodified 元素的文本内容
        let last_modified = parse_propfind_last_modified(&text)?;

        match last_modified {
            Some(date_str) => {
                // RFC 2822 格式: "Wed, 21 Oct 2015 07:28:00 GMT"
                let dt = DateTime::parse_from_rfc2822(&date_str)
                    .map_err(|e| format!("解析远程时间失败: {} (原始值: {})", e, date_str))?;
                Ok(Some(dt.with_timezone(&Utc)))
            }
            None => Ok(None),
        }
    }
}

/// 解析 PROPFIND 响应 XML，提取 getlastmodified 元素的文本值
/// 使用 quick-xml 遍历 XML 事件流
fn parse_propfind_last_modified(xml: &str) -> Result<Option<String>, String> {
    let mut reader = XmlReader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut buf = Vec::new();
    let mut in_getlastmodified = false;
    let mut result: Option<String> = None;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let name_bytes = e.name().as_ref().to_vec();
                let name = String::from_utf8_lossy(&name_bytes);
                // 匹配带命名空间前缀的 getlastmodified（如 D:getlastmodified 或 d:getlastmodified）
                if name.ends_with("getlastmodified") {
                    in_getlastmodified = true;
                }
            }
            Ok(Event::Empty(_)) => {
                // 自闭合标签，无文本内容
            }
            Ok(Event::Text(e)) if in_getlastmodified => {
                let text = e.unescape().map(|s| s.to_string()).unwrap_or_default();
                if !text.is_empty() {
                    result = Some(text);
                }
            }
            Ok(Event::End(e)) => {
                let name_bytes = e.name().as_ref().to_vec();
                let name = String::from_utf8_lossy(&name_bytes);
                if name.ends_with("getlastmodified") {
                    in_getlastmodified = false;
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("XML 解析失败: {}", e)),
            _ => {}
        }
        buf.clear();
    }

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_propfind_last_modified() {
        let xml = r#"<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/dida-clone/dida.db</D:href>
    <D:propstat>
      <D:prop>
        <D:getlastmodified>Wed, 21 Oct 2015 07:28:00 GMT</D:getlastmodified>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>"#;

        let result = parse_propfind_last_modified(xml).unwrap();
        assert_eq!(result, Some("Wed, 21 Oct 2015 07:28:00 GMT".to_string()));
    }

    #[test]
    fn test_parse_propfind_no_last_modified() {
        let xml = r#"<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/dida-clone/dida.db</D:href>
    <D:propstat>
      <D:prop/>
      <D:status>HTTP/1.1 404 Not Found</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>"#;

        let result = parse_propfind_last_modified(xml).unwrap();
        assert_eq!(result, None);
    }

    #[test]
    fn test_build_url() {
        let config = WebDavConfig {
            url: "https://dav.jianguoyun.com/dav/".to_string(),
            username: "test".to_string(),
            password: "pass".to_string(),
            remote_path: "/dida-clone/dida.db".to_string(),
        };
        let client = WebDavClient::new(config);
        assert_eq!(
            client.build_url("/dida-clone/dida.db"),
            "https://dav.jianguoyun.com/dav/dida-clone/dida.db"
        );
    }
}
