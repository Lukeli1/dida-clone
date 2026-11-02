import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OnboardingTour } from '../OnboardingTour'

vi.mock('react-joyride', () => ({
  Joyride: ({ run }: { run: boolean }) => <div data-testid="joyride" data-run={run ? 'true' : 'false'} />,
}))

describe('OnboardingTour 首次启动引导', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.removeItem('onboarding_seen')
    localStorage.removeItem('dida:onboarding_seen')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('未看过引导时首次启动自动开始', () => {
    render(<OnboardingTour />)
    expect(screen.getByTestId('joyride')).toHaveAttribute('data-run', 'false')

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByTestId('joyride')).toHaveAttribute('data-run', 'true')
  })

  it('已看过引导时不自动开始', () => {
    localStorage.setItem('onboarding_seen', 'true')
    render(<OnboardingTour />)

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.getByTestId('joyride')).toHaveAttribute('data-run', 'false')
  })
})
