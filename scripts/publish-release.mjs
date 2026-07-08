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

// 用 Node.js fs 查找 .nsis.zip 和 .sig 文件（兼容 Windows）
const files = readdirSync(bundleDir)
const zipFileName = files.find((f) => f.endsWith('.nsis.zip') && !f.endsWith('.sig'))
const sigFileName = files.find((f) => f.endsWith('.nsis.zip.sig'))

if (!zipFileName || !sigFileName) {
  console.error('未找到 .nsis.zip 或 .sig 文件，请先执行 npm run tauri build')
  process.exit(1)
}

const zipFile = join(bundleDir, zipFileName)
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
      url: `https://github.com/Lukeli1/dida-clone/releases/download/v${version}/${zipFileName}`,
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
