import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_CORNER_STYLE,
  DEFAULT_PRESET_ID,
  getThemePreset,
  type CornerStyle,
  type ThemeMode,
} from '../styles/themes'
import {
  applyThemeConfiguration,
  clearThemeOverride,
  getCurrentTheme,
  isValidHexColor,
  resolveThemeMode,
  saveAccentColor,
  saveCornerStyle,
  savePresetId,
  saveThemeMode,
  type ThemeConfiguration,
} from '../utils/themeUtils'

export type { ThemeMode }

function getSystemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function useTheme() {
  const [configuration, setConfiguration] = useState<ThemeConfiguration>(() => getCurrentTheme())
  const [systemPrefersDark, setSystemPrefersDark] = useState(getSystemPrefersDark)
  const resolvedMode = resolveThemeMode(configuration.mode, systemPrefersDark)

  useEffect(() => {
    applyThemeConfiguration(configuration, systemPrefersDark)
  }, [configuration, systemPrefersDark])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches)
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  const setMode = useCallback((mode: ThemeMode) => {
    saveThemeMode(mode)
    setConfiguration((current) => ({ ...current, mode }))
  }, [])

  const setPreset = useCallback((presetId: string) => {
    const normalizedPresetId = getThemePreset(presetId).id
    savePresetId(normalizedPresetId)
    saveAccentColor(null)
    setConfiguration((current) => ({ ...current, presetId: normalizedPresetId, accentColor: null }))
  }, [])

  const setAccentColor = useCallback((accentColor: string | null) => {
    const normalizedAccent = isValidHexColor(accentColor) ? accentColor.toLowerCase() : null
    saveAccentColor(normalizedAccent)
    setConfiguration((current) => ({ ...current, accentColor: normalizedAccent }))
  }, [])

  const setCornerStyle = useCallback((cornerStyle: CornerStyle) => {
    saveCornerStyle(cornerStyle)
    setConfiguration((current) => ({ ...current, cornerStyle }))
  }, [])

  const resetTheme = useCallback(() => {
    clearThemeOverride()
    savePresetId(DEFAULT_PRESET_ID)
    saveAccentColor(null)
    saveCornerStyle(DEFAULT_CORNER_STYLE)
    setConfiguration((current) => ({
      ...current,
      presetId: DEFAULT_PRESET_ID,
      accentColor: null,
      cornerStyle: DEFAULT_CORNER_STYLE,
    }))
  }, [])

  return {
    ...configuration,
    resolvedMode,
    setMode,
    setPreset,
    setAccentColor,
    setCornerStyle,
    resetTheme,
  }
}
