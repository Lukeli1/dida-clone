# 滴答清单自动更新功能实现文档

> 文档日期：2026-07-08
> 适用版本：v1.35.2 及以上
> 当前状态：已实现并重新启用（2026-07-20）。
> 更新源状态：GitHub 仓库已公开，客户端可匿名读取更新清单与 Release 制品。
> 发布方式：通过手动触发的 Windows GitHub Actions workflow 构建、签名和发布，完成后同步 `latest.json` 到 `main`。
> 目标：实现"设置页检查更新 + 启动时自动检查（只提示一次）"，更新包托管在 GitHub Releases，基于 Tauri v2 updater 插件。

---

## 0. 方案概览

| 项 | 选择 |
|---|---|
| 更新插件 | Tauri v2 官方 `tauri-plugin-updater` |
| 更新源 | GitHub Releases（免费，零运维） |
| 检查时机 | 启动后 5 秒自动检查（只提示一次） + 设置页"关于"手动检查 |
| 签名机制 | Tauri signer 生成密钥对，私钥签名安装包，公钥配置在客户端 |
| 更新包格式 | `.nsis.zip`（NSIS 安装包的压缩签名包）+ `.sig` 签名文件 |

### 用户体验流程

```
应用启动 → 5秒后静默检查 → 有新版本？
                              ├─ 是 → Toast 提示一次（记录已提示版本到 localStorage）
                              │       用户不点 → 后续启动不再弹（直到更新版本号变化）
                              │       用户点击 → 跳转"关于"页 → 立即更新 → 下载进度 → 安装重启
                              └─ 否 → 静默

设置 → 关于 → 点"检查更新" → 显示结果（最新版/有更新/失败）
```

---

## 1. 改动文件清单

共涉及 **8 个文件改动 + 2 个新建文件 + 1 个 .gitignore 改动**：

| # | 文件 | 操作 | 说明 |
|---|---|---|---|
| 1 | `.tauri/private.key` | 新建（不提交） | 签名私钥，由 `tauri signer generate` 生成 |
| 2 | `src-tauri/Cargo.toml` | 改 | 添加 `tauri-plugin-updater = "2"` 依赖 |
| 3 | `src-tauri/src/lib.rs` | 改 | 注册 updater 插件 |
| 4 | `src-tauri/tauri.conf.json` | 改 | 配置 updater（pubkey/endpoints）+ createUpdaterArtifacts |
| 5 | `src-tauri/capabilities/default.json` | 改 | 添加 `updater:default` 权限 |
| 6 | `package.json` | 改 | 添加 `@tauri-apps/plugin-updater` 前端依赖 |
| 7 | `src/api/updaterApi.ts` | 新建 | 更新逻辑封装（检查/下载/安装） |
| 8 | `src/components/settings/AboutPanel.tsx` | 改 | 加入"检查更新"按钮 + 更新流程 UI |
| 9 | `src/hooks/useAppInit.ts` | 改 | 启动时自动检查（只提示一次） |
| 10 | `scripts/publish-release.mjs` | 新建 | 半自动发版脚本（打包+上传 GitHub Release） |
| 11 | `.gitignore` | 改 | 添加 `.tauri/` 排除私钥 |

---

## 2. 详细实现步骤

### 步骤 1：生成签名密钥对

```bash
cd "C:\Users\50441\Documents\trae开发\滴答清单复刻"
npx @tauri-apps/cli signer generate -w .tauri/private.key
```

执行后会：
- 提示输入密码（用于保护私钥，记下来，后续打包要用）
- 生成 `.tauri/private.key`（私钥文件）
- 输出公钥字符串（类似 `dW50cnVzdGVkIGNvbW1l...`，**复制保存**，步骤 4 要用）

### 步骤 2：Cargo.toml 添加 updater 依赖

文件：`src-tauri/Cargo.toml`

在 `[dependencies]` 末尾添加：

```toml
tauri-plugin-updater = "2"
```

### 步骤 3：lib.rs 注册 updater 插件

文件：`src-tauri/src/lib.rs`

在 `tauri::Builder::default()` 后的 `.plugin(...)` 链中添加（紧跟现有插件之后）：

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_autostart::init(Default::default(), None))
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_updater::Builder::new().build())  // ← 新增这行
    .on_window_event(...)
```

### 步骤 4：tauri.conf.json 配置 updater

文件：`src-tauri/tauri.conf.json`

改动两处：

**4a. `bundle` 添加 `createUpdaterArtifacts`**：

```json
"bundle": {
    "active": true,
    "targets": "nsis",
    "createUpdaterArtifacts": true,
    "icon": [ ... ]
}
```

> `createUpdaterArtifacts: true` 让 `tauri build` 额外生成 `.nsis.zip`（压缩的安装包）和 `.sig`（签名文件），这是 updater 下载安装所需的格式。

**4b. `plugins` 添加 updater 配置**（替换原来的 `"plugins": {}`）：

```json
"plugins": {
    "updater": {
        "pubkey": "<步骤1生成的公钥字符串>",
        "endpoints": [
            "https://github.com/Lukeli1/dida-clone/releases/latest/download/latest.json"
        ]
    }
}
```

> `endpoints` 指向 GitHub Releases 的 `latest` 别名，会自动解析到最新 Release 的 `latest.json` 文件。

### 步骤 5：capabilities 添加 updater 权限

文件：`src-tauri/capabilities/default.json`

在 `permissions` 数组末尾添加：

```json
"updater:default"
```

完整示例：

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:window:default",
    "core:window:allow-start-dragging",
    "core:window:allow-minimize",
    "core:window:allow-maximize",
    "core:window:allow-unmaximize",
    "core:window:allow-close",
    "core:window:allow-show",
    "core:window:allow-hide",
    "core:window:allow-set-focus",
    "autostart:default",
    "dialog:default",
    "dialog:allow-open",
    "dialog:allow-save",
    "notification:default",
    "notification:allow-notify",
    "notification:allow-is-permission-granted",
    "notification:allow-request-permission",
    "updater:default"
  ]
}
```

### 步骤 6：package.json 添加前端 updater 依赖

```bash
npm install @tauri-apps/plugin-updater
```

### 步骤 7：新建 src/api/updaterApi.ts

封装更新检查、下载、安装逻辑：

```typescript
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { isTauri } from './_shared'

/** 更新检查结果 */
export interface UpdateInfo {
  available: boolean
  version?: string
  notes?: string
  date?: string
}

/**
 * 检查是否有可用更新。
 * 非 Tauri 环境返回 { available: false }。
 */
export async function checkForUpdate(): Promise<UpdateInfo> {
  if (!isTauri) return { available: false }
  try {
    const update = await check()
    if (update) {
      return {
        available: true,
        version: update.version,
        notes: update.body,
        date: update.date,
      }
    }
    return { available: false }
  } catch (e) {
    console.error('检查更新失败:', e)
    throw e
  }
}

/**
 * 下载并安装更新，支持进度回调。
 * 安装完成后自动重启应用。
 */
export async function downloadAndInstall(
  onProgress?: (progress: { chunkLength: number; contentLength?: number }) => void,
): Promise<void> {
  if (!isTauri) throw new Error('非 Tauri 环境')
  const update = await check()
  if (!update) throw new Error('没有可用更新')

  let total = 0
  let downloaded = 0
  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case 'Started':
        total = event.data.contentLength ?? 0
        break
      case 'Progress':
        downloaded += event.data.chunkLength
        onProgress?.({ chunkLength: event.data.chunkLength, contentLength: total })
        break
      case 'Finished':
        break
    }
  })

  // 安装完成后重启
  await relaunch()
}
```

> 注意：`@tauri-apps/plugin-process` 的 `relaunch` 也需要安装：`npm install @tauri-apps/plugin-process`，并在 lib.rs 注册 `.plugin(tauri_plugin_process::init())`，Cargo.toml 添加 `tauri-plugin-process = "2"`。

### 步骤 8：改造 AboutPanel.tsx 加入检查更新 UI

文件：`src/components/settings/AboutPanel.tsx`

在现有版本信息下方新增"检查更新"区域：

```tsx
import { useState } from 'react'
import packageJson from '../../../package.json'
import { checkForUpdate, downloadAndInstall } from '../../api/updaterApi'
import { useToast } from '../Toast'

export function AboutPanel() {
  const toast = useToast()
  const [checking, setChecking] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<{ version: string; notes?: string } | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState(0)

  async function handleCheck() {
    setChecking(true)
    setUpdateInfo(null)
    try {
      const info = await checkForUpdate()
      if (info.available) {
        setUpdateInfo({ version: info.version!, notes: info.notes })
      } else {
        toast.success('已是最新版本')
      }
    } catch {
      toast.error('检查更新失败，请检查网络')
    } finally {
      setChecking(false)
    }
  }

  async function handleUpdate() {
    setDownloading(true)
    setProgress(0)
    try {
      await downloadAndInstall(({ chunkLength, contentLength }) => {
        if (contentLength && contentLength > 0) {
          setProgress((prev) => Math.min(100, prev + (chunkLength / contentLength) * 100))
        }
      })
      // relaunch 会重启应用，代码不会执行到这里
    } catch {
      toast.error('下载更新失败')
      setDownloading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* 现有的版本信息卡片 */}
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] px-4 py-4">
        {/* ...现有内容保持不变... */}
      </div>

      {/* 检查更新区域 */}
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-medium text-[var(--color-text-primary)]">软件更新</p>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">当前版本 {packageJson.version}</p>
          </div>
          <button
            onClick={handleCheck}
            disabled={checking || downloading}
            className="px-4 py-1.5 text-sm font-medium rounded-lg bg-[var(--color-accent)] text-white hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {checking ? '检查中...' : '检查更新'}
          </button>
        </div>

        {/* 发现新版本 */}
        {updateInfo && (
          <div className="mt-3 p-3 rounded-lg bg-[var(--color-accent-light)] border border-[var(--color-accent)]/20">
            <p className="text-sm font-medium text-[var(--color-accent-text)]">
              发现新版本 v{updateInfo.version}
            </p>
            {updateInfo.notes && (
              <pre className="mt-2 text-xs text-[var(--color-text-secondary)] whitespace-pre-wrap font-sans">
                {updateInfo.notes}
              </pre>
            )}
            {downloading ? (
              <div className="mt-3">
                <div className="h-2 rounded-full bg-[var(--color-bg-tertiary)] overflow-hidden">
                  <div
                    className="h-full bg-[var(--color-accent)] transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-1 text-center">
                  下载中... {Math.round(progress)}%
                </p>
              </div>
            ) : (
              <button
                onClick={handleUpdate}
                className="mt-3 w-full py-2 text-sm font-medium rounded-lg bg-[var(--color-accent)] text-white hover:brightness-110 transition-all"
              >
                立即更新
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```

### 步骤 9：useAppInit.ts 启动时自动检查

文件：`src/hooks/useAppInit.ts`

在现有初始化逻辑中添加自动检查更新（建议放在文件末尾、其他 useEffect 之后）：

```typescript
// ===== 启动时自动检查更新（只提示一次） =====
// 启动 5 秒后静默检查，发现新版本时 Toast 提示一次。
// 用 localStorage 记录已提示版本号，用户不点击则后续启动不再弹窗。
useEffect(() => {
  let cancelled = false
  const timer = setTimeout(async () => {
    try {
      const { checkForUpdate } = await import('../api/updaterApi')
      const info = await checkForUpdate()
      if (cancelled || !info.available) return

      // 读取已提示过的版本号
      const promptedKey = 'dida:update_prompted_version'
      const prompted = localStorage.getItem(promptedKey)
      // 同一版本只提示一次
      if (prompted === info.version) return

      toast.info(`发现新版本 v${info.version}，可在"设置 → 关于"中更新`)
      localStorage.setItem(promptedKey, info.version!)
    } catch {
      // 检查失败静默处理（网络问题不打扰用户）
    }
  }, 5000)

  return () => {
    cancelled = true
    clearTimeout(timer)
  }
}, [toast])
```

> 注意：这里用 `localStorage`（而非 storage facade）是为了与现有 useAppInit 风格一致；如需统一可改用 `getItem/setItem` from `../utils/storage`。

### 步骤 10：新建 scripts/publish-release.mjs

半自动发版脚本：打包后生成 latest.json 并上传到 GitHub Release。

```javascript
#!/usr/bin/env node
/**
 * 半自动发版脚本
 *
 * 用法：node scripts/publish-release.mjs <版本号> <更新说明>
 * 示例：node scripts/publish-release.mjs 1.36.0 "新增自动更新功能"
 *
 * 前置条件：
 * 1. 已设置环境变量 TAURI_SIGNING_PRIVATE_KEY 和 TAURI_SIGNING_PRIVATE_KEY_PASSWORD
 * 2. 已执行 npm run tauri build 生成了 bundle 产物
 * 3. 已安装 gh CLI 并登录（gh auth login）
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const version = process.argv[2]
const notes = process.argv[3] || ''
if (!version) {
  console.error('用法: node scripts/publish-release.mjs <版本号> [更新说明]')
  process.exit(1)
}

const bundleDir = join(root, 'src-tauri/target/release/bundle/nsis')
// 找到 .nsis.zip 和 .sig 文件
const zipFile = execSync(`ls "${bundleDir}"/*.nsis.zip`, { encoding: 'utf8' }).trim()
const sigFile = execSync(`ls "${bundleDir}"/*.nsis.zip.sig`, { encoding: 'utf8' }).trim()

if (!existsSync(zipFile) || !existsSync(sigFile)) {
  console.error('未找到 .nsis.zip 或 .sig 文件，请先执行 npm run tauri build')
  process.exit(1)
}

const signature = readFileSync(sigFile, 'utf8').trim()
const pubDate = new Date().toISOString()

// 生成 latest.json
const latestJson = {
  version,
  notes,
  pub_date: pubDate,
  platforms: {
    'windows-x86_64': {
      signature,
      url: `https://github.com/Lukeli1/dida-clone/releases/download/v${version}/滴答清单_${version}_x64-setup.nsis.zip`,
    },
  },
}

const outputPath = join(root, 'latest.json')
writeFileSync(outputPath, JSON.stringify(latestJson, null, 2))
console.log(`✅ 已生成 ${outputPath}`)

// 上传到 GitHub Release
const tag = `v${version}`
console.log(`\n📦 创建 GitHub Release ${tag}...`)
execSync(`gh release create ${tag} --title "v${version}" --notes "${notes}"`, { stdio: 'inherit', cwd: root })

console.log(`\n📤 上传安装包和 latest.json...`)
execSync(`gh release upload ${tag} "${zipFile}" "${outputPath}"`, { stdio: 'inherit', cwd: root })

console.log(`\n✅ 发版完成！v${version} 已发布到 GitHub Releases`)
console.log(`   用户启动应用后将自动检测到新版本`)
```

### 步骤 11：.gitignore 排除私钥

文件：`.gitignore`

添加：

```gitignore
# Tauri updater 签名私钥（绝不提交）
.tauri/
```

---

## 3. 验收标准

```bash
cd "C:\Users\50441\Documents\trae开发\滴答清单复刻"

# 前端
npm run lint          # 0 error
npm run format:check  # 通过
npm run typecheck     # 通过
npm run test          # 全部通过
npm run build         # 通过

# Rust
cd src-tauri
cargo fmt --all -- --check   # 通过
cargo clippy --all-targets -- -D warnings  # 通过
cargo test                   # 全部通过
```

功能验收：
- 设置 → 关于页面有"检查更新"按钮，点击后有反馈（最新版/有更新/失败）
- 启动后 5 秒自动检查逻辑就位（无新版本静默，有新版本 Toast 一次）
- `tauri.conf.json` 中 updater 配置完整（pubkey + endpoints + createUpdaterArtifacts）

---

## 4. 发版流程（实现完成后）

### 给用户分发新版本的完整步骤

```bash
# 1. 改版本号（4 处）
#    package.json / src-tauri/Cargo.toml / src-tauri/tauri.conf.json / README badge
#    可用 npm run check:version 验证一致性

# 2. 设置签名环境变量（私钥密码是步骤1生成时设的）
$env:TAURI_SIGNING_PRIVATE_KEY="路径/.tauri/private.key 的内容"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD="你的私钥密码"

# 3. 打包（会生成 .exe 安装包 + .nsis.zip 更新包 + .sig 签名）
npm run tauri build

# 4. 发布到 GitHub Release（自动生成 latest.json 并上传）
node scripts/publish-release.mjs 1.36.0 "新增自动更新功能"

# 5. 用户客户端自动/手动检查到新版本，下载安装重启
```

---

## 5. 注意事项

1. **私钥安全**：`.tauri/private.key` 绝不能提交 Git（已加入 .gitignore）。私钥丢失后已签名的旧版本无法验证新版本更新，需重新生成密钥对并强制用户手动下载新版。
2. **首次无法验证完整链路**：实现后需要先发一个版本（如 v1.36.0），再发一个更新版本（如 v1.36.1），用 v1.36.0 的客户端测试能否检测到 v1.36.1 的更新。
3. **GitHub Releases 可见性**：仓库如果是 public，任何人都能下载更新包；如果是 private，只有授权用户能访问（updater 请求不带认证）。
4. **process 插件**：`relaunch()` 需要 `@tauri-apps/plugin-process`，需额外安装前端包 + Cargo 依赖 + lib.rs 注册（步骤 7 注释已说明）。
5. **CSP**：当前 `connect-src 'self' https:` 已允许 https，updater 的 GitHub endpoint 不会被 CSP 阻挡。
6. **版本号必须递增**：Tauri updater 用 SemVer 比较，新版本号必须大于当前版本才会触发更新提示。

---

## 6. 依赖补充清单

实现时需要额外安装的依赖：

```bash
# Rust
cd src-tauri
cargo add tauri-plugin-updater@2
cargo add tauri-plugin-process@2

# 前端
npm install @tauri-apps/plugin-updater @tauri-apps/plugin-process
```

`tauri-plugin-process` 用于更新后 `relaunch()` 重启应用。
