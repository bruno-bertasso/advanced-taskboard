import type * as React from 'react'
import {
  closestCenter,
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  type DragMoveEvent,
  DragOverlay,
  type DragStartEvent,
  MouseSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { DirectionProvider } from '@base-ui/react/direction-provider'
import { parseAsArrayOf, parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs'
import { useEffect, useId, useOptimistic, useRef, useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { type CellHandle, type DropIndicator, TaskboardContext, type TaskboardContextValue } from './context'
import { TASKBOARD_LOCALES } from './i18n'
import { FOCUS_RING } from './styles'
import { TaskboardCardContent } from './taskboard-card'
import { TaskboardDeleteConfirm } from './taskboard-header'
import type {
  DropData,
  Task,
  TaskAssignee,
  TaskboardGroupBy,
  TaskboardCommand,
  TaskboardHistoryEntry,
  TaskboardProps,
  TaskId,
  TaskLabel,
  TaskMove,
  TaskMoveTarget,
  TaskUpdate,
} from './types'
import {
  applyOptimistic,
  byRank,
  cellKey,
  computeMove,
  deriveLanes,
  getLaneId,
  groupIntoCells,
  invertMove,
  invertUpdate,
  lanePatchFor,
  matchesFilters,
  reorderColumns,
  TaskboardConflictError,
} from './utils'

const GROUP_BY_VALUES = ['none', 'swimlane', 'assignee', 'priority'] as const satisfies readonly TaskboardGroupBy[]
const UNDO_LIMIT = 50
const HEADER_CONTROLS = 'button, a[href], input, select, [tabindex]:not([data-col-header]):not([data-lane-header])'

/** Prioriza cards sob o ponteiro; cai para a célula; por fim, interseção de retângulos. */
const collisionDetection: CollisionDetection = (args) => {
  // Arrasto de coluna só enxerga cabeçalhos; arrasto de card só enxerga cards/células.
  const isColumn = args.active.data.current?.type === 'column'
  const scoped = {
    ...args,
    droppableContainers: args.droppableContainers.filter((c) => (c.data.current?.type === 'column') === isColumn),
  }
  const hits = pointerWithin(scoped)
  if (isColumn) return hits.length ? hits : closestCenter(scoped)
  const card = hits.find((h) => scoped.droppableContainers.find((c) => c.id === h.id)?.data.current?.type === 'card')
  if (card) return [card]
  if (hits.length) return hits
  return rectIntersection(scoped)
}

/** Set persistido em localStorage quando `storageKey` é informado. */
function usePersistentSet(storageKey: string | undefined, name: string) {
  const key = storageKey ? `taskboard:${storageKey}:${name}` : null
  const [value, setValue] = useState<ReadonlySet<string>>(() => {
    if (!key || typeof localStorage === 'undefined') return new Set()
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
      return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [])
    } catch {
      return new Set()
    }
  })
  useEffect(() => {
    if (key) localStorage.setItem(key, JSON.stringify([...value]))
  }, [key, value])
  return [value, setValue] as const
}

/** Enfileira chamadas de persistência para que o servidor receba as mutações na ordem em que ocorreram. */
function useSerialQueue() {
  const tail = useRef<Promise<unknown>>(Promise.resolve())
  return <T,>(fn: () => Promise<T>): Promise<T> => {
    const run = tail.current.then(fn)
    tail.current = run.catch(() => undefined)
    return run
  }
}

export function Taskboard({
  tasks,
  columns: columnsProp,
  swimlanes,
  onTasksMove,
  onMoveError,
  onTaskOpen,
  onTaskCreate,
  onTaskUpdate,
  onColumnsReorder,
  onTasksDelete,
  onTasksRestore,
  storageKey,
  enforceWipLimits = false,
  availableAssignees: assigneesProp,
  availableLabels: labelsProp,
  locale = 'pt-BR',
  messages,
  dir = 'ltr',
  columnVirtualizationThreshold = 12,
  renderCard,
  renderColumnHeader,
  renderSwimlaneHeader,
  estimateCardSize = 96,
  defaultGroupBy = 'none',
  className,
  children,
  'aria-label': ariaLabel,
}: TaskboardProps) {
  const boardId = useId()
  const t = { ...TASKBOARD_LOCALES[locale], ...messages }
  const rootRef = useRef<HTMLDivElement>(null)
  const cellHandles = useRef(new Map<string, CellHandle>())
  const columnScroller = useRef<((index: number) => void) | null>(null)
  const enqueue = useSerialQueue()

  /* ---------------- URL state (nuqs) ---------------- */
  const [url, setUrl] = useQueryStates(
    {
      q: parseAsString.withDefault(''),
      group: parseAsStringLiteral(GROUP_BY_VALUES).withDefault(defaultGroupBy),
      task: parseAsString,
      assignee: parseAsArrayOf(parseAsString).withDefault([]),
      label: parseAsArrayOf(parseAsString).withDefault([]),
    },
    { history: 'replace' },
  )
  const groupBy = url.group
  const query = url.q

  /* ---------------- Estado otimista ---------------- */
  const [optimisticTasks, addOptimistic] = useOptimistic(tasks, applyOptimistic)
  const [pendingList, addPending] = useOptimistic<readonly TaskId[], readonly TaskId[]>([], (s, ids) => [...s, ...ids])
  const [columnOrder, setOptimisticColumnOrder] = useOptimistic<readonly string[]>(columnsProp.map((c) => c.id))
  const [, startTransition] = useTransition()
  const pendingIds = new Set(pendingList)

  /* ---------------- Estado local de UI ---------------- */
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<TaskId>>(new Set())
  const [anchorId, setAnchorId] = useState<TaskId | null>(null)
  const [focusedId, setFocusedId] = useState<TaskId | null>(null)
  const [focusRequest, setFocusRequest] = useState<{ id: TaskId; seq: number } | null>(null)
  const [domFocusRequest, setDomFocusRequest] = useState<{ selector: string; seq: number } | null>(null)
  const [draggingIds, setDraggingIds] = useState<readonly TaskId[]>([])
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null)
  const [draggingColumnId, setDraggingColumnId] = useState<string | null>(null)
  const [collapsedColumns, setCollapsedColumns] = usePersistentSet(storageKey, 'collapsed-columns')
  const [collapsedLanes, setCollapsedLanes] = usePersistentSet(storageKey, 'collapsed-lanes')
  const [confirmDeleteIds, setConfirmDeleteIds] = useState<readonly TaskId[]>([])
  const [createAt, setCreateAt] = useState<{ columnId: string; laneId: string } | null>(null)
  const [past, setPast] = useState<readonly TaskboardHistoryEntry[]>([])
  const [future, setFuture] = useState<readonly TaskboardHistoryEntry[]>([])
  const [helpOpen, setHelpOpen] = useState(false)
  const [status, setStatus] = useState('')
  const [alert, setAlert] = useState('')

  /* ---------------- Dados derivados (memoizados pelo React Compiler) ---------------- */
  const colById = new Map(columnsProp.map((c) => [c.id, c]))
  const columns = [
    ...columnOrder.flatMap((id) => colById.get(id) ?? []),
    ...columnsProp.filter((c) => !columnOrder.includes(c.id)),
  ]
  const taskById = new Map(optimisticTasks.map((x) => [x.id, x]))
  const filters = { query, assignees: url.assignee, labels: url.label }
  const visibleTasks = optimisticTasks.filter((x) => matchesFilters(x, filters))
  const cells = groupIntoCells(visibleTasks, groupBy)
  const lanes = deriveLanes(optimisticTasks, groupBy, swimlanes, t)
  const columnTotals = new Map<string, number>()
  for (const x of optimisticTasks) columnTotals.set(x.columnId, (columnTotals.get(x.columnId) ?? 0) + 1)
  const availableAssignees = assigneesProp ?? uniqueBy(tasks.flatMap((x) => x.assignees))
  const availableLabels = labelsProp ?? uniqueBy(tasks.flatMap((x) => x.labels))

  const navLanes = lanes.filter((l) => !collapsedLanes.has(l.id))
  const navColumns = columns.filter((c) => !collapsedColumns.has(c.id))
  const cellAt = (li: number, ci: number) => {
    const lane = navLanes[li]
    const col = navColumns[ci]
    return lane && col ? (cells.get(cellKey(col.id, lane.id)) ?? []) : []
  }
  const firstVisible = navLanes.flatMap((l) => navColumns.map((c) => cells.get(cellKey(c.id, l.id))?.[0])).find(Boolean)
  const tabbableId =
    focusedId && visibleTasks.some((x) => x.id === focusedId) ? focusedId : (firstVisible?.id ?? null)

  function locate(id: TaskId) {
    const task = taskById.get(id)
    if (!task) return null
    const laneId = getLaneId(task, groupBy)
    const li = navLanes.findIndex((l) => l.id === laneId)
    const ci = navColumns.findIndex((c) => c.id === task.columnId)
    const key = cellKey(task.columnId, laneId)
    const index = (cells.get(key) ?? []).findIndex((x) => x.id === id)
    return { task, laneId, li, ci, key, index }
  }

  /* ---------------- Foco (roving tabindex + virtualização) ---------------- */
  function focusTask(id: TaskId) {
    setFocusedId(id)
    setFocusRequest((r) => ({ id, seq: (r?.seq ?? 0) + 1 }))
  }
  function focusSelector(selector: string) {
    setDomFocusRequest((r) => ({ selector, seq: (r?.seq ?? 0) + 1 }))
  }
  const colHeaderSel = (id: string) => `[data-col-header="${CSS.escape(id)}"]`
  const laneHeaderSel = (id: string) => `[data-lane-header="${CSS.escape(id)}"]`

  useEffect(() => {
    if (!focusRequest) return
    const loc = locate(focusRequest.id)
    if (!loc || loc.index < 0) return
    const colIndex = columns.findIndex((c) => c.id === loc.task.columnId)
    let raf = 0
    let attempts = 0
    // A célula pode não estar montada (coluna virtualizada fora da janela): rola a coluna e tenta de novo.
    const tick = () => {
      const handle = cellHandles.current.get(loc.key)
      if (!handle) {
        columnScroller.current?.(colIndex)
        if (attempts++ < 10) raf = requestAnimationFrame(tick)
        return
      }
      handle.scrollToIndex(loc.index)
      const el = rootRef.current?.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(focusRequest.id)}"]`)
      if (el) {
        columnScroller.current?.(colIndex)
        el.focus()
      } else if (attempts++ < 10) raf = requestAnimationFrame(tick)
    }
    // Síncrono quando possível: evita perder teclas (auto-repeat) durante a transição de foco.
    tick()
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reagir apenas a novas requisições de foco
  }, [focusRequest])

  useEffect(() => {
    if (!domFocusRequest) return
    const { selector } = domFocusRequest
    const colId = /data-col-header="([^"]+)"/.exec(selector)?.[1]
    const colIndex = colId ? columns.findIndex((c) => CSS.escape(c.id) === colId) : -1
    let raf = 0
    let attempts = 0
    const tick = () => {
      const el = rootRef.current?.querySelector<HTMLElement>(selector)
      if (el) return el.focus()
      if (colIndex >= 0) columnScroller.current?.(colIndex)
      if (attempts++ < 10) raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domFocusRequest])

  // Após rollback, devolve o foco ao card (o nó DOM some da posição otimista).
  const restoreFocusRef = useRef<TaskId | null>(null)
  useEffect(() => {
    const id = restoreFocusRef.current
    if (!id || pendingIds.has(id)) return
    restoreFocusRef.current = null
    focusTask(id)
  })

  // Anuncia contagem de resultados quando filtros mudam (debounce).
  const filterSignature = `${query}|${url.assignee.join(',')}|${url.label.join(',')}`
  const firstFilterRun = useRef(true)
  useEffect(() => {
    if (firstFilterRun.current) {
      firstFilterRun.current = false
      return
    }
    const id = setTimeout(() => announce(t.results(visibleTasks.length)), 500)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSignature])

  /* ---------------- Seleção ---------------- */
  function selectTask(id: TaskId, mode: 'replace' | 'toggle' | 'range') {
    if (mode === 'replace') {
      setSelectedIds(new Set([id]))
      setAnchorId(id)
      return
    }
    if (mode === 'toggle') {
      setSelectedIds((prev) => toggleInSet(prev, id))
      setAnchorId(id)
      return
    }
    const a = anchorId ? locate(anchorId) : null
    const b = locate(id)
    if (!a || !b || a.key !== b.key) {
      setSelectedIds(new Set([id]))
      setAnchorId(id)
      return
    }
    const list = cells.get(b.key) ?? []
    const [from, to] = a.index < b.index ? [a.index, b.index] : [b.index, a.index]
    setSelectedIds((prev) => new Set([...prev, ...list.slice(from, to + 1).map((x) => x.id)]))
  }

  function orderedSelection(ids: Iterable<TaskId>): TaskId[] {
    const set = new Set(ids)
    return lanes.flatMap((l) =>
      columns.flatMap((c) => (cells.get(cellKey(c.id, l.id)) ?? []).filter((x) => set.has(x.id)).map((x) => x.id)),
    )
  }

  function announce(message: string) {
    setStatus('')
    requestAnimationFrame(() => setStatus(message))
  }

  function shouldRestoreFocus() {
    const active = document.activeElement
    return !active || active === document.body || !!rootRef.current?.contains(active)
  }

  /* ---------------- Histórico + executor de comandos (otimista + rollback) ---------------- */
  function record(entry: TaskboardHistoryEntry) {
    setPast((h) => [...h.slice(-(UNDO_LIMIT - 1)), entry])
    setFuture([])
  }
  function forget(entry: TaskboardHistoryEntry) {
    setPast((h) => h.filter((e) => e !== entry))
    setFuture((h) => h.filter((e) => e !== entry))
  }

  function canExecute(cmd: TaskboardCommand): boolean {
    switch (cmd.kind) {
      case 'move':
        return true
      case 'update':
        return !!onTaskUpdate
      case 'delete':
        return !!onTasksDelete
      case 'restore':
        return !!onTasksRestore
      case 'columns':
        return !!onColumnsReorder
    }
  }

  /** Aplica otimisticamente e persiste. Deve rodar dentro de uma transição. */
  function execute(cmd: TaskboardCommand): Promise<void> {
    switch (cmd.kind) {
      case 'move': {
        // Versões lidas no momento da execução (undo/redo enviam a versão atual, não a original).
        const move: TaskMove = {
          ...cmd.move,
          expectedVersions: Object.fromEntries(cmd.move.patches.map((p) => [p.id, taskById.get(p.id)?.version])),
        }
        addOptimistic({ type: 'move', move })
        addPending(move.taskIds)
        return enqueue(() => onTasksMove(move))
      }
      case 'update':
        addOptimistic({ type: 'update', id: cmd.id, patch: cmd.patch })
        addPending([cmd.id])
        return enqueue(() => onTaskUpdate!(cmd.id, cmd.patch))
      case 'delete':
        addOptimistic({ type: 'delete', ids: cmd.ids })
        return enqueue(() => onTasksDelete!(cmd.ids))
      case 'restore':
        addOptimistic({ type: 'restore', tasks: cmd.tasks })
        addPending(cmd.tasks.map((x) => x.id))
        return enqueue(() => onTasksRestore!(cmd.tasks))
      case 'columns':
        setOptimisticColumnOrder(cmd.order)
        return enqueue(() => onColumnsReorder!(cmd.order))
    }
  }

  function focusTargetOf(cmd: TaskboardCommand): TaskId | undefined {
    switch (cmd.kind) {
      case 'move':
        return cmd.move.taskIds[0]
      case 'update':
        return cmd.id
      case 'restore':
        return cmd.tasks[0]?.id
      default:
        return undefined
    }
  }

  function run(
    cmd: TaskboardCommand,
    opts: { announcement: string; failure: string; entry?: TaskboardHistoryEntry; focusAfter?: TaskId; onError?: (e: unknown) => void },
  ) {
    if (opts.entry) record(opts.entry)
    startTransition(async () => {
      announce(opts.announcement)
      try {
        await execute(cmd)
      } catch (error) {
        // Encerrar a transição sem que `tasks` mude faz o useOptimistic reverter (rollback).
        if (opts.entry) forget(opts.entry)
        setAlert(error instanceof TaskboardConflictError ? t.conflict : opts.failure)
        opts.onError?.(error)
        if (opts.focusAfter && shouldRestoreFocus()) restoreFocusRef.current = opts.focusAfter
      }
    })
  }

  function travel(direction: 'undo' | 'redo') {
    const stack = direction === 'undo' ? past : future
    const entry = stack[stack.length - 1]
    if (!entry) return announce(direction === 'undo' ? t.undoNothing : t.redoNothing)
    const cmd = entry[direction]
    if (!canExecute(cmd)) return announce(direction === 'undo' ? t.undoNothing : t.redoNothing)
    if (direction === 'undo') {
      setPast((h) => h.slice(0, -1))
      setFuture((h) => [...h, entry])
    } else {
      setFuture((h) => h.slice(0, -1))
      setPast((h) => [...h, entry])
    }
    const focusAfter = focusTargetOf(cmd)
    startTransition(async () => {
      announce(direction === 'undo' ? t.undone : t.redone)
      try {
        await execute(cmd)
      } catch (error) {
        forget(entry)
        setAlert(error instanceof TaskboardConflictError ? t.conflict : t.undoFailed)
        if (focusAfter && shouldRestoreFocus()) restoreFocusRef.current = focusAfter
      }
    })
    if (cmd.kind === 'columns') {
      const moved = cmd.order.find((id, i) => columns[i]?.id !== id)
      if (moved) focusSelector(colHeaderSel(moved))
    } else if (focusAfter && shouldRestoreFocus()) {
      // Após renderização otimista, a tarefa estará na nova posição.
      requestAnimationFrame(() => focusTask(focusAfter))
    }
  }

  /** `target.index` é relativo à lista VISÍVEL (filtrada); convertido para a lista completa. */
  function moveTasks(ids: readonly TaskId[], visibleTarget: TaskMoveTarget, source: TaskMove['source'], focusAfter?: TaskId) {
    if (!ids.length) return
    const moving = new Set(ids)

    const col = colById.get(visibleTarget.columnId)
    if (enforceWipLimits && col?.wipLimit != null) {
      const incoming = ids.filter((id) => taskById.get(id)?.columnId !== col.id).length
      if (incoming && (columnTotals.get(col.id) ?? 0) + incoming > col.wipLimit) {
        setAlert(t.wipBlocked(col.title, col.wipLimit))
        return
      }
    }

    const visibleDest = (cells.get(cellKey(visibleTarget.columnId, visibleTarget.laneId)) ?? []).filter(
      (x) => !moving.has(x.id),
    )
    const fullDest = optimisticTasks
      .filter(
        (x) => !moving.has(x.id) && x.columnId === visibleTarget.columnId && getLaneId(x, groupBy) === visibleTarget.laneId,
      )
      .sort(byRank)
    const k = Math.max(0, Math.min(visibleTarget.index, visibleDest.length))
    const before = visibleDest[k]
    const after = visibleDest[k - 1]
    const index = before
      ? fullDest.findIndex((x) => x.id === before.id)
      : after
        ? fullDest.findIndex((x) => x.id === after.id) + 1
        : fullDest.length

    const move = computeMove({ tasks: optimisticTasks, taskIds: ids, target: { ...visibleTarget, index }, groupBy, columns, source })
    const lane = lanes.find((l) => l.id === move.target.laneId)
    const what = describe(ids)
    const where = t.where(col?.title ?? '', groupBy !== 'none' && lane ? lane.title : null, k + 1)
    run(
      { kind: 'move', move },
      {
        announcement: t.moved(what, where),
        failure: t.moveFailed(what),
        focusAfter,
        entry: { undo: { kind: 'move', move: invertMove(optimisticTasks, move) }, redo: { kind: 'move', move } },
        onError: (err) => onMoveError?.(err, move),
      },
    )
  }

  function describe(ids: readonly TaskId[]) {
    return ids.length === 1 ? t.whatOne(taskById.get(ids[0] ?? '')?.title ?? '') : t.whatMany(ids.length)
  }

  /** Alternativa de ponteiro único ao arrasto (WCAG 2.2 — 2.5.7): move a seleção pelo menu. */
  function moveSelection(dest: { columnId?: string; laneId?: string }) {
    const ids = orderedSelection(selectedIds).filter((id) => taskById.has(id))
    const groups = new Map<string, { columnId: string; laneId: string; ids: TaskId[] }>()
    for (const id of ids) {
      const x = taskById.get(id)
      if (!x) continue
      const columnId = dest.columnId ?? x.columnId
      const laneId = dest.laneId ?? getLaneId(x, groupBy)
      const key = cellKey(columnId, laneId)
      const g = groups.get(key) ?? { columnId, laneId, ids: [] }
      g.ids.push(id)
      groups.set(key, g)
    }
    for (const g of groups.values()) {
      moveTasks(g.ids, { columnId: g.columnId, laneId: g.laneId, index: Number.MAX_SAFE_INTEGER }, 'menu')
    }
  }

  /* ---------------- Exclusão ---------------- */
  function deleteTasks(rawIds: readonly TaskId[]) {
    const ids = rawIds.filter((id) => taskById.has(id) && !id.startsWith('draft-'))
    if (!ids.length || !onTasksDelete) return
    const removed = ids.flatMap((id) => taskById.get(id) ?? [])
    // Próximo foco: vizinho do primeiro item excluído na mesma célula.
    const loc = locate(ids[0]!)
    const gone = new Set(ids)
    const list = loc ? (cells.get(loc.key) ?? []) : []
    const neighbor =
      list.slice((loc?.index ?? 0) + 1).find((x) => !gone.has(x.id)) ??
      list.slice(0, loc?.index ?? 0).reverse().find((x) => !gone.has(x.id))
    setSelectedIds((s) => new Set([...s].filter((id) => !gone.has(id))))
    const what = describe(ids)
    run(
      { kind: 'delete', ids },
      {
        announcement: t.deleted(what),
        failure: t.deleteFailed(what),
        focusAfter: ids[0],
        entry: onTasksRestore ? { undo: { kind: 'restore', tasks: removed }, redo: { kind: 'delete', ids } } : undefined,
      },
    )
    if (neighbor && shouldRestoreFocus()) focusTask(neighbor.id)
  }

  function requestDelete(ids: readonly TaskId[]) {
    if (!onTasksDelete || !ids.length) return
    if (onTasksRestore) deleteTasks(ids)
    else setConfirmDeleteIds(ids)
  }

  /* ---------------- Colunas ---------------- */
  function moveColumnTo(columnId: string, toIndex: number) {
    if (!onColumnsReorder) return
    const order = columns.map((c) => c.id)
    const from = order.indexOf(columnId)
    const next = reorderColumns(order, columnId, toIndex - from)
    if (next.join() === order.join()) return
    const title = colById.get(columnId)?.title ?? ''
    run(
      { kind: 'columns', order: next },
      {
        announcement: t.columnMoved(title, next.indexOf(columnId) + 1),
        failure: t.moveFailed(title),
        entry: { undo: { kind: 'columns', order }, redo: { kind: 'columns', order: next } },
      },
    )
    focusSelector(colHeaderSel(columnId))
  }

  function moveColumn(columnId: string, delta: number) {
    moveColumnTo(columnId, columns.findIndex((c) => c.id === columnId) + delta)
  }

  /* ---------------- Criação / edição ---------------- */
  function openCreate(columnId: string, laneId?: string) {
    if (!onTaskCreate) return
    setCreateAt({ columnId, laneId: laneId ?? navLanes[0]?.id ?? lanes[0]?.id ?? '' })
  }

  function createTask(fields: TaskUpdate & { title: string }, at: { columnId: string; laneId: string }) {
    if (!onTaskCreate) return
    const cell = optimisticTasks.filter((x) => x.columnId === at.columnId && getLaneId(x, groupBy) === at.laneId)
    const rank = cell.reduce((m, x) => Math.max(m, x.rank), 0) + 1
    const draft = {
      priority: 'none' as const,
      assignees: [] as TaskAssignee[],
      labels: [] as TaskLabel[],
      ...fields,
      columnId: at.columnId,
      rank,
      ...lanePatchFor(groupBy, at.laneId, optimisticTasks),
    }
    // Responsáveis escolhidos no formulário prevalecem sobre a raia.
    if (fields.assignees) draft.assignees = [...fields.assignees]
    const tempId = `draft-${crypto.randomUUID().slice(0, 8)}`
    startTransition(async () => {
      addOptimistic({ type: 'create', task: { ...draft, id: tempId } })
      addPending([tempId])
      announce(t.moved(t.whatOne(draft.title), colById.get(at.columnId)?.title ?? ''))
      try {
        const created = await enqueue(() => onTaskCreate(draft))
        // Desfazer criação = excluir; refazer = restaurar com o mesmo id.
        if (created && onTasksDelete && onTasksRestore) {
          record({ undo: { kind: 'delete', ids: [created.id] }, redo: { kind: 'restore', tasks: [created] } })
        }
      } catch (error) {
        setAlert(error instanceof TaskboardConflictError ? t.conflict : t.createFailed(draft.title))
      }
    })
  }

  function updateTask(id: TaskId, patch: TaskUpdate) {
    const before = taskById.get(id)
    if (!onTaskUpdate || !before) return
    const title = patch.title ?? before.title
    run(
      { kind: 'update', id, patch },
      {
        announcement: '',
        failure: t.saveFailed(title),
        focusAfter: id,
        entry: { undo: { kind: 'update', id, patch: invertUpdate(before, patch) }, redo: { kind: 'update', id, patch } },
      },
    )
  }

  function openTask(id: TaskId) {
    void setUrl({ task: id })
    const task = taskById.get(id)
    if (task) onTaskOpen?.(task)
  }

  /* ---------------- DnD ---------------- */
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Toque: long-press evita conflito com a rolagem nativa da lista.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  )

  function resolveDrop(e: DragMoveEvent | DragEndEvent, ids: readonly TaskId[]) {
    const data = e.over?.data.current as DropData | undefined
    if (!data || data.type === 'column') return null
    const moving = new Set(ids)
    const list = (cells.get(cellKey(data.columnId, data.laneId)) ?? []).filter((x) => !moving.has(x.id))
    if (data.type === 'card') {
      if (moving.has(data.taskId)) return null
      const overRect = e.over?.rect
      // Usa a posição real do ponteiro (não o centro do card arrastado) para decidir antes/depois.
      const startY = clientY(e.activatorEvent)
      const pointerY = startY != null ? startY + e.delta.y : null
      const activeRect = e.active.rect.current.translated
      const y = pointerY ?? (activeRect ? activeRect.top + activeRect.height / 2 : null)
      const below = overRect && y != null ? y > overRect.top + overRect.height / 2 : false
      return {
        data,
        index: list.findIndex((x) => x.id === data.taskId) + (below ? 1 : 0),
        indicator: { kind: 'card', taskId: data.taskId, edge: below ? 'after' : 'before' } as DropIndicator,
      }
    }
    return { data, index: list.length, indicator: { kind: 'cell', key: cellKey(data.columnId, data.laneId) } as DropIndicator }
  }

  function resolveColumnDrop(e: DragMoveEvent | DragEndEvent) {
    const data = e.over?.data.current as DropData | undefined
    if (!draggingColumnId || data?.type !== 'column' || data.columnId === draggingColumnId) return null
    const rect = e.over!.rect
    const startX = clientX(e.activatorEvent)
    const x = startX != null ? startX + e.delta.x : rect.left
    const edge: 'before' | 'after' = x > rect.left + rect.width / 2 ? 'after' : 'before'
    const without = columns.map((c) => c.id).filter((id) => id !== draggingColumnId)
    const index = without.indexOf(data.columnId) + (edge === 'after' ? 1 : 0)
    return { index, indicator: { kind: 'column', columnId: data.columnId, edge } as DropIndicator }
  }

  function onDragStart(e: DragStartEvent) {
    setAlert('')
    const data = e.active.data.current as { type?: string; columnId?: string } | undefined
    if (data?.type === 'column' && data.columnId) {
      setDraggingColumnId(data.columnId)
      return
    }
    const id = String(e.active.id)
    setDraggingIds(selectedIds.has(id) ? orderedSelection(selectedIds) : [id])
  }

  function onDragMove(e: DragMoveEvent) {
    const next = draggingColumnId ? (resolveColumnDrop(e)?.indicator ?? null) : (resolveDrop(e, draggingIds)?.indicator ?? null)
    if (!sameIndicator(next, dropIndicator)) setDropIndicator(next)
  }

  function onDragEnd(e: DragEndEvent) {
    if (draggingColumnId) {
      const r = resolveColumnDrop(e)
      const id = draggingColumnId
      setDraggingColumnId(null)
      setDropIndicator(null)
      if (r) moveColumnTo(id, r.index)
      return
    }
    const ids = draggingIds
    setDraggingIds([])
    setDropIndicator(null)
    const r = resolveDrop(e, ids)
    if (!r || !ids.length) return
    moveTasks(ids, { columnId: r.data.columnId, laneId: r.data.laneId, index: r.index }, 'pointer', String(e.active.id))
    setFocusedId(String(e.active.id))
  }

  /* ---------------- Teclado (matriz de atalhos) ---------------- */
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const k = logicalKey(e, dir)
    const target = e.target as HTMLElement
    const mod = e.ctrlKey || e.metaKey
    if (isTextInput(target)) return

    if (k === '?') {
      e.preventDefault()
      setHelpOpen(true)
      return
    }
    if (k === '/') {
      e.preventDefault()
      document.getElementById(`${boardId}-search`)?.focus()
      return
    }
    if (mod && (k === 'z' || k === 'Z')) {
      e.preventDefault()
      travel(e.shiftKey ? 'redo' : 'undo')
      return
    }
    if (mod && (k === 'y' || k === 'Y')) {
      e.preventDefault()
      travel('redo')
      return
    }

    // Esc dentro dos controles de um cabeçalho → volta ao cabeçalho.
    const headerHost = target.closest<HTMLElement>('[data-col-header],[data-lane-header]')
    if (headerHost && headerHost !== target) {
      if (k === 'Escape') {
        e.preventDefault()
        headerHost.focus()
      } else if (k === 'ArrowLeft' || k === 'ArrowRight') {
        // Navegação entre os controles internos do cabeçalho (fora da ordem de Tab do grid).
        const controls = [...headerHost.querySelectorAll<HTMLElement>(HEADER_CONTROLS)]
        const i = controls.indexOf(target)
        const next = controls[i + (k === 'ArrowLeft' ? -1 : 1)]
        if (next) {
          e.preventDefault()
          next.focus()
        }
      }
      return
    }
    if (target.dataset.colHeader) return onColumnHeaderKey(e, target.dataset.colHeader)
    if (target.dataset.laneHeader) return onLaneHeaderKey(e, target.dataset.laneHeader)

    const id = target.dataset.taskId
    if (!id) return
    const loc = locate(id)
    if (!loc || loc.li < 0 || loc.ci < 0) return
    const list = cells.get(loc.key) ?? []

    const go = (taskId: TaskId | undefined, extend = false) => {
      if (!taskId) return
      e.preventDefault()
      if (extend) {
        setSelectedIds((prev) => new Set([...prev, id, taskId]))
        if (!anchorId) setAnchorId(id)
      }
      focusTask(taskId)
    }

    // Movimentação via teclado (Alt + setas)
    if (e.altKey && k.startsWith('Arrow')) {
      e.preventDefault()
      const ids = selectedIds.has(id) ? orderedSelection(selectedIds) : [id]
      const moving = new Set(ids)
      const p = list.slice(0, loc.index).filter((x) => !moving.has(x.id)).length
      let target: TaskMoveTarget | null = null
      if (k === 'ArrowLeft' || k === 'ArrowRight') {
        const col = navColumns[loc.ci + (k === 'ArrowLeft' ? -1 : 1)]
        if (col) target = { columnId: col.id, laneId: loc.laneId, index: p }
      } else if (e.shiftKey && groupBy !== 'none') {
        const lane = navLanes[loc.li + (k === 'ArrowUp' ? -1 : 1)]
        if (lane) target = { columnId: loc.task.columnId, laneId: lane.id, index: p }
      } else {
        const np = p + (k === 'ArrowUp' ? -1 : 1)
        const max = list.filter((x) => !moving.has(x.id)).length
        if (np >= 0 && np <= max) target = { columnId: loc.task.columnId, laneId: loc.laneId, index: np }
      }
      if (!target) return announce(t.cannotMove)
      moveTasks(ids, target, 'keyboard', id)
      focusTask(id)
      return
    }

    switch (k) {
      case 'ArrowDown': {
        const next = list[loc.index + 1]
        if (next) return go(next.id, e.shiftKey)
        for (let li = loc.li + 1; li < navLanes.length; li++) {
          const c = cellAt(li, loc.ci)
          if (c[0]) return go(c[0].id)
        }
        return
      }
      case 'ArrowUp': {
        const prev = list[loc.index - 1]
        if (prev) return go(prev.id, e.shiftKey)
        for (let li = loc.li - 1; li >= 0; li--) {
          const c = cellAt(li, loc.ci)
          if (c.length) return go(c[c.length - 1]?.id)
        }
        e.preventDefault()
        return focusSelector(colHeaderSel(loc.task.columnId))
      }
      case 'ArrowLeft':
      case 'ArrowRight': {
        const dir = k === 'ArrowLeft' ? -1 : 1
        for (let ci = loc.ci + dir; ci >= 0 && ci < navColumns.length; ci += dir) {
          const c = cellAt(loc.li, ci)
          if (c.length) return go(c[Math.min(loc.index, c.length - 1)]?.id)
        }
        if (dir === -1 && groupBy !== 'none') {
          e.preventDefault()
          focusSelector(laneHeaderSel(loc.laneId))
        }
        return
      }
      case 'Home':
        return go(mod ? firstVisible?.id : list[0]?.id)
      case 'End': {
        if (mod) {
          const all = navLanes.flatMap((l) => navColumns.flatMap((c) => cells.get(cellKey(c.id, l.id)) ?? []))
          return go(all[all.length - 1]?.id)
        }
        return go(list[list.length - 1]?.id)
      }
      case 'PageDown':
        return go(list[Math.min(loc.index + 10, list.length - 1)]?.id)
      case 'PageUp':
        return go(list[Math.max(loc.index - 10, 0)]?.id)
      case ' ':
        e.preventDefault()
        return selectTask(id, 'toggle')
      case 'Enter':
        e.preventDefault()
        return openTask(id)
      case 'Escape':
        if (selectedIds.size) {
          e.preventDefault()
          setSelectedIds(new Set())
          announce(t.selectionCleared)
        }
        return
      case 'n':
      case 'N':
        if (!mod && onTaskCreate) {
          e.preventDefault()
          openCreate(loc.task.columnId, loc.laneId)
        }
        return
      case 'Delete':
      case 'Backspace':
        if (onTasksDelete) {
          e.preventDefault()
          requestDelete(selectedIds.has(id) ? orderedSelection(selectedIds) : [id])
        }
        return
      case 'a':
      case 'A':
        if (mod) {
          e.preventDefault()
          setSelectedIds(new Set(list.map((x) => x.id)))
          announce(t.selected(list.length))
        }
        return
    }
  }

  function firstCardInColumn(columnId: string) {
    for (const l of navLanes) {
      const first = cells.get(cellKey(columnId, l.id))?.[0]
      if (first) return first.id
    }
    return undefined
  }

  function onColumnHeaderKey(e: React.KeyboardEvent, columnId: string) {
    const k = logicalKey(e, dir)
    const ci = columns.findIndex((c) => c.id === columnId)
    const focusCol = (i: number) => {
      const c = columns[i]
      if (!c) return
      e.preventDefault()
      focusSelector(colHeaderSel(c.id))
    }
    if (e.altKey && (k === 'ArrowLeft' || k === 'ArrowRight')) {
      e.preventDefault()
      return moveColumn(columnId, k === 'ArrowLeft' ? -1 : 1)
    }
    switch (k) {
      case 'ArrowLeft':
        if (ci === 0 && groupBy !== 'none') {
          e.preventDefault()
          return focusSelector('[data-corner-header]')
        }
        return focusCol(ci - 1)
      case 'ArrowRight':
        return focusCol(ci + 1)
      case 'Home':
        return focusCol(0)
      case 'End':
        return focusCol(columns.length - 1)
      case 'ArrowDown': {
        const first = firstCardInColumn(columnId)
        if (first) {
          e.preventDefault()
          focusTask(first)
        }
        return
      }
      case 'Enter':
      case 'F2': {
        e.preventDefault()
        if (collapsedColumns.has(columnId)) return toggleColumnFocus(columnId)
        ;(e.target as HTMLElement).querySelector<HTMLElement>(HEADER_CONTROLS)?.focus()
        return
      }
      case 'n':
      case 'N':
        if (onTaskCreate) {
          e.preventDefault()
          openCreate(columnId)
        }
        return
    }
  }

  function onLaneHeaderKey(e: React.KeyboardEvent, laneId: string) {
    const k = logicalKey(e, dir)
    const li = lanes.findIndex((l) => l.id === laneId)
    const focusLane = (i: number) => {
      const l = lanes[i]
      if (!l) return
      e.preventDefault()
      focusSelector(laneHeaderSel(l.id))
    }
    switch (k) {
      case 'ArrowUp':
        if (li === 0) {
          e.preventDefault()
          return focusSelector('[data-corner-header]')
        }
        return focusLane(li - 1)
      case 'ArrowDown':
        return focusLane(li + 1)
      case 'Home':
        return focusLane(0)
      case 'End':
        return focusLane(lanes.length - 1)
      case 'ArrowRight': {
        if (collapsedLanes.has(laneId)) return
        for (const c of navColumns) {
          const first = cells.get(cellKey(c.id, laneId))?.[0]
          if (first) {
            e.preventDefault()
            return focusTask(first.id)
          }
        }
        return
      }
      case 'Enter':
      case ' ':
        e.preventDefault()
        setCollapsedLanes((s) => toggleInSet(s, laneId))
        return
    }
  }

  function onCornerKey(e: React.KeyboardEvent) {
    const k = logicalKey(e, dir)
    if (k === 'ArrowRight' && columns[0]) {
      e.preventDefault()
      focusSelector(colHeaderSel(columns[0].id))
    } else if (k === 'ArrowDown' && lanes[0]) {
      e.preventDefault()
      focusSelector(laneHeaderSel(lanes[0].id))
    }
  }

  function toggleColumnFocus(columnId: string) {
    setCollapsedColumns((s) => toggleInSet(s, columnId))
    focusSelector(colHeaderSel(columnId))
  }

  const editor: TaskboardContextValue['editor'] = createAt
    ? { mode: 'create', ...createAt }
    : url.task
      ? { mode: 'edit', taskId: url.task }
      : null

  const value: TaskboardContextValue = {
    boardId,
    t,
    locale,
    columns,
    lanes,
    groupBy,
    setGroupBy: (g) => void setUrl({ group: g }),
    query,
    setQuery: (q) => void setUrl({ q: q || null }),
    assigneeFilter: url.assignee,
    labelFilter: url.label,
    setAssigneeFilter: (ids) => void setUrl({ assignee: ids.length ? [...ids] : null }),
    setLabelFilter: (ids) => void setUrl({ label: ids.length ? [...ids] : null }),
    clearFilters: () => void setUrl({ q: null, assignee: null, label: null }),
    availableAssignees,
    availableLabels,
    cells,
    columnTotals,
    taskById,
    pendingIds,
    draggingIds: new Set(draggingIds),
    dropIndicator,
    enforceWipLimits,
    // Tarefas removidas remotamente saem da seleção automaticamente.
    selectedIds: new Set([...selectedIds].filter((id) => taskById.has(id))),
    selectTask,
    selectMany: (ids) => setSelectedIds(new Set(ids)),
    clearSelection: () => setSelectedIds(new Set()),
    moveSelection,
    canUndo: past.length > 0,
    undo: () => travel('undo'),
    canRedo: future.length > 0,
    redo: () => travel('redo'),
    canDelete: !!onTasksDelete,
    requestDelete,
    confirmDeleteIds,
    confirmDelete: () => {
      const ids = confirmDeleteIds
      setConfirmDeleteIds([])
      deleteTasks(ids)
    },
    cancelDelete: () => setConfirmDeleteIds([]),
    draggingColumnId,
    canReorderColumns: !!onColumnsReorder,
    moveColumn,
    tabbableId,
    focusedId,
    focusTask,
    setFocusedId,
    collapsedColumns,
    toggleColumn: toggleColumnFocus,
    collapsedLanes,
    toggleLane: (id) => setCollapsedLanes((s) => toggleInSet(s, id)),
    openTask,
    editor,
    openCreate,
    closeEditor: () => {
      if (createAt) {
        const { columnId } = createAt
        setCreateAt(null)
        focusSelector(colHeaderSel(columnId))
      } else if (url.task) {
        const id = url.task
        void setUrl({ task: null })
        if (taskById.has(id)) focusTask(id)
      }
    },
    canCreate: !!onTaskCreate,
    canEdit: !!onTaskUpdate,
    createTask,
    updateTask,
    helpOpen,
    setHelpOpen,
    registerColumnScroller: (scroll) => {
      columnScroller.current = scroll
    },
    columnVirtualizationThreshold,
    dir,
    registerCell: (key, handle) => {
      if (handle) cellHandles.current.set(key, handle)
      else cellHandles.current.delete(key)
    },
    estimateCardSize,
    renderCard,
    renderColumnHeader,
    renderSwimlaneHeader,
  }

  const overlayTask = draggingIds[0] ? taskById.get(draggingIds[0]) : undefined

  return (
    <TaskboardContext value={value}>
      <DirectionProvider direction={dir}>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setDraggingColumnId(null)
          setDraggingIds([])
          setDropIndicator(null)
        }}
        accessibility={{
          screenReaderInstructions: { draggable: t.dragInstructions },
          announcements: {
            onDragStart: ({ active }) =>
              active.data.current?.type === 'column'
                ? t.dragColumnStart(colById.get(String(active.data.current.columnId))?.title ?? '')
                : t.dragStart(selectedIds.has(String(active.id)) ? selectedIds.size : 1),
            onDragOver: ({ over }) => t.dragOver(!!over),
            onDragEnd: ({ over }) => t.dragEnd(!!over),
            onDragCancel: () => t.dragCancel,
          },
        }}
      >
        <div
          ref={rootRef}
          id={boardId}
          dir={dir}
          role="region"
          aria-label={ariaLabel ?? t.boardLabel}
          aria-describedby={`${boardId}-instructions`}
          onKeyDown={(e) => {
            if ((e.target as HTMLElement).dataset.cornerHeader !== undefined) onCornerKey(e)
            else onKeyDown(e)
          }}
          className={cn('@container/board flex min-h-0 flex-col gap-3 text-foreground', className)}
        >
          <p id={`${boardId}-instructions`} className="sr-only">
            {t.instructions}
          </p>
          {children}
          <TaskboardDeleteConfirm />
          <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
            {status}
          </div>
          <div role="alert" aria-atomic="true" className={cn(!alert && 'sr-only')}>
            {alert && (
              <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <span>{alert}</span>
                <button
                  type="button"
                  onClick={() => setAlert('')}
                  className={cn("min-h-6 rounded px-2 py-1 underline", FOCUS_RING)}
                >
                  {t.dismiss}
                </button>
              </div>
            )}
          </div>
        </div>
        <DragOverlay dropAnimation={null}>
          {draggingColumnId && (
            <div className="w-56 rotate-1 cursor-grabbing rounded-lg border bg-background px-3 py-2 text-sm font-semibold shadow-lg">
              {colById.get(draggingColumnId)?.title}
            </div>
          )}
          {overlayTask && (
            <div className="relative w-72 rotate-2 cursor-grabbing">
              {draggingIds.length > 1 && (
                <>
                  <div aria-hidden className="absolute inset-0 translate-x-2 translate-y-2 rounded-lg border bg-card" />
                  <div aria-hidden className="absolute inset-0 translate-x-1 translate-y-1 rounded-lg border bg-card" />
                </>
              )}
              <div className="relative rounded-lg border bg-card shadow-lg">
                {renderCard ? (
                  renderCard({ task: overlayTask, isSelected: true, isFocused: false, isDragging: true, isPendingMove: false })
                ) : (
                  <TaskboardCardContent task={overlayTask} t={t} locale={locale} />
                )}
              </div>
              {draggingIds.length > 1 && (
                <span className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {draggingIds.length}
                </span>
              )}
            </div>
          )}
        </DragOverlay>
      </DndContext>
      </DirectionProvider>
    </TaskboardContext>
  )
}

function toggleInSet<T>(set: ReadonlySet<T>, value: T): ReadonlySet<T> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

function uniqueBy<T extends { id: string; name: string }>(items: readonly T[]): T[] {
  const map = new Map<string, T>()
  for (const i of items) if (!map.has(i.id)) map.set(i.id, i)
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function sameIndicator(a: DropIndicator | null, b: DropIndicator | null) {
  if (a === b) return true
  if (!a || !b || a.kind !== b.kind) return false
  if (a.kind === 'cell' && b.kind === 'cell') return a.key === b.key
  if (a.kind === 'card' && b.kind === 'card') return a.taskId === b.taskId && a.edge === b.edge
  if (a.kind === 'column' && b.kind === 'column') return a.columnId === b.columnId && a.edge === b.edge
  return false
}

function clientX(ev: Event | null): number | null {
  if (!ev) return null
  if ('touches' in ev) {
    const te = ev as TouchEvent
    return te.touches[0]?.clientX ?? te.changedTouches[0]?.clientX ?? null
  }
  return 'clientX' in ev ? (ev as MouseEvent).clientX : null
}

function clientY(ev: Event | null): number | null {
  if (!ev) return null
  if ('touches' in ev) {
    const te = ev as TouchEvent
    return te.touches[0]?.clientY ?? te.changedTouches[0]?.clientY ?? null
  }
  return 'clientY' in ev ? (ev as MouseEvent).clientY : null
}

/** Em RTL, ←/→ seguem a ordem visual: a "próxima" coluna fica à esquerda. */
function logicalKey(e: React.KeyboardEvent, dir: 'ltr' | 'rtl'): string {
  if (dir !== 'rtl') return e.key
  if (e.key === 'ArrowLeft') return 'ArrowRight'
  if (e.key === 'ArrowRight') return 'ArrowLeft'
  return e.key
}

function isTextInput(el: HTMLElement) {
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}

export type { Task }
