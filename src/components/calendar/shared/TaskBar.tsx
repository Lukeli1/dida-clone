// 月视图与周视图共用的任务条渲染组件
import type { Task, List } from '../../../types'
import { getTaskColor, hexToRgba } from '../../../utils/priority'
import { getTaskBarColor, isLightColor } from './taskBarColor'

export interface TaskBarProps {
  task: Task
  lists: List[]
  /** month：实心色块条；week：半透明时间块 */
  variant: 'month' | 'week'
  /** 该任务是否正在被拖拽（降低不透明度） */
  dragged: boolean
  /** 格式化后的时间文本；month 显示在右侧，week 显示在标题前 */
  timeLabel?: string
  /** 透传给根元素的内联样式（week 用于 top/height） */
  style?: React.CSSProperties
  /** week 变体：是否允许拖拽（调整大小时禁用） */
  draggable?: boolean
  /** week 变体：是否设置 data-task 属性（用于点击空白区域判断） */
  dataTask?: boolean
  /** week 变体：插入到复选框之前的额外内容（resize 手柄、时间提示等） */
  children?: React.ReactNode
  onDragStart?: (e: React.DragEvent) => void
  /** month / week 均作用于根元素 */
  onTaskClick?: (e: React.MouseEvent) => void
  /** month 作用于复选框按钮；week 作用于 checkbox input 的 change */
  onToggle?: (e: React.SyntheticEvent) => void
}

export function TaskBar({
  task, lists, variant, dragged, timeLabel, style,
  draggable = true, dataTask, children, onDragStart, onTaskClick, onToggle,
}: TaskBarProps) {
  const color = getTaskColor(task, lists)

  if (variant === 'week') {
    return (
      <div
        data-task={dataTask || undefined}
        draggable={draggable}
        onDragStart={onDragStart}
        onClick={onTaskClick}
        className={`absolute left-1 right-1 rounded px-1 py-0.5 text-xs cursor-grab active:cursor-grabbing overflow-hidden select-none group border-l-2 ${
          task.completed ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)] line-through' : ''
        } ${dragged ? 'opacity-40' : ''}`}
        style={{
          ...style,
          ...(task.completed ? {} : {
            backgroundColor: hexToRgba(color, 0.15),
            color,
            borderLeftColor: color,
          }),
        }}
      >
        {children}
        <input
          type="checkbox"
          checked={task.completed}
          onChange={onToggle}
          onClick={(e) => e.stopPropagation()}
          className="w-3 h-3 mr-1 rounded-sm cursor-pointer align-middle"
        />
        <span>
          {timeLabel && <span className="font-medium">{timeLabel}</span>} {task.title}
        </span>
      </div>
    )
  }

  // month 变体：实心色块条
  const barColor = getTaskBarColor(task, lists)
  const light = isLightColor(barColor)
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onTaskClick}
      className={`flex items-center gap-1 px-1.5 py-1 rounded text-[11px] cursor-grab active:cursor-grabbing select-none transition-opacity hover:opacity-80 ${
        task.completed ? 'opacity-50' : ''
      } ${dragged ? 'opacity-40' : ''}`}
      style={{ ...style, backgroundColor: barColor, color: light ? '#374151' : '#ffffff' }}
    >
      <button
        onClick={onToggle}
        className={`flex-shrink-0 w-3 h-3 rounded-sm border flex items-center justify-center transition-colors ${
          task.completed
            ? 'bg-white/30 border-white/50'
            : light ? 'border-[var(--color-text-tertiary)]' : 'border-white/60'
        }`}
      >
        {task.completed && (
          <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
      <span className={`truncate flex-1 ${task.completed ? 'line-through' : ''}`}>{task.title}</span>
      {timeLabel && <span className="flex-shrink-0 text-[10px] opacity-80">{timeLabel}</span>}
    </div>
  )
}
