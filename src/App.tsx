import { Moon, Sun } from 'lucide-react'
import { startTransition, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { baseColumns, labels, manyColumnsFixture, people, seed, swimlanes } from '@/demo/fixtures'
import {
  applyMove,
  type ColumnId,
  type TaskboardLocale,
  type TaskDraft,
  TaskboardFilters,
  TaskboardRedoButton,
  TaskboardUndoButton,
  type TaskUpdate,
  type Task,
  Taskboard,
  TaskboardBody,
  type TaskboardColumnDef,
  TaskboardGroupBySelect,
  TaskboardHeader,
  TaskboardSearch,
  TaskboardSelectionBar,
  TaskboardShortcutsHelp,
  TaskboardTaskDialog,
  type TaskMove,
  TaskboardConflictError,
} from '@/components/taskboard'

const params = new URLSearchParams(window.location.search)
/** `?cols=40` gera muitas colunas para demonstrar a virtualização horizontal. */
const manyColumns = Math.min(Number(params.get('cols')) || 0, 200)

const columns: TaskboardColumnDef[] = manyColumns
  ? manyColumnsFixture(manyColumns)
  : baseColumns

const initialTasks = seed(2000, columns)

declare global {
  interface Window {
    /** Taxa de falha da API fake (testes E2E sobrescrevem). */
    __TASKBOARD_FAIL_RATE__?: number
    /** Latência simulada da API em ms (padrão 700). */
    __TASKBOARD_LATENCY__?: number
    /** Remove `onTasksRestore` (exclusão irreversível com confirmação) — usado em testes E2E. */
    __TASKBOARD_NO_RESTORE__?: boolean
    /** Simula uma alteração feita por outro usuário (tempo real) — usado em testes E2E. */
    __TASKBOARD_REMOTE__?: (id: string, patch: Partial<Task>) => void
  }
}

/** API fake: ~20% de falhas para demonstrar o rollback do useOptimistic. */
function fakeApi() {
  const rate = window.__TASKBOARD_FAIL_RATE__ ?? 0.2
  return new Promise<void>((resolve, reject) =>
    setTimeout(() => (Math.random() < rate ? reject(new Error('Erro 500')) : resolve()), window.__TASKBOARD_LATENCY__ ?? 700),
  )
}

function useDarkMode() {
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark' || (!localStorage.getItem('theme') && matchMedia('(prefers-color-scheme: dark)').matches))
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])
  return [dark, setDark] as const
}

let nextId = initialTasks.length + 1

/** "Servidor" em memória — fonte de verdade independente do estado do React. */
const db = new Map(initialTasks.map((t) => [t.id, t]))
const snapshot = () => [...db.values()]

export default function App() {
  const [tasks, setTasks] = useState<readonly Task[]>(initialTasks)
  const [cols, setCols] = useState<readonly TaskboardColumnDef[]>(columns)
  const [locale, setLocale] = useState<TaskboardLocale>('pt-BR')
  const [dir, setDir] = useState<'ltr' | 'rtl'>(params.get('dir') === 'rtl' ? 'rtl' : 'ltr')
  const [dark, setDark] = useDarkMode()

  useEffect(() => {
    // Atualização "em tempo real" vinda de outro usuário: aplicada FORA de startTransition,
    // para que o useOptimistic faça o rebase imediatamente sobre as ações pendentes.
    window.__TASKBOARD_REMOTE__ = (id, patch) => {
      const t = db.get(id)
      if (!t) return
      db.set(id, { ...t, ...patch, version: (t.version ?? 0) + 1 })
      setTasks(snapshot())
    }
  }, [])

  async function handleMove(move: TaskMove) {
    await fakeApi()
    // Concorrência otimista: rejeita se alguma tarefa mudou desde que o cliente a viu.
    const stale = Object.entries(move.expectedVersions).filter(([id, v]) => (v ?? 0) !== (db.get(id)?.version ?? 0))
    if (stale.length) throw new TaskboardConflictError(stale.map(([id]) => id))
    for (const t of applyMove(move.patches.flatMap((p) => db.get(p.id) ?? []), move)) {
      db.set(t.id, { ...t, version: (t.version ?? 0) + 1 })
    }
    startTransition(() => setTasks(snapshot()))
  }
  async function handleCreate(draft: TaskDraft): Promise<Task> {
    await fakeApi()
    const task: Task = { ...draft, id: `TSK-${nextId++}`, version: 0 }
    db.set(task.id, task)
    startTransition(() => setTasks(snapshot()))
    return task
  }
  async function handleDelete(ids: readonly string[]) {
    await fakeApi()
    for (const id of ids) db.delete(id)
    startTransition(() => setTasks(snapshot()))
  }
  async function handleRestore(restored: readonly Task[]) {
    await fakeApi()
    for (const t of restored) if (!db.has(t.id)) db.set(t.id, t)
    startTransition(() => setTasks(snapshot()))
  }
  async function handleUpdate(id: string, patch: TaskUpdate) {
    await fakeApi()
    const t = db.get(id)
    if (t) db.set(id, { ...t, ...patch, version: (t.version ?? 0) + 1 })
    startTransition(() => setTasks(snapshot()))
  }
  async function handleReorder(ids: readonly ColumnId[]) {
    await fakeApi()
    startTransition(() => setCols((prev) => ids.flatMap((id) => prev.find((c) => c.id === id) ?? [])))
  }

  return (
    <main className="mx-auto flex h-dvh max-w-[120rem] flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">Sprint 42</h1>
        <label className="ms-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          Idioma / Language
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as TaskboardLocale)}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground"
          >
            <option value="pt-BR">Português</option>
            <option value="en-US">English</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {locale === 'pt-BR' ? 'Direção' : 'Direction'}
          <select
            value={dir}
            onChange={(e) => setDir(e.target.value as 'ltr' | 'rtl')}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground"
          >
            <option value="ltr">LTR</option>
            <option value="rtl">RTL</option>
          </select>
        </label>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setDark((d) => !d)}
          aria-pressed={dark}
          aria-label={locale === 'pt-BR' ? 'Tema escuro' : 'Dark theme'}
        >
          {dark ? <Sun /> : <Moon />}
        </Button>
      </div>
      <Taskboard
        tasks={tasks}
        columns={cols}
        swimlanes={swimlanes}
        onTasksMove={handleMove}
        onTaskCreate={handleCreate}
        onTaskUpdate={handleUpdate}
        onColumnsReorder={handleReorder}
        onTasksDelete={handleDelete}
        onTasksRestore={window.__TASKBOARD_NO_RESTORE__ ? undefined : handleRestore}
        storageKey="sprint-42"
        enforceWipLimits
        availableAssignees={people}
        availableLabels={labels}
        locale={locale}
        dir={dir}
        onMoveError={(e) => console.warn('Movimento revertido:', e)}
        className="min-h-0 flex-1"
      >
        <TaskboardHeader>
          <TaskboardSearch />
          <TaskboardFilters />
          <TaskboardGroupBySelect />
          <TaskboardSelectionBar />
          <div className="ml-auto flex gap-2">
            <TaskboardUndoButton />
            <TaskboardRedoButton />
            <TaskboardShortcutsHelp />
          </div>
        </TaskboardHeader>
        <TaskboardBody />
        <TaskboardTaskDialog />
      </Taskboard>
    </main>
  )
}
