import { ptBR, type TaskboardMessages } from './i18n'
import type {
  Task,
  TaskboardColumnDef,
  TaskboardGroupBy,
  TaskboardLane,
  TaskboardSwimlaneDef,
  TaskId,
  TaskMove,
  OptimisticAction,
  TaskMoveTarget,
  TaskPatch,
  TaskPriority,
  TaskUpdate,
} from './types'

export const NO_LANE = '__none__'
export const ALL_LANE = '__all__'

export const PRIORITY_ORDER: readonly TaskPriority[] = ['urgent', 'high', 'medium', 'low', 'none']
export const PRIORITY_LABEL: Record<TaskPriority, string> = ptBR.priority

type LaneMessages = Pick<TaskboardMessages, 'laneAll' | 'laneNoSwimlane' | 'laneNoAssignee' | 'priority'>

/** Espaçamento usado ao renumerar uma célula. */
export const RANK_GAP = 1024

/**
 * Verdadeiro quando os ranks intermediários não são mais distinguíveis (ou ficam
 * próximos demais do limite de precisão do float64) e a célula precisa ser renumerada.
 */
export function needsRebalance(lo: number, hi: number, step: number, n: number): boolean {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || !Number.isFinite(step) || step <= 0) return true
  const scale = Math.max(Math.abs(lo), Math.abs(hi), 1)
  if (step < scale * 1e-9) return true
  for (let i = 0; i <= n; i++) {
    const a = lo + step * i
    const b = lo + step * (i + 1)
    if (!(b > a)) return true
  }
  return false
}

export const cellKey = (columnId: string, laneId: string) => `${columnId}::${laneId}`

export function getLaneId(task: Task, groupBy: TaskboardGroupBy): string {
  switch (groupBy) {
    case 'none':
      return ALL_LANE
    case 'swimlane':
      return task.swimlaneId ?? NO_LANE
    case 'assignee':
      return task.assignees[0]?.id ?? NO_LANE
    case 'priority':
      return task.priority
  }
}

export function deriveLanes(
  tasks: readonly Task[],
  groupBy: TaskboardGroupBy,
  swimlanes: readonly TaskboardSwimlaneDef[] = [],
  m: LaneMessages = ptBR,
): TaskboardLane[] {
  switch (groupBy) {
    case 'none':
      return [{ id: ALL_LANE, title: m.laneAll, kind: 'none' }]
    case 'swimlane': {
      const lanes: TaskboardLane[] = swimlanes.map((s) => ({ ...s, kind: 'swimlane' }))
      if (tasks.some((t) => !t.swimlaneId)) lanes.push({ id: NO_LANE, title: m.laneNoSwimlane, kind: 'swimlane' })
      return lanes
    }
    case 'assignee': {
      const seen = new Map<string, string>()
      for (const t of tasks) {
        const a = t.assignees[0]
        if (a && !seen.has(a.id)) seen.set(a.id, a.name)
      }
      const lanes: TaskboardLane[] = [...seen]
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([id, title]) => ({ id, title, kind: 'assignee' }))
      lanes.push({ id: NO_LANE, title: m.laneNoAssignee, kind: 'assignee' })
      return lanes
    }
    case 'priority':
      return PRIORITY_ORDER.map((p) => ({ id: p, title: m.priority[p], kind: 'priority' }))
  }
}

export function matchesQuery(task: Task, query: string): boolean {
  if (!query) return true
  const q = query.toLocaleLowerCase()
  // `#ID` → correspondência exata por id.
  if (q.startsWith('#') && q.length > 1) return task.id.toLocaleLowerCase() === q.slice(1)
  return (
    task.title.toLocaleLowerCase().includes(q) ||
    task.id.toLocaleLowerCase().includes(q) ||
    task.labels.some((l) => l.name.toLocaleLowerCase().includes(q)) ||
    task.assignees.some((a) => a.name.toLocaleLowerCase().includes(q))
  )
}

export const byRank = (a: Task, b: Task) => a.rank - b.rank || a.id.localeCompare(b.id)

/** Agrupa tarefas por célula (coluna × raia), ordenadas por rank. */
export function groupIntoCells(tasks: readonly Task[], groupBy: TaskboardGroupBy): Map<string, Task[]> {
  const cells = new Map<string, Task[]>()
  for (const task of tasks) {
    const key = cellKey(task.columnId, getLaneId(task, groupBy))
    const list = cells.get(key)
    if (list) list.push(task)
    else cells.set(key, [task])
  }
  for (const list of cells.values()) list.sort(byRank)
  return cells
}

/**
 * Calcula patches de uma movimentação (single ou batch).
 * As tarefas movidas são inseridas contiguamente em `target.index`,
 * preservando a ordem relativa original no board.
 */
export function computeMove(params: {
  tasks: readonly Task[]
  taskIds: readonly TaskId[]
  target: TaskMoveTarget
  groupBy: TaskboardGroupBy
  columns: readonly TaskboardColumnDef[]
  source: TaskMove['source']
}): TaskMove {
  const { tasks, taskIds, target, groupBy, columns, source } = params
  const moving = new Set(taskIds)
  const colIndex = new Map(columns.map((c, i) => [c.id, i]))

  const movingTasks = tasks
    .filter((t) => moving.has(t.id))
    .sort((a, b) => (colIndex.get(a.columnId) ?? 0) - (colIndex.get(b.columnId) ?? 0) || byRank(a, b))

  const destination = tasks
    .filter(
      (t) => !moving.has(t.id) && t.columnId === target.columnId && getLaneId(t, groupBy) === target.laneId,
    )
    .sort(byRank)

  const index = Math.max(0, Math.min(target.index, destination.length))
  const prev = destination[index - 1]?.rank
  const next = destination[index]?.rank
  const n = movingTasks.length
  const lo = prev ?? (next !== undefined ? next - (n + 1) : 0)
  const hi = next ?? lo + n + 1
  const step = (hi - lo) / (n + 1)

  const lanePatch = lanePatchFor(groupBy, target.laneId, tasks)
  let patches: TaskPatch[]
  if (needsRebalance(lo, hi, step, n)) {
    // Precisão de ponto flutuante esgotada: renumera a célula inteira com espaçamento uniforme.
    const ordered = [...destination.slice(0, index), ...movingTasks, ...destination.slice(index)]
    patches = ordered.map((t, i) => ({
      id: t.id,
      columnId: target.columnId,
      rank: (i + 1) * RANK_GAP,
      ...(moving.has(t.id) ? lanePatch : {}),
    }))
  } else {
    patches = movingTasks.map((t, i) => ({
      id: t.id,
      columnId: target.columnId,
      rank: lo + step * (i + 1),
      ...lanePatch,
    }))
  }

  const byId = new Map(tasks.map((t) => [t.id, t]))
  const expectedVersions = Object.fromEntries(patches.map((p) => [p.id, byId.get(p.id)?.version]))
  return { taskIds: movingTasks.map((t) => t.id), target: { ...target, index }, groupBy, patches, source, expectedVersions }
}

export function lanePatchFor(
  groupBy: TaskboardGroupBy,
  laneId: string,
  tasks: readonly Task[],
): Partial<Pick<TaskPatch, 'swimlaneId' | 'priority' | 'assignees'>> {
  switch (groupBy) {
    case 'none':
      return {}
    case 'swimlane':
      return { swimlaneId: laneId === NO_LANE ? null : laneId }
    case 'priority':
      return { priority: laneId as TaskPriority }
    case 'assignee': {
      if (laneId === NO_LANE) return { assignees: [] }
      const assignee = tasks.flatMap((t) => t.assignees).find((a) => a.id === laneId)
      return assignee ? { assignees: [assignee] } : {}
    }
  }
}

/** Reducer puro — usado pelo useOptimistic e reutilizável pelo consumidor. */
export function applyMove(tasks: readonly Task[], move: TaskMove): Task[] {
  const patches = new Map(move.patches.map((p) => [p.id, p]))
  return tasks.map((t) => {
    const p = patches.get(t.id)
    return p ? { ...t, ...p } : t
  })
}

/** Reducer do useOptimistic para todas as mutações (mover, editar, criar). */
export function applyOptimistic(tasks: readonly Task[], action: OptimisticAction): Task[] {
  switch (action.type) {
    case 'move':
      return applyMove(tasks, action.move)
    case 'update':
      return tasks.map((t) => (t.id === action.id ? { ...t, ...action.patch } : t))
    case 'create':
      return [...tasks, action.task]
    case 'delete': {
      const ids = new Set(action.ids)
      return tasks.filter((t) => !ids.has(t.id))
    }
    case 'restore': {
      const existing = new Set(tasks.map((t) => t.id))
      return [...tasks, ...action.tasks.filter((t) => !existing.has(t.id))]
    }
  }
}

/** Movimento inverso (para desfazer), capturado a partir do estado anterior. */
export function invertMove(before: readonly Task[], move: TaskMove): TaskMove {
  const ids = new Set(move.taskIds)
  const prev = before.filter((t) => ids.has(t.id))
  const first = prev[0]
  return {
    taskIds: move.taskIds,
    groupBy: move.groupBy,
    source: 'undo',
    expectedVersions: Object.fromEntries(prev.map((t) => [t.id, t.version])),
    target: { columnId: first?.columnId ?? move.target.columnId, laneId: first ? getLaneId(first, move.groupBy) : move.target.laneId, index: 0 },
    patches: prev.map((t) => ({
      id: t.id,
      columnId: t.columnId,
      rank: t.rank,
      swimlaneId: t.swimlaneId ?? null,
      priority: t.priority,
      assignees: t.assignees,
    })),
  }
}

/** Retorna nova ordem de colunas movendo `id` em `delta` posições. */
export function reorderColumns(order: readonly string[], id: string, delta: number): string[] {
  const from = order.indexOf(id)
  const to = from + delta
  if (from < 0 || to < 0 || to >= order.length) return [...order]
  const next = [...order]
  next.splice(from, 1)
  next.splice(to, 0, id)
  return next
}

export interface TaskFilters {
  readonly query: string
  readonly assignees: readonly string[]
  readonly labels: readonly string[]
}

export function matchesFilters(task: Task, f: TaskFilters): boolean {
  if (!matchesQuery(task, f.query)) return false
  if (f.assignees.length) {
    const ids = task.assignees.length ? task.assignees.map((a) => a.id) : [NO_LANE]
    if (!ids.some((id) => f.assignees.includes(id))) return false
  }
  if (f.labels.length && !task.labels.some((l) => f.labels.includes(l.id))) return false
  return true
}

/** Patch inverso de uma edição: valores anteriores das chaves alteradas. */
export function invertUpdate(before: Task, patch: TaskUpdate): TaskUpdate {
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(patch) as (keyof TaskUpdate)[]) out[k] = before[k] ?? null
  return out as TaskUpdate
}

/**
 * Erro que o consumidor deve lançar quando o servidor detectar conflito de versão.
 * O Taskboard reverte a alteração otimista e exibe uma mensagem específica; o novo
 * estado chega pela prop `tasks` (ex.: refetch ou evento em tempo real).
 */
export class TaskboardConflictError extends Error {
  readonly taskIds: readonly string[]
  constructor(taskIds: readonly string[] = [], message = 'Conflito de versão') {
    super(message)
    this.name = 'TaskboardConflictError'
    this.taskIds = taskIds
  }
}
