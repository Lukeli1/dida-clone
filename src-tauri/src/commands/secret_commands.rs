//! 凭据安全存储命令（P1-08，P1-03 升级为 OS keychain）
//!
//! 使用 `keyring` crate 接入操作系统级凭据存储：
//! - Windows：Credential Manager（DPAPI 加密）
//! - macOS：Keychain
//! - Linux：Secret Service（GNOME Keyring / KWallet）
//!
//! 相比之前的 hex 编码文件存储，OS keychain 提供真正的加密与系统级访问控制。
//! 若 keyring 在当前环境不可用（如无头 Linux 无 D-Bus），回退到 app_data_dir 下的
//! secrets 文件（仅作降级，不保证安全，会记录警告）。

use keyring::Entry;
use tauri::{AppHandle, Manager};

/// keyring service 名（统一命名空间）
const SERVICE_NAME: &str = "com.dida.local";

/// keyring 不可用时的文件回退路径
fn fallback_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取 app_data_dir 失败: {}", e))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建 app_data_dir 失败: {}", e))?;
    Ok(dir.join("secrets.json"))
}

fn load_fallback(app: &AppHandle) -> std::collections::HashMap<String, String> {
    let path = match fallback_path(app) {
        Ok(p) => p,
        Err(_) => return std::collections::HashMap::new(),
    };
    if !path.exists() {
        return std::collections::HashMap::new();
    }
    let content = std::fs::read_to_string(&path).unwrap_or_default();
    serde_json::from_str::<std::collections::HashMap<String, String>>(&content).unwrap_or_default()
}

fn save_fallback(
    app: &AppHandle,
    map: &std::collections::HashMap<String, String>,
) -> Result<(), String> {
    let path = fallback_path(app)?;
    let content = serde_json::to_string_pretty(map).map_err(|e| format!("序列化失败: {}", e))?;
    std::fs::write(&path, content).map_err(|e| format!("写入 secrets.json 失败: {}", e))?;
    Ok(())
}

/// 清理文件 fallback 中的同名凭据。
///
/// 即使 OS keychain 操作成功，也必须清理 fallback，避免历史降级文件中的旧 secret
/// 在后续内部读取（如 WebDAV 密码）时被误用。
fn remove_fallback_key(app: &AppHandle, key: &str) -> Result<(), String> {
    let mut map = load_fallback(app);
    if map.remove(key).is_some() {
        save_fallback(app, &map)?;
    }
    Ok(())
}

/// 写入凭据到 OS keychain（失败时回退到文件存储并警告）
#[tauri::command]
pub fn set_secret(app: AppHandle, key: String, value: String) -> Result<(), String> {
    let save_to_fallback = |reason: &dyn std::fmt::Display| {
        eprintln!("[secret] keychain 写入不可验证，回退到文件存储: {}", reason);
        let mut map = load_fallback(&app);
        map.insert(key.clone(), value.clone());
        save_fallback(&app, &map)
    };

    let entry = match Entry::new(SERVICE_NAME, &key) {
        Ok(entry) => entry,
        Err(e) => return save_to_fallback(&e),
    };

    if let Err(e) = entry.set_password(&value) {
        return save_to_fallback(&e);
    }

    // 使用新 Entry 回读，确保当前构建实际接入了可跨调用持久化的系统凭据库。
    match Entry::new(SERVICE_NAME, &key).and_then(|entry| entry.get_password()) {
        Ok(saved) if saved == value => {
            if let Err(e) = remove_fallback_key(&app, &key) {
                eprintln!("[secret] keychain 写入成功，但清理 fallback 失败: {}", e);
            }
            Ok(())
        }
        Ok(_) => Err("写入 keychain 后回读值不一致".to_string()),
        Err(e) => save_to_fallback(&e),
    }
}

/// 从 OS keychain 读取凭据（失败时回退到文件存储）
#[tauri::command]
pub fn get_secret(app: AppHandle, key: String) -> Result<Option<String>, String> {
    match Entry::new(SERVICE_NAME, &key) {
        Ok(entry) => match entry.get_password() {
            Ok(v) => Ok(Some(v)),
            Err(keyring::Error::NoEntry) => Ok(load_fallback(&app).get(&key).cloned()),
            Err(e) => {
                eprintln!("[secret] keychain get_password 失败，尝试文件回退: {}", e);
                Ok(load_fallback(&app).get(&key).cloned())
            }
        },
        Err(e) => {
            eprintln!("[secret] keychain 不可用，尝试文件回退: {}", e);
            Ok(load_fallback(&app).get(&key).cloned())
        }
    }
}

/// 从 OS keychain 删除凭据（失败时回退到文件存储）
#[tauri::command]
pub fn delete_secret(app: AppHandle, key: String) -> Result<(), String> {
    let keyring_result = match Entry::new(SERVICE_NAME, &key) {
        Ok(entry) => match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => {
                eprintln!(
                    "[secret] keychain delete 失败，仍会继续清理 fallback: {}",
                    e
                );
                Err(format!("删除 keychain 凭据失败: {}", e))
            }
        },
        Err(e) => {
            eprintln!("[secret] keychain 不可用，仍会继续清理 fallback: {}", e);
            Ok(())
        }
    };

    remove_fallback_key(&app, &key)?;
    keyring_result
}

/// 内部同步读取凭据（供其他后端模块调用，如 webdav_commands 取 webdav_password）。
/// 优先 keychain，失败回退文件。
pub fn get_secret_internal(app: &AppHandle, key: &str) -> Option<String> {
    if let Ok(entry) = Entry::new(SERVICE_NAME, key) {
        if let Ok(v) = entry.get_password() {
            return Some(v);
        }
    }
    load_fallback(app).get(key).cloned()
}
