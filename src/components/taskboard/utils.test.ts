import { describe, expect, it } from 'vitest'
import type { Task, TaskboardColumnDef } from './types'
import {
  ALL_LANE,
  NO_LANE,
  applyMove,
  applyOptimistic,
  invertMove,
  invertUpdate,
  matchesFilters,
  reorderColumns,
  byRank,
  cellKey,
  computeMove,
  deriveLanes,
  getLaneId,
  groupIntoCells,
  matchesQuery,
  needsRebalance,
} from './utils'

const columns: TaskboardColumnDef[] = [
  { id: 'todo', title: 'A fazer' },
  { id: 'doing', title: 'Fazendo' },
]
const ana = { id: 'u1', name: 'Ana' }
const bia = { id: 'u2', name: 'Bia' }

const t = (id: string, columnId: string, rank: number, extra: Partial<Task> = {}): Task => ({
  id,
  title: `Tarefa ${id}`,
  columnId,
  rank,
  priority: 'medium',
  assignees: [],
  labels: [],
  ...extra,
})

const tasks: Task[] = [
  t('A', 'todo', 1, { swimlaneId: 'web', assignees: [ana] }),
  t('B', 'todo', 2, { swimlaneId: 'web' }),
  t('C', 'todo', 3, { swimlaneId: 'mob', priority: 'high' }),
  t('D', 'doing', 1, { assignees: [bia] }),
  t('E', 'doing', 2),
]

const order = (list: readonly Task[], columnId: string) =>
  list.filter((x) => x.columnId === columnId).sort(byRank).map((x) => x.id)

describe('getLaneId / deriveLanes', () => {
  it('mapeia raias conforme o agrupamento', () => {
    expect(getLaneId(tasks[0]!, 'none')).toBe(ALL_LANE)
    expect(getLaneId(tasks[0]!, 'swimlane')).toBe('web')
    expect(getLaneId(tasks[3]!, 'swimlane')).toBe(NO_LANE)
    expect(getLaneId(tasks[0]!, 'assignee')).toBe('u1')
    expect(getLaneId(tasks[2]!, 'priority')).toBe('high')
  })

  it('adiciona "Sem raia" apenas quando necessário', () => {
    const lanes = deriveLanes(tasks, 'swimlane', [{ id: 'web', title: 'Web' }, { id: 'mob', title: 'Mobile' }])
    expect(lanes.map((l) => l.id)).toEqual(['web', 'mob', NO_LANE])
    expect(deriveLanes(tasks.slice(0, 3), 'swimlane', [{ id: 'web', title: 'Web' }]).at(-1)?.id).toBe('web')
  })

  it('ordena responsáveis por nome e inclui "Sem responsável"', () => {
    expect(deriveLanes(tasks, 'assignee').map((l) => l.id)).toEqual(['u1', 'u2', NO_LANE])
  })
})

describe('groupIntoCells / matchesQuery', () => {
  it('agrupa por coluna × raia ordenado por rank', () => {
    const cells = groupIntoCells([...tasks].reverse(), 'none')
    expect(cells.get(cellKey('todo', ALL_LANE))?.map((x) => x.id)).toEqual(['A', 'B', 'C'])
  })

  it('filtra por título, id, etiqueta e responsável', () => {
    expect(matchesQuery(tasks[0]!, 'ana')).toBe(true)
    expect(matchesQuery(tasks[0]!, 'tarefa a')).toBe(true)
    expect(matchesQuery(tasks[1]!, 'ana')).toBe(false)
    expect(matchesQuery(tasks[1]!, '')).toBe(true)
    expect(matchesQuery(t('TSK-26', 'todo', 1), '#tsk-26')).toBe(true)
    expect(matchesQuery(t('TSK-260', 'todo', 1), '#tsk-26')).toBe(false)
  })
})

describe('computeMove + applyMove', () => {
  const move = (ids: string[], columnId: string, index: number, groupBy: 'none' | 'swimlane' | 'assignee' | 'priority' = 'none', laneId = ALL_LANE) =>
    computeMove({ tasks, taskIds: ids, target: { columnId, laneId, index }, groupBy, columns, source: 'keyboard' })

  it('insere entre vizinhos', () => {
    const next = applyMove(tasks, move(['A'], 'doing', 1))
    expect(order(next, 'doing')).toEqual(['D', 'A', 'E'])
    expect(order(next, 'todo')).toEqual(['B', 'C'])
  })

  it('insere no início e no fim', () => {
    expect(order(applyMove(tasks, move(['A'], 'doing', 0)), 'doing')).toEqual(['A', 'D', 'E'])
    expect(order(applyMove(tasks, move(['A'], 'doing', 99)), 'doing')).toEqual(['D', 'E', 'A'])
  })

  it('move em lote preservando a ordem do quadro (batch)', () => {
    const m = move(['D', 'C', 'A'], 'doing', 1)
    expect(m.taskIds).toEqual(['A', 'C', 'D'])
    expect(order(applyMove(tasks, m), 'doing')).toEqual(['E', 'A', 'C', 'D'])
  })

  it('reordena dentro da mesma coluna', () => {
    expect(order(applyMove(tasks, move(['A'], 'todo', 2)), 'todo')).toEqual(['B', 'C', 'A'])
    expect(order(applyMove(tasks, move(['C'], 'todo', 0)), 'todo')).toEqual(['C', 'A', 'B'])
  })

  it('coluna vazia', () => {
    const m = computeMove({ tasks, taskIds: ['A', 'B'], target: { columnId: 'x', laneId: ALL_LANE, index: 0 }, groupBy: 'none', columns, source: 'menu' })
    expect(m.patches.map((p) => p.columnId)).toEqual(['x', 'x'])
    expect(m.patches[0]!.rank).toBeLessThan(m.patches[1]!.rank)
  })

  it('aplica o campo da raia conforme o agrupamento', () => {
    expect(move(['A'], 'doing', 0, 'swimlane', 'mob').patches[0]).toMatchObject({ swimlaneId: 'mob' })
    expect(move(['A'], 'doing', 0, 'swimlane', NO_LANE).patches[0]).toMatchObject({ swimlaneId: null })
    expect(move(['A'], 'doing', 0, 'priority', 'urgent').patches[0]).toMatchObject({ priority: 'urgent' })
    expect(move(['B'], 'todo', 0, 'assignee', 'u2').patches[0]).toMatchObject({ assignees: [bia] })
    expect(move(['A'], 'todo', 0, 'assignee', NO_LANE).patches[0]).toMatchObject({ assignees: [] })
  })

  it('applyMove é puro', () => {
    const snapshot = JSON.stringify(tasks)
    applyMove(tasks, move(['A'], 'doing', 0))
    expect(JSON.stringify(tasks)).toBe(snapshot)
  })
})

describe('invertMove (undo)', () => {
  it('restaura coluna, rank e campos de raia', () => {
    const m = computeMove({ tasks, taskIds: ['A', 'D'], target: { columnId: 'todo', laneId: 'urgent', index: 0 }, groupBy: 'priority', columns, source: 'keyboard' })
    const after = applyMove(tasks, m)
    const restored = applyMove(after, invertMove(tasks, m))
    for (const id of ['A', 'D']) {
      const o = tasks.find((x) => x.id === id)!
      const r = restored.find((x) => x.id === id)!
      expect([r.columnId, r.rank, r.priority, r.assignees]).toEqual([o.columnId, o.rank, o.priority, o.assignees])
    }
    expect(invertMove(tasks, m).source).toBe('undo')
  })
})

describe('applyOptimistic', () => {
  it('cria e atualiza', () => {
    const created = applyOptimistic(tasks, { type: 'create', task: t('Z', 'todo', 9) })
    expect(created).toHaveLength(tasks.length + 1)
    const updated = applyOptimistic(created, { type: 'update', id: 'Z', patch: { title: 'Novo', priority: 'urgent' } })
    expect(updated.find((x) => x.id === 'Z')).toMatchObject({ title: 'Novo', priority: 'urgent' })
  })
})

describe('reorderColumns', () => {
  it('move e respeita limites', () => {
    expect(reorderColumns(['a', 'b', 'c'], 'a', 1)).toEqual(['b', 'a', 'c'])
    expect(reorderColumns(['a', 'b', 'c'], 'c', -2)).toEqual(['c', 'a', 'b'])
    expect(reorderColumns(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c'])
  })
})

describe('matchesFilters', () => {
  it('combina busca, responsáveis (incl. sem responsável) e etiquetas', () => {
    const f = (o: Partial<{ query: string; assignees: string[]; labels: string[] }>) => ({ query: '', assignees: [], labels: [], ...o })
    expect(tasks.filter((x) => matchesFilters(x, f({ assignees: ['u1'] }))).map((x) => x.id)).toEqual(['A'])
    expect(tasks.filter((x) => matchesFilters(x, f({ assignees: [NO_LANE] }))).map((x) => x.id)).toEqual(['B', 'C', 'E'])
    const labeled = [...tasks, t('L', 'todo', 5, { labels: [{ id: 'bug', name: 'bug' }] })]
    expect(labeled.filter((x) => matchesFilters(x, f({ labels: ['bug'] }))).map((x) => x.id)).toEqual(['L'])
  })
})

describe('invertUpdate', () => {
  it('captura apenas as chaves alteradas, com null para ausentes', () => {
    const before = t('X', 'todo', 1, { title: 'Antes', dueDate: undefined })
    expect(invertUpdate(before, { title: 'Depois', dueDate: '2026-01-01' })).toEqual({ title: 'Antes', dueDate: null })
  })
})

describe('applyOptimistic — delete/restore', () => {
  it('exclui e restaura sem duplicar', () => {
    const del = applyOptimistic(tasks, { type: 'delete', ids: ['A', 'B'] })
    expect(del.map((x) => x.id)).toEqual(['C', 'D', 'E'])
    const res = applyOptimistic(del, { type: 'restore', tasks: [tasks[0]!, tasks[2]!] })
    expect(res.map((x) => x.id).sort()).toEqual(['A', 'C', 'D', 'E'])
  })
})

describe('rebalanceamento de ranks', () => {
  it('após inserções repetidas no mesmo ponto, renumera a célula e preserva a ordem', () => {
    let state: Task[] = [t('P', 'todo', 1), t('Q', 'todo', 2), ...Array.from({ length: 80 }, (_, i) => t(`M${i}`, 'doing', i))]
    // Insere sempre entre P e o elemento logo após P — o intervalo se divide pela metade a cada vez.
    for (let i = 0; i < 80; i++) {
      const m = computeMove({ tasks: state, taskIds: [`M${i}`], target: { columnId: 'todo', laneId: ALL_LANE, index: 1 }, groupBy: 'none', columns, source: 'pointer' })
      state = applyMove(state, m)
    }
    const ids = order(state, 'todo')
    expect(ids[0]).toBe('P')
    expect(ids.at(-1)).toBe('Q')
    // Última inserida fica logo após P (ordem esperada: P, M79, M78, ..., M0, Q)
    expect(ids.slice(1, 4)).toEqual(['M79', 'M78', 'M77'])
    const ranks = state.filter((x) => x.columnId === 'todo').map((x) => x.rank)
    expect(new Set(ranks).size).toBe(ranks.length) // todos distintos
  })

  it('needsRebalance detecta intervalos degenerados', () => {
    expect(needsRebalance(1, 2, 0.5, 1)).toBe(false)
    expect(needsRebalance(1, 1, 0, 1)).toBe(true)
    expect(needsRebalance(1, 1 + 1e-12, 5e-13, 1)).toBe(true)
    expect(needsRebalance(Number.NaN, 2, 1, 1)).toBe(true)
  })
})
