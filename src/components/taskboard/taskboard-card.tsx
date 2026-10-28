import { useDraggable, useDroppable } from '@dnd-kit/core'
import { AlertTriangle, ArrowDown, ArrowUp, CalendarDays, Equal, Loader2, Minus } from 'lucide-react'
import type * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useTaskboard } from './context'
import { ptBR, type TaskboardLocale, type TaskboardMessages } from './i18n'
import { DROP_BAR, FOCUS_RING, SELECTED_FORCED } from './styles'
import type { CardDropData, Task, TaskPriority } from './types'

const PRIORITY_ICON: Record<TaskPriority, React.ComponentType<{ className?: string }>> = {
  urgent: AlertTriangle,
  high: ArrowUp,
  medium: Equal,
  low: ArrowDown,
  none: Minus,
}
const PRIORITY_CLASS: Record<TaskPriority, string> = {
  urgent: 'text-destructive',
  high: 'text-warning',
  medium: 'text-foreground',
  low: 'text-muted-foreground',
  none: 'text-muted-foreground',
}

function isOverdue(iso: string) {
  return new Date(`${iso}T23:59:59`) < new Date()
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

/** Conteúdo padrão do card. Responsivo à largura da coluna via container queries. */
export function TaskboardCardContent({
  task,
  t = ptBR,
  locale = 'pt-BR',
}: {
  task: Task
  t?: TaskboardMessages
  locale?: TaskboardLocale
}) {
  const Icon = PRIORITY_ICON[task.priority]
  const overdue = task.dueDate ? isOverdue(task.dueDate) : false
  const dateFmt = new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short' })
  return (
    <div className="@container/card">
      <div className="flex flex-col gap-2 p-2.5 @[18rem]/card:p-3">
        <div className="flex items-start gap-2">
          <Icon className={cn('mt-0.5 size-3.5 shrink-0', PRIORITY_CLASS[task.priority])} aria-hidden />
          <span className="sr-only">{t.priorityA11y(t.priority[task.priority])}</span>
          <p className="line-clamp-2 flex-1 text-sm leading-snug font-medium @[18rem]/card:line-clamp-3">{task.title}</p>
        </div>

        {task.labels.length > 0 && (
          <ul aria-label={t.labels} className="hidden flex-wrap gap-1 @[13rem]/card:flex">
            {task.labels.map((l) => (
              <li key={l.id}>
                <Badge variant="outline">
                  {l.color && <span aria-hidden className="size-1.5 rounded-full" style={{ background: l.color }} />}
                  {l.name}
                </Badge>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono text-[11px]">{task.id.startsWith('draft-') ? '…' : task.id}</span>
          {task.dueDate && (
            <span className={cn('inline-flex items-center gap-1', overdue && 'font-medium text-destructive')}>
              <CalendarDays className="size-3" aria-hidden />
              <time dateTime={task.dueDate}>{dateFmt.format(new Date(`${task.dueDate}T12:00:00`))}</time>
              {overdue && <span className="sr-only">{t.overdue}</span>}
            </span>
          )}
          {task.estimate != null && (
            <Badge variant="secondary" className="hidden @[15rem]/card:inline-flex" aria-label={t.estimatePoints(task.estimate)}>
              {task.estimate} pt
            </Badge>
          )}
          {task.assignees.length > 0 && (
            <ul className="ms-auto flex -space-x-1.5 rtl:space-x-reverse" aria-label={t.assignees}>
              {task.assignees.slice(0, 3).map((a) => (
                <li key={a.id}>
                  <span
                    title={a.name}
                    className="grid size-6 place-items-center rounded-full border-2 border-card bg-secondary text-[10px] font-semibold text-secondary-foreground"
                  >
                    <span aria-hidden>{initials(a.name)}</span>
                    <span className="sr-only">{a.name}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

export interface TaskboardCardProps extends Omit<React.ComponentProps<'div'>, 'children'> {
  task: Task
  laneId: string
  posInSet: number
  setSize: number
}

/** Wrapper interativo: drag source, drop target, opção do listbox e roving tabindex. */
export function TaskboardCard({ task, laneId, posInSet, setSize, className, ref, style, ...props }: TaskboardCardProps) {
  const ctx = useTaskboard()
  const isSelected = ctx.selectedIds.has(task.id)
  const isFocused = ctx.focusedId === task.id
  const isPendingMove = ctx.pendingIds.has(task.id)
  const isDragging = ctx.draggingIds.has(task.id)
  const isDraft = task.id.startsWith('draft-')
  const indicator = ctx.dropIndicator?.kind === 'card' && ctx.dropIndicator.taskId === task.id ? ctx.dropIndicator.edge : null

  const drag = useDraggable({ id: task.id, data: { taskId: task.id }, disabled: isDraft })
  const drop = useDroppable({
    id: `drop:${task.id}`,
    data: { type: 'card', taskId: task.id, columnId: task.columnId, laneId } satisfies CardDropData,
    disabled: isDraft,
  })

  const setRefs = (node: HTMLDivElement | null) => {
    drag.setNodeRef(node)
    drop.setNodeRef(node)
    if (typeof ref === 'function') ref(node)
    else if (ref) ref.current = node
  }

  function onClick(e: React.MouseEvent) {
    if (isDraft) return
    const mode = e.shiftKey ? 'range' : e.metaKey || e.ctrlKey ? 'toggle' : 'replace'
    ctx.selectTask(task.id, mode)
    ctx.setFocusedId(task.id)
  }

  return (
    <div
      {...props}
      {...drag.listeners}
      ref={setRefs}
      role="option"
      id={`${ctx.boardId}-task-${task.id}`}
      data-task-id={task.id}
      aria-selected={isSelected}
      aria-posinset={posInSet}
      aria-setsize={setSize}
      aria-busy={isPendingMove || undefined}
      aria-disabled={isDraft || undefined}
      aria-roledescription={ctx.t.draggableTask}
      tabIndex={ctx.tabbableId === task.id ? 0 : -1}
      onFocus={() => ctx.setFocusedId(task.id)}
      onClick={onClick}
      onDoubleClick={() => !isDraft && ctx.openTask(task.id)}
      data-selected={isSelected || undefined}
      data-dragging={isDragging || undefined}
      data-pending={isPendingMove || undefined}
      data-focused={isFocused || undefined}
      style={style}
      className={cn(
        // touch-manipulation: mantém a rolagem nativa; o arrasto por toque usa long-press (TouchSensor).
        'group/card relative cursor-grab touch-manipulation rounded-lg border bg-card text-card-foreground shadow-xs transition-[box-shadow,opacity,border-color] select-none [-webkit-touch-callout:none]',
        FOCUS_RING,
        SELECTED_FORCED,
        'hover:border-ring/40',
        'data-[selected]:border-ring data-[selected]:bg-accent/40 data-[selected]:ring-1 data-[selected]:ring-ring',
        'data-[dragging]:opacity-40',
        isDraft && 'cursor-default opacity-70',
        className,
      )}
    >
      {indicator && (
        <span
          aria-hidden
          data-drop-indicator={indicator}
          className={cn(
            DROP_BAR,
            'inset-x-1 h-0.5',
            indicator === 'before' ? '-top-[5px]' : '-bottom-[5px]',
          )}
        />
      )}
      {ctx.renderCard ? (
        ctx.renderCard({ task, isSelected, isFocused, isDragging, isPendingMove })
      ) : (
        <TaskboardCardContent task={task} t={ctx.t} locale={ctx.locale} />
      )}
      {isPendingMove && <Loader2 aria-hidden className="absolute top-1.5 end-1.5 size-3 animate-spin text-muted-foreground" />}
    </div>
  )
}
