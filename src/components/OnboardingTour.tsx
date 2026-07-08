import { getItem, setItem } from '../utils/storage'
import { useState, useEffect } from 'react'
import { Joyride, type Step, type EventData } from 'react-joyride'

/**
 * 新用户引导教程（基于 react-joyride v3）
 *
 * - 首次启动应用时自动弹出，分 5 步介绍核心功能
 * - 通过 localStorage('onboarding_seen') 记录是否已看过
 * - 通过 CSS 变量适配深色模式
 * - 可在 SidebarFooter 中点击"引导教程"重新触发
 *
 * 注意：react-joyride v3 API 与 v2 不同：
 *  - 无默认导出，使用具名导入 { Joyride }
 *  - 回调为 onEvent (EventData)，而非 callback (CallBackProps)
 *  - skipBeacon 取代 disableBeacon
 *  - 按钮通过 options.buttons 控制（含 'skip' 即显示跳过按钮）
 *  - showProgress / zIndex / primaryColor 等放在 options 中
 *  - styles.buttonPrimary 取代 styles.buttonNext，无 styles.options
 */

const TOUR_STEPS: Step[] = [
  {
    target: '.task-input-bar',
    content: '在这里输入任务标题，按 Enter 创建。试试输入"明天下午3点开会"！',
    title: '创建任务',
    skipBeacon: true,
  },
  {
    target: '.sidebar-lists',
    content: '这里是你的清单列表。点击 + 创建新清单，用不同清单分类任务。',
    title: '管理清单',
    skipBeacon: true,
  },
  {
    target: '.calendar-nav',
    content: '切换到日历视图，可视化你的任务安排。支持拖拽调整日期！',
    title: '日历视图',
    skipBeacon: true,
  },
  {
    target: '.ai-assistant-btn',
    content: '点击这里唤醒 AI 助手，可以帮你总结任务、生成周报、智能排序！',
    title: 'AI 助手',
    skipBeacon: true,
  },
  {
    target: '.settings-btn',
    content: '在这里可以切换主题、配置 AI、设置开机自启等。',
    title: '设置',
    skipBeacon: true,
  },
]

export function OnboardingTour() {
  const [run, setRun] = useState(false)

  useEffect(() => {
    const seen = getItem('onboarding_seen')
    if (!seen) {
      // 延迟 1 秒启动，确保 UI 已渲染
      const timer = setTimeout(() => setRun(true), 1000)
      return () => clearTimeout(timer)
    }
  }, [])

  function handleEvent(data: EventData) {
    if (data.status === 'finished' || data.status === 'skipped') {
      setItem('onboarding_seen', 'true')
      setRun(false)
    }
  }

  return (
    <Joyride
      steps={TOUR_STEPS}
      run={run}
      continuous
      options={{
        zIndex: 10000,
        primaryColor: 'var(--color-accent)',
        backgroundColor: 'var(--color-surface)',
        textColor: 'var(--color-text-primary)',
        showProgress: true,
        // 包含 'skip' 以显示跳过按钮（v3 通过 buttons 数组控制，取代 v2 的 showSkipButton）
        buttons: ['back', 'close', 'primary', 'skip'],
      }}
      locale={{ last: '完成', skip: '跳过', next: '下一步', back: '上一步' }}
      styles={{
        tooltip: {
          borderRadius: '12px',
        },
        buttonPrimary: {
          backgroundColor: 'var(--color-accent)',
        },
        buttonBack: {
          color: 'var(--color-text-secondary)',
        },
      }}
      onEvent={handleEvent}
    />
  )
}
