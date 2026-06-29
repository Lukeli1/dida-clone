import type { AISkill } from '../../utils/llm'

interface SkillSelectorProps {
  skills: AISkill[]
  onSelectSkill: (skill: AISkill) => void
  visible: boolean
}

/** 技能快捷选择栏 */
export function SkillSelector({ skills, onSelectSkill, visible }: SkillSelectorProps) {
  if (!visible) return null
  return (
    <div className="border-b border-[var(--color-border-light)] bg-[var(--color-bg-secondary)] p-3">
      <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">⚡ 快捷技能</p>
      <div className="grid grid-cols-5 gap-2">
        {skills.map(skill => (
          <button
            key={skill.id}
            onClick={() => onSelectSkill(skill)}
            className="flex flex-col items-center gap-1 p-2.5 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-light)] transition-all group"
            title={skill.description}
          >
            <span className="text-xl group-hover:scale-110 transition-transform">{skill.icon}</span>
            <span className="text-xs text-[var(--color-text-secondary)] group-hover:text-[var(--color-accent)]">{skill.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

interface WelcomeScreenProps {
  onSendQuickQuestion: (q: string) => void
}

/** 空状态欢迎页 */
export function WelcomeScreen({ onSendQuickQuestion }: WelcomeScreenProps) {
  const quickQuestions = ['我今天的任务有哪些？', '帮我生成本周周报', '哪些任务比较紧急？']
  return (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-100 to-purple-200 flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-[var(--color-accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-1">AI 任务助手</h3>
      <p className="text-sm text-[var(--color-text-secondary)] max-w-xs mb-4">
        我可以帮你管理任务、生成报告、智能搜索、拆解任务等。
        点击上方技能快捷使用，或直接输入问题。
      </p>
      <div className="flex flex-wrap gap-2 justify-center max-w-md">
        {quickQuestions.map(q => (
          <button
            key={q}
            onClick={() => onSendQuickQuestion(q)}
            className="px-3 py-1.5 text-xs bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-accent-light)] hover:text-[var(--color-accent)] text-[var(--color-text-secondary)] rounded-full transition-colors"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}
