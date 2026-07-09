#!/usr/bin/env node
/**
 * 版本一致性检查脚本（P5-18）
 *
 * 检查 package.json / package-lock.json / Cargo.toml / tauri.conf.json / README badge 版本是否一致。
 * 用法：node scripts/check-version.mjs
 * 退出码 0 = 一致，1 = 不一致。
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function readText(path) {
  return readFileSync(path, 'utf8')
}

const pkg = readJson(join(root, 'package.json'))
const cargoText = readText(join(root, 'src-tauri/Cargo.toml'))
const tauriConf = readJson(join(root, 'src-tauri/tauri.conf.json'))
const readme = readText(join(root, 'README.md'))

const versions = {
  'package.json': pkg.version,
}

// package-lock.json
const lockText = readText(join(root, 'package-lock.json'))
const lockMatch = lockText.match(/^\s*"version"\s*:\s*"([^"]+)"/m)
if (lockMatch) versions['package-lock.json'] = lockMatch[1]

// Cargo.toml: 提取 version = "x.y.z"
const cargoMatch = cargoText.match(/^version\s*=\s*"([^"]+)"/m)
if (cargoMatch) versions['src-tauri/Cargo.toml'] = cargoMatch[1]

// tauri.conf.json
if (tauriConf.version) versions['src-tauri/tauri.conf.json'] = tauriConf.version

// README badge: ![版本](https://img.shields.io/badge/version-X.Y.Z-blue)
const badgeMatch = readme.match(/badge\/version-([^"-]+)/)
if (badgeMatch) versions['README badge'] = badgeMatch[1]

console.log('版本检查：')
for (const [name, ver] of Object.entries(versions)) {
  console.log(`  ${name}: ${ver}`)
}

const uniqueVersions = new Set(Object.values(versions))
if (uniqueVersions.size === 1) {
  console.log(`\n✅ 所有版本一致：${[...uniqueVersions][0]}`)
  process.exit(0)
} else {
  console.error(`\n❌ 版本不一致！`)
  process.exit(1)
}
