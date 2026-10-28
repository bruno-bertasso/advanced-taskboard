import type { TaskPriority } from './types'

export interface TaskboardMessages {
  boardLabel: string
  gridLabel: string
  instructions: string
  laneCorner: Record<'none' | 'swimlane' | 'assignee' | 'priority', string>
  groupByLabel: string
  groupBy: Record<'none' | 'swimlane' | 'assignee' | 'priority', string>
  priority: Record<TaskPriority, string>
  laneAll: string
  laneNoSwimlane: string
  laneNoAssignee: string
  searchLabel: string
  searchPlaceholder: string
  filters: string
  filterAssignees: string
  filterLabels: string
  clearFilters: string
  activeFilters: (n: number) => string
  tasks: (n: number) => string
  tasksIn: (label: string) => string
  wipCount: (count: number, limit: number, over: boolean) => string
  columnActions: (title: string) => string
  selectAll: (n: number) => string
  collapseColumn: string
  expandColumn: (title: string, n: number) => string
  moveColumnLeft: string
  moveColumnRight: string
  newTask: string
  newTaskIn: (column: string) => string
  collapsedCell: (label: string, n: number) => string
  emptyCell: string
  emptyFiltered: string
  selectedCount: (n: number) => string
  selectionActions: string
  moveTo: string
  column: string
  lane: string
  clearSelection: string
  undo: string
  undoNothing: string
  undone: string
  redo: string
  redoNothing: string
  redone: string
  undoFailed: string
  conflict: string
  deleteAction: string
  deleted: (what: string) => string
  deleteFailed: (what: string) => string
  confirmDeleteTitle: (n: number) => string
  confirmDeleteDescription: string
  dragColumn: (title: string) => string
  dragColumnStart: (title: string) => string
  shortcuts: string
  shortcutsTitle: string
  shortcutsDescription: string
  close: string
  dismiss: string
  draggableTask: string
  dragInstructions: string
  dragStart: (n: number) => string
  dragOver: (over: boolean) => string
  dragEnd: (over: boolean) => string
  dragCancel: string
  moved: (what: string, where: string) => string
  moveFailed: (what: string) => string
  cannotMove: string
  wipBlocked: (column: string, limit: number) => string
  whatOne: (title: string) => string
  whatMany: (n: number) => string
  where: (column: string, lane: string | null, position: number) => string
  selectionCleared: string
  selected: (n: number) => string
  columnMoved: (title: string, position: number) => string
  results: (n: number) => string
  // Detalhe / formulário
  status: string
  priorityField: string
  assignees: string
  dueDate: string
  labels: string
  estimate: string
  description: string
  noDescription: string
  title: string
  titleRequired: string
  save: string
  cancel: string
  create: string
  edit: string
  unassigned: string
  saveFailed: (title: string) => string
  createFailed: (title: string) => string
  overdue: string
  estimatePoints: (n: number) => string
  priorityA11y: (label: string) => string
}

export const ptBR: TaskboardMessages = {
  boardLabel: 'Quadro de tarefas',
  gridLabel: 'Colunas e raias de tarefas',
  instructions:
    'Use as setas para navegar entre tarefas e cabeçalhos, Espaço para selecionar, Enter para abrir, Alt + setas para mover, Delete para excluir, Ctrl + Z para desfazer, Ctrl + Shift + Z para refazer e ? para a lista completa de atalhos.',
  laneCorner: { none: '', swimlane: 'Raia', assignee: 'Responsável', priority: 'Prioridade' },
  groupByLabel: 'Agrupar por',
  groupBy: { none: 'Nenhum', swimlane: 'Raia', assignee: 'Responsável', priority: 'Prioridade' },
  priority: { urgent: 'Urgente', high: 'Alta', medium: 'Média', low: 'Baixa', none: 'Sem prioridade' },
  laneAll: 'Todas',
  laneNoSwimlane: 'Sem raia',
  laneNoAssignee: 'Sem responsável',
  searchLabel: 'Filtrar tarefas',
  searchPlaceholder: 'Filtrar tarefas…  ( / )',
  filters: 'Filtros',
  filterAssignees: 'Responsáveis',
  filterLabels: 'Etiquetas',
  clearFilters: 'Limpar filtros',
  activeFilters: (n) => `${n} filtro${n === 1 ? '' : 's'} ativo${n === 1 ? '' : 's'}`,
  tasks: (n) => `${n} tarefa${n === 1 ? '' : 's'}`,
  tasksIn: (l) => `Tarefas: ${l}`,
  wipCount: (c, l, o) => `${c} de ${l} tarefas (limite WIP)${o ? ', limite excedido' : ''}`,
  columnActions: (t) => `Ações da coluna ${t}`,
  selectAll: (n) => `Selecionar todas (${n})`,
  collapseColumn: 'Recolher coluna',
  expandColumn: (t, n) => `Expandir coluna ${t} (${n} tarefas)`,
  moveColumnLeft: 'Mover coluna para a esquerda',
  moveColumnRight: 'Mover coluna para a direita',
  newTask: 'Nova tarefa',
  newTaskIn: (c) => `Nova tarefa em ${c}`,
  collapsedCell: (l, n) => `${l}: ${n} tarefas (recolhido)`,
  emptyCell: 'Solte tarefas aqui',
  emptyFiltered: 'Nenhuma tarefa corresponde ao filtro',
  selectedCount: (n) => `${n} selecionada${n === 1 ? '' : 's'}`,
  selectionActions: 'Ações da seleção',
  moveTo: 'Mover para',
  column: 'Coluna',
  lane: 'Raia',
  clearSelection: 'Limpar seleção',
  undo: 'Desfazer',
  undoNothing: 'Nada para desfazer.',
  undone: 'Ação desfeita.',
  redo: 'Refazer',
  redoNothing: 'Nada para refazer.',
  redone: 'Ação refeita.',
  undoFailed: 'Falha ao desfazer/refazer. Nenhuma alteração foi aplicada.',
  conflict: 'Esta tarefa foi alterada por outra pessoa. Sua alteração foi descartada e o quadro mostra a versão atual.',
  deleteAction: 'Excluir',
  deleted: (w) => `${w} excluída(s). Ctrl + Z para desfazer.`,
  deleteFailed: (w) => `Falha ao excluir ${w}. A tarefa foi restaurada.`,
  confirmDeleteTitle: (n) => (n === 1 ? 'Excluir 1 tarefa?' : `Excluir ${n} tarefas?`),
  confirmDeleteDescription: 'Esta ação não pode ser desfeita.',
  dragColumn: (t) => `Arrastar coluna ${t}`,
  dragColumnStart: (t) => `Arrastando coluna ${t}.`,
  shortcuts: 'Atalhos',
  shortcutsTitle: 'Atalhos de teclado',
  shortcutsDescription: 'Disponíveis quando o foco está no quadro.',
  close: 'Fechar',
  dismiss: 'Dispensar',
  draggableTask: 'tarefa arrastável',
  dragInstructions: 'Para mover pelo teclado use Alt + setas. Pressione ? para ver todos os atalhos.',
  dragStart: (n) => `Arrastando ${n} tarefa${n === 1 ? '' : 's'}.`,
  dragOver: (o) => (o ? 'Sobre uma área de destino.' : 'Fora de uma área de destino.'),
  dragEnd: (o) => (o ? 'Tarefa solta.' : 'Movimento cancelado.'),
  dragCancel: 'Movimento cancelado.',
  moved: (w, d) => `${w} movida(s) para ${d}.`,
  moveFailed: (w) => `Falha ao mover ${w}. A alteração foi desfeita.`,
  cannotMove: 'Não é possível mover nessa direção.',
  wipBlocked: (c, l) => `Movimento bloqueado: a coluna ${c} atingiu o limite WIP de ${l}.`,
  whatOne: (t) => `"${t}"`,
  whatMany: (n) => `${n} tarefas`,
  where: (c, l, p) => `${c}${l ? `, raia ${l}` : ''}, posição ${p}`,
  selectionCleared: 'Seleção limpa.',
  selected: (n) => `${n} tarefas selecionadas.`,
  columnMoved: (t, p) => `Coluna ${t} movida para a posição ${p}.`,
  results: (n) => `${n} tarefa${n === 1 ? '' : 's'} encontrada${n === 1 ? '' : 's'}.`,
  status: 'Status',
  priorityField: 'Prioridade',
  assignees: 'Responsáveis',
  dueDate: 'Entrega',
  labels: 'Etiquetas',
  estimate: 'Estimativa',
  description: 'Descrição',
  noDescription: 'Sem descrição.',
  title: 'Título',
  titleRequired: 'Informe um título.',
  save: 'Salvar',
  cancel: 'Cancelar',
  create: 'Criar tarefa',
  edit: 'Editar',
  unassigned: 'Ninguém',
  saveFailed: (t) => `Falha ao salvar "${t}". A alteração foi desfeita.`,
  createFailed: (t) => `Falha ao criar "${t}". A tarefa foi removida.`,
  overdue: '(atrasada)',
  estimatePoints: (n) => `Estimativa ${n} pontos`,
  priorityA11y: (l) => `Prioridade ${l}.`,
}

export const enUS: TaskboardMessages = {
  boardLabel: 'Task board',
  gridLabel: 'Task columns and swimlanes',
  instructions:
    'Use arrow keys to move between tasks and headers, Space to select, Enter to open, Alt + arrows to move, Delete to delete, Ctrl + Z to undo, Ctrl + Shift + Z to redo and ? for all shortcuts.',
  laneCorner: { none: '', swimlane: 'Lane', assignee: 'Assignee', priority: 'Priority' },
  groupByLabel: 'Group by',
  groupBy: { none: 'None', swimlane: 'Lane', assignee: 'Assignee', priority: 'Priority' },
  priority: { urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low', none: 'No priority' },
  laneAll: 'All',
  laneNoSwimlane: 'No lane',
  laneNoAssignee: 'Unassigned',
  searchLabel: 'Filter tasks',
  searchPlaceholder: 'Filter tasks…  ( / )',
  filters: 'Filters',
  filterAssignees: 'Assignees',
  filterLabels: 'Labels',
  clearFilters: 'Clear filters',
  activeFilters: (n) => `${n} active filter${n === 1 ? '' : 's'}`,
  tasks: (n) => `${n} task${n === 1 ? '' : 's'}`,
  tasksIn: (l) => `Tasks: ${l}`,
  wipCount: (c, l, o) => `${c} of ${l} tasks (WIP limit)${o ? ', limit exceeded' : ''}`,
  columnActions: (t) => `${t} column actions`,
  selectAll: (n) => `Select all (${n})`,
  collapseColumn: 'Collapse column',
  expandColumn: (t, n) => `Expand column ${t} (${n} tasks)`,
  moveColumnLeft: 'Move column left',
  moveColumnRight: 'Move column right',
  newTask: 'New task',
  newTaskIn: (c) => `New task in ${c}`,
  collapsedCell: (l, n) => `${l}: ${n} tasks (collapsed)`,
  emptyCell: 'Drop tasks here',
  emptyFiltered: 'No tasks match the filter',
  selectedCount: (n) => `${n} selected`,
  selectionActions: 'Selection actions',
  moveTo: 'Move to',
  column: 'Column',
  lane: 'Lane',
  clearSelection: 'Clear selection',
  undo: 'Undo',
  undoNothing: 'Nothing to undo.',
  undone: 'Action undone.',
  redo: 'Redo',
  redoNothing: 'Nothing to redo.',
  redone: 'Action redone.',
  undoFailed: 'Undo/redo failed. No changes were applied.',
  conflict: 'This task was changed by someone else. Your change was discarded and the board shows the latest version.',
  deleteAction: 'Delete',
  deleted: (w) => `${w} deleted. Ctrl + Z to undo.`,
  deleteFailed: (w) => `Failed to delete ${w}. The task was restored.`,
  confirmDeleteTitle: (n) => (n === 1 ? 'Delete 1 task?' : `Delete ${n} tasks?`),
  confirmDeleteDescription: 'This action cannot be undone.',
  dragColumn: (t) => `Drag column ${t}`,
  dragColumnStart: (t) => `Dragging column ${t}.`,
  shortcuts: 'Shortcuts',
  shortcutsTitle: 'Keyboard shortcuts',
  shortcutsDescription: 'Available while focus is inside the board.',
  close: 'Close',
  dismiss: 'Dismiss',
  draggableTask: 'draggable task',
  dragInstructions: 'To move with the keyboard use Alt + arrows. Press ? for all shortcuts.',
  dragStart: (n) => `Dragging ${n} task${n === 1 ? '' : 's'}.`,
  dragOver: (o) => (o ? 'Over a drop target.' : 'Not over a drop target.'),
  dragEnd: (o) => (o ? 'Task dropped.' : 'Move cancelled.'),
  dragCancel: 'Move cancelled.',
  moved: (w, d) => `${w} moved to ${d}.`,
  moveFailed: (w) => `Failed to move ${w}. The change was reverted.`,
  cannotMove: 'Cannot move in that direction.',
  wipBlocked: (c, l) => `Move blocked: column ${c} reached its WIP limit of ${l}.`,
  whatOne: (t) => `"${t}"`,
  whatMany: (n) => `${n} tasks`,
  where: (c, l, p) => `${c}${l ? `, lane ${l}` : ''}, position ${p}`,
  selectionCleared: 'Selection cleared.',
  selected: (n) => `${n} tasks selected.`,
  columnMoved: (t, p) => `Column ${t} moved to position ${p}.`,
  results: (n) => `${n} task${n === 1 ? '' : 's'} found.`,
  status: 'Status',
  priorityField: 'Priority',
  assignees: 'Assignees',
  dueDate: 'Due',
  labels: 'Labels',
  estimate: 'Estimate',
  description: 'Description',
  noDescription: 'No description.',
  title: 'Title',
  titleRequired: 'Enter a title.',
  save: 'Save',
  cancel: 'Cancel',
  create: 'Create task',
  edit: 'Edit',
  unassigned: 'Nobody',
  saveFailed: (t) => `Failed to save "${t}". The change was reverted.`,
  createFailed: (t) => `Failed to create "${t}". The task was removed.`,
  overdue: '(overdue)',
  estimatePoints: (n) => `Estimate ${n} points`,
  priorityA11y: (l) => `Priority ${l}.`,
}

export const TASKBOARD_LOCALES = { 'pt-BR': ptBR, 'en-US': enUS } as const
export type TaskboardLocale = keyof typeof TASKBOARD_LOCALES
