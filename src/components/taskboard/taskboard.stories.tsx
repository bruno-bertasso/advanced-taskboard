import type { Meta, StoryObj } from '@storybook/react-vite'
import { startTransition, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { baseColumns, labels, manyColumnsFixture, people, seed, swimlanes } from '@/demo/fixtures'
import {
  applyMove,
  type Task,
  Taskboard,
  TaskboardBody,
  type TaskboardColumnDef,
  TaskboardFilters,
  TaskboardGroupBySelect,
  TaskboardHeader,
  type TaskboardProps,
  TaskboardRedoButton,
  TaskboardSearch,
  TaskboardSelectionBar,
  TaskboardShortcutsHelp,
  TaskboardTaskDialog,
  TaskboardUndoButton,
} from './index'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface HarnessProps extends Partial<Omit<TaskboardProps, 'tasks' | 'columns' | 'onTasksMove'>> {
  count?: number
  cols?: readonly TaskboardColumnDef[]
  /** Probabilidade de falha das chamadas (demonstra rollback). */
  failRate?: number
  readOnly?: boolean
}

/** Estado local + API fake para as stories. */
function Harness({ count = 300, cols = baseColumns, failRate = 0, readOnly = false, ...props }: HarnessProps) {
  const [tasks, setTasks] = useState<readonly Task[]>(() => seed(count, cols))
  const [columns, setColumns] = useState(cols)
  let next = tasks.length + 1
  const api = async () => {
    await wait(400)
    if (Math.random() < failRate) throw new Error('Erro simulado')
  }
  const mutate = (fn: (prev: readonly Task[]) => readonly Task[]) => startTransition(() => setTasks(fn))

  return (
    <Taskboard
      tasks={tasks}
      columns={columns}
      swimlanes={swimlanes}
      availableAssignees={people}
      availableLabels={labels}
      onTasksMove={async (move) => {
        await api()
        mutate((p) => applyMove(p, move))
      }}
      {...(!readOnly && {
        onTaskCreate: async (draft) => {
          await api()
          const task = { ...draft, id: `NEW-${next++}` }
          mutate((p) => [...p, task])
          return task
        },
        onTaskUpdate: async (id, patch) => {
          await api()
          mutate((p) => p.map((t) => (t.id === id ? { ...t, ...patch } : t)))
        },
        onTasksDelete: async (ids) => {
          await api()
          mutate((p) => p.filter((t) => !ids.includes(t.id)))
        },
        onTasksRestore: async (restored) => {
          await api()
          mutate((p) => [...p, ...restored])
        },
        onColumnsReorder: async (ids) => {
          await api()
          startTransition(() => setColumns((prev) => ids.flatMap((id) => prev.find((c) => c.id === id) ?? [])))
        },
      })}
      className="h-full"
      {...props}
    >
      <TaskboardHeader>
        <TaskboardSearch />
        <TaskboardFilters />
        <TaskboardGroupBySelect />
        <TaskboardSelectionBar />
        <div className="ms-auto flex gap-2">
          <TaskboardUndoButton />
          <TaskboardRedoButton />
          <TaskboardShortcutsHelp />
        </div>
      </TaskboardHeader>
      <TaskboardBody />
      <TaskboardTaskDialog />
    </Taskboard>
  )
}

const meta = {
  title: 'Taskboard',
  component: Harness,
  args: { count: 300 },
} satisfies Meta<typeof Harness>
export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = { name: 'Padrão' }

export const Raias: Story = { args: { defaultGroupBy: 'swimlane' } }

export const MilharesDeTarefas: Story = { name: 'Milhares de tarefas (virtualização)', args: { count: 5000 } }

export const MuitasColunas: Story = {
  name: 'Muitas colunas (virtualização horizontal)',
  args: { cols: manyColumnsFixture(60), count: 3000 },
}

export const ComFalhas: Story = { name: 'Rollback (40% de falhas)', args: { failRate: 0.4 } }

export const LimiteWip: Story = {
  name: 'Limite WIP bloqueante',
  args: {
    enforceWipLimits: true,
    cols: baseColumns.map((c) => (c.id === 'doing' ? { ...c, wipLimit: 70 } : c)),
  },
}

export const SomenteLeitura: Story = { name: 'Somente leitura (sem criar/editar/excluir)', args: { readOnly: true } }

export const RTL: Story = { args: { dir: 'rtl' } }

export const English: Story = { args: { locale: 'en-US' } }

export const CardCustomizado: Story = {
  name: 'Slots de renderização',
  args: {
    defaultGroupBy: 'priority',
    renderCard: ({ task, isSelected }) => (
      <div className="flex items-center gap-2 p-2 text-sm">
        <span className="font-mono text-xs text-muted-foreground">{task.id}</span>
        <span className="flex-1 truncate">{task.title}</span>
        {isSelected && <Badge variant="default">✓</Badge>}
      </div>
    ),
    renderColumnHeader: ({ column, taskCount }) => (
      <div className="flex items-center justify-between px-1 text-xs font-semibold tracking-wide uppercase">
        {column.title}
        <Badge variant="outline">{taskCount}</Badge>
      </div>
    ),
    renderSwimlaneHeader: ({ lane, taskCount, toggleCollapsed, isCollapsed }) => (
      <button type="button" tabIndex={-1} onClick={toggleCollapsed} aria-expanded={!isCollapsed} className="w-full px-2 py-1 text-start text-sm">
        {lane.title} ({taskCount})
      </button>
    ),
  },
}
