import type * as React from 'react'
import { createContext, use } from 'react'
import type { TaskboardLocale, TaskboardMessages } from './i18n'
import type {
  RenderCardContext,
  RenderColumnHeaderContext,
  RenderSwimlaneHeaderContext,
  Task,
  TaskAssignee,
  TaskboardColumnDef,
  TaskboardEditorState,
  TaskboardGroupBy,
  TaskboardLane,
  TaskId,
  TaskLabel,
  TaskUpdate,
} from './types'

export interface CellHandle {
  scrollToIndex: (index: number) => void
}

export type DropIndicator =
  | { readonly kind: 'card'; readonly taskId: TaskId; readonly edge: 'before' | 'after' }
  | { readonly kind: 'cell'; readonly key: string }
  | { readonly kind: 'column'; readonly columnId: string; readonly edge: 'before' | 'after' }

export interface TaskboardContextValue {
  boardId: string
  t: TaskboardMessages
  locale: TaskboardLocale
  /** Colunas na ordem (otimista) atual. */
  columns: readonly TaskboardColumnDef[]
  lanes: readonly TaskboardLane[]
  groupBy: TaskboardGroupBy
  setGroupBy: (g: TaskboardGroupBy) => void

  query: string
  setQuery: (q: string) => void
  assigneeFilter: readonly string[]
  labelFilter: readonly string[]
  setAssigneeFilter: (ids: readonly string[]) => void
  setLabelFilter: (ids: readonly string[]) => void
  clearFilters: () => void
  availableAssignees: readonly TaskAssignee[]
  availableLabels: readonly TaskLabel[]

  /** Tarefas visíveis (otimistas + filtradas) por célula. */
  cells: Map<string, Task[]>
  /** Total por coluna (todas as raias, sem filtro) — usado para WIP. */
  columnTotals: Map<string, number>
  taskById: Map<TaskId, Task>
  pendingIds: ReadonlySet<TaskId>
  draggingIds: ReadonlySet<TaskId>
  dropIndicator: DropIndicator | null
  enforceWipLimits: boolean

  selectedIds: ReadonlySet<TaskId>
  selectTask: (id: TaskId, mode: 'replace' | 'toggle' | 'range') => void
  selectMany: (ids: readonly TaskId[]) => void
  clearSelection: () => void
  moveSelection: (dest: { columnId?: string; laneId?: string }) => void

  canUndo: boolean
  undo: () => void
  canRedo: boolean
  redo: () => void

  canDelete: boolean
  /** Exclui (com undo) ou abre confirmação, conforme `onTasksRestore` exista. */
  requestDelete: (ids: readonly TaskId[]) => void
  confirmDeleteIds: readonly TaskId[]
  confirmDelete: () => void
  cancelDelete: () => void
  draggingColumnId: string | null

  canReorderColumns: boolean
  moveColumn: (columnId: string, delta: number) => void

  tabbableId: TaskId | null
  focusedId: TaskId | null
  focusTask: (id: TaskId) => void
  setFocusedId: (id: TaskId | null) => void

  collapsedColumns: ReadonlySet<string>
  toggleColumn: (id: string) => void
  collapsedLanes: ReadonlySet<string>
  toggleLane: (id: string) => void

  openTask: (id: TaskId) => void
  editor: TaskboardEditorState | null
  openCreate: (columnId: string, laneId?: string) => void
  closeEditor: () => void
  canCreate: boolean
  canEdit: boolean
  createTask: (fields: TaskUpdate & { title: string }, at: { columnId: string; laneId: string }) => void
  updateTask: (id: TaskId, patch: TaskUpdate) => void

  helpOpen: boolean
  setHelpOpen: (open: boolean) => void

  registerCell: (key: string, handle: CellHandle | null) => void
  registerColumnScroller: (scroll: ((index: number) => void) | null) => void
  columnVirtualizationThreshold: number
  dir: 'ltr' | 'rtl'
  estimateCardSize: number

  renderCard?: (ctx: RenderCardContext) => React.ReactNode
  renderColumnHeader?: (ctx: RenderColumnHeaderContext) => React.ReactNode
  renderSwimlaneHeader?: (ctx: RenderSwimlaneHeaderContext) => React.ReactNode
}

export const TaskboardContext = createContext<TaskboardContextValue | null>(null)

export function useTaskboard(): TaskboardContextValue {
  const ctx = use(TaskboardContext)
  if (!ctx) throw new Error('Componentes Taskboard* devem ser usados dentro de <Taskboard>.')
  return ctx
}
