import type { TaskboardLocale } from './i18n'

export interface TaskboardShortcut {
  readonly keys: readonly string[]
  readonly action: string
  readonly group: string
}

const ptBR: readonly TaskboardShortcut[] = [
  { group: 'Navegação', keys: ['↑', '↓'], action: 'Tarefa anterior / próxima (atravessa raias; do topo vai ao cabeçalho)' },
  { group: 'Navegação', keys: ['←', '→'], action: 'Coluna anterior / próxima (da 1ª coluna vai ao cabeçalho da raia)' },
  { group: 'Navegação', keys: ['Home', 'End'], action: 'Primeira / última tarefa da célula' },
  { group: 'Navegação', keys: ['Ctrl', 'Home / End'], action: 'Primeira / última tarefa do quadro' },
  { group: 'Navegação', keys: ['PgUp', 'PgDn'], action: 'Salta 10 tarefas' },
  { group: 'Cabeçalhos', keys: ['Enter'], action: 'Cabeçalho de coluna: entra nos controles · de raia: recolhe/expande' },
  { group: 'Cabeçalhos', keys: ['Esc'], action: 'Volta dos controles ao cabeçalho' },
  { group: 'Cabeçalhos', keys: ['Alt', '← / →'], action: 'Reordena a coluna focada' },
  { group: 'Seleção', keys: ['Espaço'], action: 'Alterna seleção' },
  { group: 'Seleção', keys: ['Shift', '↑ / ↓'], action: 'Estende seleção' },
  { group: 'Seleção', keys: ['Ctrl', 'A'], action: 'Seleciona todas da célula' },
  { group: 'Seleção', keys: ['Esc'], action: 'Limpa seleção' },
  { group: 'Movimentação', keys: ['Alt', '← / →'], action: 'Move seleção para coluna adjacente' },
  { group: 'Movimentação', keys: ['Alt', '↑ / ↓'], action: 'Reordena na coluna' },
  { group: 'Movimentação', keys: ['Alt', 'Shift', '↑ / ↓'], action: 'Move para raia adjacente' },
  { group: 'Histórico', keys: ['Ctrl', 'Z'], action: 'Desfaz a última ação (mover, criar, editar, excluir, colunas)' },
  { group: 'Histórico', keys: ['Ctrl', 'Shift', 'Z'], action: 'Refaz (também Ctrl + Y)' },
  { group: 'Geral', keys: ['Delete'], action: 'Exclui a seleção (ou a tarefa focada)' },
  { group: 'Geral', keys: ['Enter'], action: 'Abre detalhes da tarefa' },
  { group: 'Geral', keys: ['N'], action: 'Nova tarefa na coluna focada' },
  { group: 'Geral', keys: ['/'], action: 'Foca o filtro' },
  { group: 'Geral', keys: ['?'], action: 'Mostra esta ajuda' },
]

const enUS: readonly TaskboardShortcut[] = [
  { group: 'Navigation', keys: ['↑', '↓'], action: 'Previous / next task (crosses lanes; from top goes to header)' },
  { group: 'Navigation', keys: ['←', '→'], action: 'Previous / next column (from 1st column goes to lane header)' },
  { group: 'Navigation', keys: ['Home', 'End'], action: 'First / last task in cell' },
  { group: 'Navigation', keys: ['Ctrl', 'Home / End'], action: 'First / last task in board' },
  { group: 'Navigation', keys: ['PgUp', 'PgDn'], action: 'Jump 10 tasks' },
  { group: 'Headers', keys: ['Enter'], action: 'Column header: enter controls · lane header: collapse/expand' },
  { group: 'Headers', keys: ['Esc'], action: 'Return from controls to header' },
  { group: 'Headers', keys: ['Alt', '← / →'], action: 'Reorder focused column' },
  { group: 'Selection', keys: ['Space'], action: 'Toggle selection' },
  { group: 'Selection', keys: ['Shift', '↑ / ↓'], action: 'Extend selection' },
  { group: 'Selection', keys: ['Ctrl', 'A'], action: 'Select all in cell' },
  { group: 'Selection', keys: ['Esc'], action: 'Clear selection' },
  { group: 'Moving', keys: ['Alt', '← / →'], action: 'Move selection to adjacent column' },
  { group: 'Moving', keys: ['Alt', '↑ / ↓'], action: 'Reorder within column' },
  { group: 'Moving', keys: ['Alt', 'Shift', '↑ / ↓'], action: 'Move to adjacent lane' },
  { group: 'History', keys: ['Ctrl', 'Z'], action: 'Undo last action (move, create, edit, delete, columns)' },
  { group: 'History', keys: ['Ctrl', 'Shift', 'Z'], action: 'Redo (also Ctrl + Y)' },
  { group: 'General', keys: ['Delete'], action: 'Delete selection (or focused task)' },
  { group: 'General', keys: ['Enter'], action: 'Open task details' },
  { group: 'General', keys: ['N'], action: 'New task in focused column' },
  { group: 'General', keys: ['/'], action: 'Focus filter' },
  { group: 'General', keys: ['?'], action: 'Show this help' },
]

export const TASKBOARD_SHORTCUTS: Record<TaskboardLocale, readonly TaskboardShortcut[]> = {
  'pt-BR': ptBR,
  'en-US': enUS,
}
