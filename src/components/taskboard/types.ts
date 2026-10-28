import type * as React from 'react'
import type { TaskboardLocale, TaskboardMessages } from './i18n'

/* ------------------------------------------------------------------ */
/* Domínio                                                             */
/* ------------------------------------------------------------------ */

export type TaskId = string
export type ColumnId = string
export type SwimlaneId = string

export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low' | 'none'

export interface TaskAssignee {
  readonly id: string
  readonly name: string
  readonly avatarUrl?: string
}

export interface TaskLabel {
  readonly id: string
  readonly name: string
  /** Qualquer cor CSS; usada apenas como indicador (nunca como único meio de informação). */
  readonly color?: string
}

export interface Task {
  readonly id: TaskId
  readonly title: string
  readonly description?: string
  readonly columnId: ColumnId
  readonly swimlaneId?: SwimlaneId | null
  /** Ordenação fracionária dentro da célula (coluna × raia). */
  readonly rank: number
  readonly priority: TaskPriority
  readonly assignees: readonly TaskAssignee[]
  readonly labels: readonly TaskLabel[]
  /** ISO 8601 (YYYY-MM-DD) */
  readonly dueDate?: string | null
  /** Story points / horas */
  readonly estimate?: number | null
  /**
   * Versão para controle de concorrência otimista. Quando presente, `TaskMove.expectedVersions`
   * a repassa ao servidor, que deve rejeitar com `TaskboardConflictError` se divergir.
   */
  readonly version?: number
}

export interface TaskboardColumnDef {
  readonly id: ColumnId
  readonly title: string
  readonly wipLimit?: number
  readonly color?: string
}

export interface TaskboardSwimlaneDef {
  readonly id: SwimlaneId
  readonly title: string
}

export type TaskboardGroupBy = 'none' | 'swimlane' | 'assignee' | 'priority'

/* ------------------------------------------------------------------ */
/* Movimentação                                                        */
/* ------------------------------------------------------------------ */

export interface TaskMoveTarget {
  readonly columnId: ColumnId
  /** Id da raia derivada do `groupBy` atual. */
  readonly laneId: string
  /** Índice de inserção na célula de destino, desconsiderando as tarefas movidas. */
  readonly index: number
}

export interface TaskPatch {
  readonly id: TaskId
  readonly columnId: ColumnId
  readonly rank: number
  readonly swimlaneId?: SwimlaneId | null
  readonly priority?: TaskPriority
  readonly assignees?: readonly TaskAssignee[]
}

export interface TaskMove {
  readonly taskIds: readonly TaskId[]
  readonly target: TaskMoveTarget
  readonly groupBy: TaskboardGroupBy
  /** Patches prontos para persistir (já com ranks recalculados; pode incluir vizinhos renumerados). */
  readonly patches: readonly TaskPatch[]
  /** Versões vistas pelo cliente para cada tarefa alterada (concorrência otimista). */
  readonly expectedVersions: Readonly<Record<TaskId, number | undefined>>
  readonly source: 'pointer' | 'keyboard' | 'menu' | 'undo'
}

/* ------------------------------------------------------------------ */
/* Slots de renderização                                               */
/* ------------------------------------------------------------------ */

export interface TaskboardLane {
  readonly id: string
  readonly title: string
  readonly kind: TaskboardGroupBy
}

export interface RenderCardContext {
  readonly task: Task
  readonly isSelected: boolean
  readonly isFocused: boolean
  readonly isDragging: boolean
  readonly isPendingMove: boolean
}

export interface RenderColumnHeaderContext {
  readonly column: TaskboardColumnDef
  readonly taskCount: number
  readonly isOverWipLimit: boolean
  readonly isCollapsed: boolean
  readonly toggleCollapsed: () => void
}

export interface RenderSwimlaneHeaderContext {
  readonly lane: TaskboardLane
  readonly taskCount: number
  readonly isCollapsed: boolean
  readonly toggleCollapsed: () => void
}

export interface TaskboardProps {
  readonly tasks: readonly Task[]
  readonly columns: readonly TaskboardColumnDef[]
  readonly swimlanes?: readonly TaskboardSwimlaneDef[]
  /** Persistência. Rejeitar a Promise provoca rollback automático do estado otimista. */
  readonly onTasksMove: (move: TaskMove) => Promise<void>
  readonly onMoveError?: (error: unknown, move: TaskMove) => void
  readonly onTaskOpen?: (task: Task) => void
  readonly renderCard?: (ctx: RenderCardContext) => React.ReactNode
  readonly renderColumnHeader?: (ctx: RenderColumnHeaderContext) => React.ReactNode
  readonly renderSwimlaneHeader?: (ctx: RenderSwimlaneHeaderContext) => React.ReactNode
  /** Altura estimada do card para a virtualização. */
  readonly estimateCardSize?: number
  /** Cria tarefa. Recebe o rascunho (sem id); a tarefa aparece de forma otimista até `tasks` incluí-la. */
  readonly onTaskCreate?: (draft: TaskDraft) => Promise<Task | void>
  /**
   * Exclui tarefas. Com `onTasksRestore` a exclusão é imediata e desfazível (Ctrl+Z);
   * sem ele, uma confirmação é exibida antes.
   */
  readonly onTasksDelete?: (ids: readonly TaskId[]) => Promise<void>
  /** Recria tarefas com os mesmos ids (desfazer exclusão, refazer criação). */
  readonly onTasksRestore?: (tasks: readonly Task[]) => Promise<void>
  /** Persiste colunas/raias recolhidas em localStorage sob esta chave. */
  readonly storageKey?: string
  /** Edita campos da tarefa. Rejeitar desfaz a edição otimista. */
  readonly onTaskUpdate?: (id: TaskId, patch: TaskUpdate) => Promise<void>
  /** Reordenação de colunas (menu da coluna ou Alt + ←/→ no cabeçalho). */
  readonly onColumnsReorder?: (columnIds: readonly ColumnId[]) => Promise<void>
  /** Quando `true`, movimentos que excedem `wipLimit` são bloqueados (padrão: apenas alerta). */
  readonly enforceWipLimits?: boolean
  /** Opções para filtros e editor; por padrão derivadas de `tasks`. */
  readonly availableAssignees?: readonly TaskAssignee[]
  readonly availableLabels?: readonly TaskLabel[]
  readonly locale?: TaskboardLocale
  /** Direção do texto; em `rtl` o layout espelha e ←/→ seguem a ordem visual. */
  readonly dir?: 'ltr' | 'rtl'
  /** Acima desta quantidade de colunas, elas são virtualizadas horizontalmente (padrão 12). */
  readonly columnVirtualizationThreshold?: number
  readonly messages?: Partial<TaskboardMessages>
  /** Agrupamento inicial quando não houver `?group=` na URL. */
  readonly defaultGroupBy?: TaskboardGroupBy
  readonly 'aria-label'?: string
  readonly className?: string
  readonly children?: React.ReactNode
}

/* ------------------------------------------------------------------ */
/* Dados de drop (dnd-kit)                                             */
/* ------------------------------------------------------------------ */

export interface CardDropData {
  readonly type: 'card'
  readonly taskId: TaskId
  readonly columnId: ColumnId
  readonly laneId: string
}
export interface ColumnDropData {
  readonly type: 'column'
  readonly columnId: ColumnId
}
export interface CellDropData {
  readonly type: 'cell'
  readonly columnId: ColumnId
  readonly laneId: string
}
export type DropData = CardDropData | CellDropData | ColumnDropData

/* ------------------------------------------------------------------ */
/* Criação / edição                                                    */
/* ------------------------------------------------------------------ */

export type TaskDraft = Omit<Task, 'id'>

export type TaskUpdate = Partial<
  Pick<Task, 'title' | 'description' | 'priority' | 'dueDate' | 'estimate' | 'assignees' | 'labels'>
>

export type OptimisticAction =
  | { readonly type: 'move'; readonly move: TaskMove }
  | { readonly type: 'update'; readonly id: TaskId; readonly patch: TaskUpdate }
  | { readonly type: 'create'; readonly task: Task }
  | { readonly type: 'delete'; readonly ids: readonly TaskId[] }
  | { readonly type: 'restore'; readonly tasks: readonly Task[] }

/** Comando executável/reversível do histórico (undo/redo). */
export type TaskboardCommand =
  | { readonly kind: 'move'; readonly move: TaskMove }
  | { readonly kind: 'update'; readonly id: TaskId; readonly patch: TaskUpdate }
  | { readonly kind: 'delete'; readonly ids: readonly TaskId[] }
  | { readonly kind: 'restore'; readonly tasks: readonly Task[] }
  | { readonly kind: 'columns'; readonly order: readonly ColumnId[] }

export interface TaskboardHistoryEntry {
  readonly undo: TaskboardCommand
  readonly redo: TaskboardCommand
}

export type TaskboardEditorState =
  | { readonly mode: 'create'; readonly columnId: ColumnId; readonly laneId: string }
  | { readonly mode: 'edit'; readonly taskId: TaskId }
