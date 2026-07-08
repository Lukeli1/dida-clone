#!/usr/bin/env node
/**
 * 半自动发版脚本
 *
 * 用法：node scripts/publish-release.mjs <版本号> [更新说明]
 * 示例：node scripts/publish-release.mjs 1.36.0 "新增自动更新功能"
 *
 * 前置条件：
 * 1. 已设置环境变量 TAURI_SIGNING_PRIVATE_KEY 和 TAURI_SIGNING_PRIVATE_KEY_PASSWORD
 * 2. 已执行 npm run tauri build 生成了 bundle 产物
 * 3. 已安装 gh CLI 并登录（gh auth login）
 *
 * Tauri v2 updater 产物说明：
 * - createUpdaterArtifacts: true 时，Tauri 生成 .exe 安装包 + .exe.sig 签名文件
 * - 部分版本生成 .nsis.zip + .nsis.zip.sig，本脚本兼容两种情况
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
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
const files = readdirSync(bundleDir)

// 优先查找 .nsis.zip（旧版 Tauri），找不到则用 .exe（新版 Tauri v2.11+）
let installerFileName = files.find((f) => f.endsWith('.nsis.zip') && !f.endsWith('.sig'))
let sigFileName = files.find((f) => f.endsWith('.nsis.zip.sig'))

if (!installerFileName) {
  // 新版 Tauri：使用 .exe + .exe.sig
  installerFileName = files.find(
    (f) => f.endsWith('-setup.exe') && f.includes(version) && !f.endsWith('.sig'),
  )
  sigFileName = files.find(
    (f) => f.endsWith('-setup.exe.sig') && f.includes(version),
  )
}

if (!installerFileName || !sigFileName) {
  console.error('未找到安装包或签名文件，请先执行 npm run tauri build')
  console.error('查找目录:', bundleDir)
  console.error('目录文件:', files)
  process.exit(1)
}

const installerFile = join(bundleDir, installerFileName)
const sigFile = join(bundleDir, sigFileName)

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
      url: `https://github.com/Lukeli1/dida-clone/releases/download/v${version}/${installerFileName}`,
    },
  },
}

const outputPath = join(root, 'latest.json')
writeFileSync(outputPath, JSON.stringify(latestJson, null, 2))
console.log(`✅ 已生成 ${outputPath}`)
console.log(`   安装包: ${installerFileName}`)
console.log(`   签名文件: ${sigFileName}`)

// 上传到 GitHub Release
const tag = `v${version}`
console.log(`\n📦 创建 GitHub Release ${tag}...`)
execSync(`gh release create ${tag} --title "v${version}" --notes "${notes}"`, {
  stdio: 'inherit',
  cwd: root,
})

console.log(`\n📤 上传安装包和 latest.json...`)
execSync(`gh release upload ${tag} "${installerFile}" "${outputPath}"`, {
  stdio: 'inherit',
  cwd: root,
})

console.log(`\n✅ 发版完成！v${version} 已发布到 GitHub Releases`)
console.log(`   用户启动应用后将自动检测到新版本`)
