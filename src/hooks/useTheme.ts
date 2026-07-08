import { getItem, setItem } from '../utils/storage'
// 主题持久化 hook：统一管理模式（浅色/深色/系统）+ 预设 + 强调色

import { useState, useEffect, useCallback } from 'react'
import {
  applyThemePreset,
  applyAccentColor,
  savePresetId,
  saveAccentColor,
  clearThemeOverride,
} from '../utils/themeUtils'
import { DEFAULT_PRESET_ID } from '../styles/themes'

export type ThemeMode = 'light' | 'dark' | 'system'

export interface ThemeState {
  mode: ThemeMode
  presetId: string
  accentColor: string | null
}

const STORAGE_MODE = 'theme'
const STORAGE_PRESET = 'theme_preset'
const STORAGE_ACCENT = 'theme_accent'

/** 应用深色模式 class */
function applyDarkClass(mode: ThemeMode): void {
  const root = document.documentElement
  if (mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    return (getItem(STORAGE_MODE) as ThemeMode) || 'system'
  })
  const [presetId, setPresetIdState] = useState<string>(() => {
    return getItem(STORAGE_PRESET) || DEFAULT_PRESET_ID
  })
  const [accentColor, setAccentColorState] = useState<string | null>(() => {
    return getItem(STORAGE_ACCENT)
  })

  // 监听系统主题变化（system 模式下自动切换）
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    function handleChange() {
      if (mode === 'system') {
        applyDarkClass('system')
      }
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [mode])

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode)
    setItem(STORAGE_MODE, newMode)
    applyDarkClass(newMode)
  }, [])

  const setPreset = useCallback((newPresetId: string) => {
    setPresetIdState(newPresetId)
    savePresetId(newPresetId)
    // 选择预设主题时清除自定义强调色
    setAccentColorState(null)
    saveAccentColor(null)
    applyThemePreset(newPresetId)
  }, [])

  const setAccentColor = useCallback((color: string | null) => {
    setAccentColorState(color)
    saveAccentColor(color)
    if (color) {
      applyAccentColor(color)
    }
  }, [])

  const resetTheme = useCallback(() => {
    setPresetIdState(DEFAULT_PRESET_ID)
    setAccentColorState(null)
    savePresetId(DEFAULT_PRESET_ID)
    saveAccentColor(null)
    clearThemeOverride()
    applyThemePreset(DEFAULT_PRESET_ID)
  }, [])

  return {
    mode,
    presetId,
    accentColor,
    setMode,
    setPreset,
    setAccentColor,
    resetTheme,
  }
}
