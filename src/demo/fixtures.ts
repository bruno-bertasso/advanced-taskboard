import type { Task, TaskboardColumnDef, TaskboardSwimlaneDef, TaskPriority } from '@/components/taskboard'

/** Dados fictícios determinísticos para a demo e o Storybook. */
export const baseColumns: TaskboardColumnDef[] = [
  { id: 'backlog', title: 'Backlog', color: 'oklch(0.7 0 0)' },
  { id: 'todo', title: 'A fazer', color: 'oklch(0.65 0.15 250)' },
  { id: 'doing', title: 'Em andamento', wipLimit: 420, color: 'oklch(0.75 0.15 80)' },
  { id: 'review', title: 'Revisão', wipLimit: 400, color: 'oklch(0.6 0.2 300)' },
  { id: 'done', title: 'Concluído', color: 'oklch(0.65 0.15 150)' },
]
export const swimlanes: TaskboardSwimlaneDef[] = [
  { id: 'web', title: 'Web' },
  { id: 'mobile', title: 'Mobile' },
  { id: 'platform', title: 'Plataforma' },
]
export const people = ['Ana Souza', 'Bruno Lima', 'Carla Dias', 'Diego Reis', 'Elisa Nunes'].map((name, i) => ({
  id: `u${i}`,
  name,
}))
export const labels = [
  { id: 'l1', name: 'bug', color: 'oklch(0.6 0.2 25)' },
  { id: 'l2', name: 'feature', color: 'oklch(0.6 0.15 250)' },
  { id: 'l3', name: 'a11y', color: 'oklch(0.6 0.15 150)' },
  { id: 'l4', name: 'perf', color: 'oklch(0.7 0.15 80)' },
]
const priorities: TaskPriority[] = ['urgent', 'high', 'medium', 'low', 'none']
const verbs = ['Implementar', 'Corrigir', 'Refatorar', 'Documentar', 'Testar', 'Otimizar']
const nouns = ['login', 'checkout', 'dashboard', 'notificações', 'busca', 'exportação CSV', 'cache', 'API de pedidos']

export function seed(n: number, columns: readonly TaskboardColumnDef[] = baseColumns): Task[] {
  let r = 42
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647)
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)] as T
  return Array.from({ length: n }, (_, i) => ({
    id: `TSK-${i + 1}`,
    title: `${pick(verbs)} ${pick(nouns)}${rnd() > 0.7 ? ' com suporte a múltiplos idiomas e fusos horários' : ''}`,
    description: 'Tarefa gerada para demonstração.',
    columnId: pick(columns).id,
    swimlaneId: rnd() > 0.05 ? pick(swimlanes).id : null,
    rank: i,
    priority: pick(priorities),
    assignees: rnd() > 0.15 ? [pick(people)] : [],
    labels: labels.filter(() => rnd() > 0.7),
    dueDate: rnd() > 0.4 ? `2026-${String(9 + Math.floor(rnd() * 4)).padStart(2, '0')}-${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}` : null,
    estimate: rnd() > 0.3 ? pick([1, 2, 3, 5, 8]) : null,
  }))
}


export const manyColumnsFixture = (n: number): TaskboardColumnDef[] =>
  Array.from({ length: n }, (_, i) => ({ id: `c${i + 1}`, title: `Etapa ${i + 1}` }))
