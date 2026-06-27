use font_loader::system_fonts;

/// 枚举系统已安装的所有字体族名，按字母排序去重
#[tauri::command]
pub fn list_system_fonts() -> Result<Vec<String>, String> {
    let fonts = system_fonts::query_all();
    let mut sorted = fonts;
    sorted.sort();
    sorted.dedup();
    Ok(sorted)
}
