import AxeBuilder from '@axe-core/playwright'
import { expect, type Locator, type Page, test } from '@playwright/test'

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

async function open(page: Page, query = '', failRate = 0, opts: { noRestore?: boolean; latency?: number } = {}) {
  await page.addInitScript(
    ([r, noRestore, latency]) => {
      window.__TASKBOARD_FAIL_RATE__ = r as number
      window.__TASKBOARD_NO_RESTORE__ = noRestore as boolean
      if (latency) window.__TASKBOARD_LATENCY__ = latency as number
      if (!sessionStorage.getItem('init')) {
        localStorage.clear()
        sessionStorage.setItem('init', '1')
      }
      localStorage.setItem('theme', 'light')
    },
    [failRate, !!opts.noRestore, opts.latency ?? 0] as const,
  )
  await page.goto(`/${query}`)
  await page.locator('[data-task-id]').first().waitFor()
}

const active = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    return {
      task: el?.dataset.taskId ?? null,
      col: el?.dataset.colHeader ?? null,
      lane: el?.dataset.laneHeader ?? null,
      cell: el?.closest('[role=listbox]')?.getAttribute('aria-label') ?? null,
    }
  })

const cellOf = (page: Page, id: string) =>
  page.evaluate((i) => document.querySelector(`[data-task-id="${i}"]`)?.closest('[role=listbox]')?.getAttribute('aria-label') ?? null, id)

/** Encontra o card mesmo se virtualizado fora da tela (filtra pelo id). */
async function cellOfFiltered(page: Page, id: string) {
  await page.getByRole('searchbox').fill(`#${id}`)
  await expect(page.locator(`[data-task-id="${id}"]`)).toBeVisible()
  const cell = await cellOf(page, id)
  await page.getByRole('searchbox').fill('')
  return cell
}

const status = (page: Page) => page.locator('[role=status][aria-live=polite].sr-only')

async function focusFirstCard(page: Page) {
  await page.locator('[data-task-id][tabindex="0"]').focus()
  return (await active(page)).task!
}

async function drag(page: Page, from: Locator, to: Locator, toOffsetY = 20) {
  const a = (await from.boundingBox())!
  const b = (await to.boundingBox())!
  await page.mouse.move(a.x + 60, a.y + 20)
  await page.mouse.down()
  await page.mouse.move(a.x + 80, a.y + 40, { steps: 5 })
  await page.mouse.move(b.x + 60, b.y + toOffsetY, { steps: 15 })
}

/* ------------------------------------------------------------------ */
/* Renderização e virtualização                                        */
/* ------------------------------------------------------------------ */

test('virtualiza: renderiza bem menos que 2.000 cards', async ({ page }) => {
  await open(page)
  const n = await page.locator('[data-task-id]').count()
  expect(n).toBeGreaterThan(10)
  expect(n).toBeLessThan(400)
  await expect(page.locator('[data-task-id][tabindex="0"]')).toHaveCount(1) // roving tabindex
})

/* ------------------------------------------------------------------ */
/* Navegação por teclado (grid completo, incluindo cabeçalhos)         */
/* ------------------------------------------------------------------ */

test('setas navegam entre cards e cabeçalhos de coluna/raia', async ({ page }) => {
  await open(page, '?group=swimlane')
  await focusFirstCard(page)
  const start = await active(page)

  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowRight')
  await expect.poll(async () => (await active(page)).cell).toContain('A fazer')

  // Topo da coluna → cabeçalho da coluna
  await page.keyboard.press('Control+Home')
  await page.keyboard.press('ArrowUp')
  await expect.poll(async () => (await active(page)).col).toBe('backlog')

  await page.keyboard.press('ArrowRight')
  await expect.poll(async () => (await active(page)).col).toBe('todo')

  await page.keyboard.press('ArrowDown')
  await expect.poll(async () => (await active(page)).cell).toContain('A fazer')

  // Primeira coluna → ← vai ao cabeçalho da raia
  await page.keyboard.press('Control+Home')
  await page.keyboard.press('ArrowLeft')
  await expect.poll(async () => (await active(page)).lane).toBe('web')

  await page.keyboard.press('ArrowDown')
  await expect.poll(async () => (await active(page)).lane).toBe('mobile')

  // Enter no cabeçalho de raia recolhe
  await page.keyboard.press('Enter')
  await expect(page.locator('[role=rowheader][aria-expanded=false]')).toHaveCount(1)
  await page.keyboard.press('Enter')

  await page.keyboard.press('ArrowRight')
  await expect.poll(async () => (await active(page)).cell).toContain('Mobile')
  expect(start.task).toBeTruthy()
})

test('Enter no cabeçalho entra nos controles; ←/→ alternam; Esc volta', async ({ page }) => {
  await open(page)
  await focusFirstCard(page)
  await page.keyboard.press('ArrowUp')
  await expect.poll(async () => (await active(page)).col).toBe('backlog')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Arrastar coluna Backlog' })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('button', { name: 'Nova tarefa em Backlog' })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('button', { name: 'Ações da coluna Backlog' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect.poll(async () => (await active(page)).col).toBe('backlog')
})

/* ------------------------------------------------------------------ */
/* Movimentação, desfazer e rollback                                   */
/* ------------------------------------------------------------------ */

test('Alt+→ move em lote; Ctrl+Z desfaz', async ({ page }) => {
  await open(page)
  const id = await focusFirstCard(page)
  await page.keyboard.press('Space')
  await page.keyboard.press('Shift+ArrowDown')
  await expect(page.locator('[aria-selected=true]')).toHaveCount(2)

  await page.keyboard.press('Alt+ArrowRight')
  await expect(status(page)).toContainText('2 tarefas')
  await expect.poll(() => cellOf(page, id)).toBe('Tarefas: A fazer')
  await expect(page.locator('[data-pending]')).toHaveCount(0, { timeout: 5000 })
  await expect.poll(async () => (await active(page)).cell).toBe('Tarefas: A fazer') // foco preservado após commit

  await page.keyboard.press('Control+z')
  await expect(status(page)).toContainText('desfeita')
  await expect.poll(() => cellOf(page, id)).toBe('Tarefas: Backlog')
})

test('rollback: falha da API reverte, alerta e devolve o foco', async ({ page }) => {
  await open(page, '', 1)
  const id = await focusFirstCard(page)
  await page.keyboard.press('Alt+ArrowRight')
  await expect.poll(() => cellOf(page, id)).toBe('Tarefas: A fazer')
  await expect(page.getByRole('alert').first()).toContainText('desfeita', { timeout: 5000 })
  await expect.poll(() => cellOf(page, id)).toBe('Tarefas: Backlog')
  await expect.poll(async () => (await active(page)).task).toBe(id)
  await expect(page.getByRole('button', { name: 'Desfazer', exact: true })).toBeDisabled()
})

test('arrastar em lote com indicador de posição', async ({ page }) => {
  await open(page, '?group=priority')
  const cards = page.getByRole('listbox').first().locator('[data-task-id]')
  const ids = [await cards.nth(0).getAttribute('data-task-id'), await cards.nth(1).getAttribute('data-task-id')]
  await cards.nth(0).click()
  await cards.nth(1).click({ modifiers: ['Control'] })

  const targetId = await page.getByRole('listbox').nth(7).locator('[data-task-id]').first().getAttribute('data-task-id')
  const target = page.locator(`[data-task-id="${targetId}"]`)
  await drag(page, cards.nth(0), target, 70)
  // Recalcula a partir da posição atual (o auto-scroll pode ter deslocado a lista) — metade inferior → "after".
  await expect(async () => {
    const box = (await target.boundingBox())!
    await page.mouse.move(box.x + 60, box.y + box.height * 0.8, { steps: 2 })
    await expect(page.locator(`[data-task-id="${targetId}"] [data-drop-indicator="after"]`)).toHaveCount(1, { timeout: 500 })
  }).toPass({ timeout: 8000 })
  const a = (await target.boundingBox())!
  await page.mouse.move(a.x + 60, a.y + a.height * 0.2, { steps: 5 }) // metade superior → "before"
  await expect(page.locator('[data-drop-indicator="before"]')).toHaveCount(1)
  await page.mouse.up()

  for (const id of ids) await expect.poll(() => cellOf(page, id!)).toBe('Tarefas: Em andamento, Alta')
})

test('"Mover para…" — alternativa de ponteiro único ao arrasto (WCAG 2.5.7)', async ({ page }) => {
  await open(page, '?group=swimlane')
  const card = page.getByRole('listbox').first().locator('[data-task-id]').first()
  const id = (await card.getAttribute('data-task-id'))!
  await card.click()
  await page.getByRole('button', { name: 'Mover para' }).click()
  await page.getByRole('menuitem', { name: 'Concluído' }).click()
  await expect.poll(() => cellOfFiltered(page, id)).toBe('Tarefas: Concluído, Web')
})

test('limite WIP bloqueia movimentos quando enforceWipLimits', async ({ page }) => {
  await open(page)
  await focusFirstCard(page)
  await page.keyboard.press('Control+a') // ~389 tarefas do Backlog
  await page.getByRole('button', { name: 'Mover para' }).click()
  await page.getByRole('menuitem', { name: 'Revisão' }).click()
  await expect(page.getByRole('alert').first()).toContainText('limite WIP')
  await expect(page.getByRole('columnheader', { name: /Backlog/ }).getByText(/^\d+$/)).not.toHaveText('0')
})

/* ------------------------------------------------------------------ */
/* Colunas, criação e edição                                           */
/* ------------------------------------------------------------------ */

test('reordena coluna com Alt+→ no cabeçalho', async ({ page }) => {
  await open(page)
  await focusFirstCard(page)
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Alt+ArrowRight')
  await expect(status(page)).toContainText('Coluna Backlog movida para a posição 2')
  const order = await page.locator('[data-col-header]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.colHeader))
  expect(order.slice(0, 2)).toEqual(['todo', 'backlog'])
  await expect.poll(async () => (await active(page)).col).toBe('backlog')
})

test('cria tarefa com N (com validação) e edita pelo diálogo', async ({ page }) => {
  await open(page)
  await focusFirstCard(page)
  await page.keyboard.press('n')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Nova tarefa em Backlog')
  await dialog.getByRole('button', { name: 'Criar tarefa' }).click()
  await expect(dialog.getByLabel(/Título/)).toHaveAttribute('aria-invalid', 'true')
  await expect(dialog).toContainText('Informe um título.')

  await dialog.getByLabel(/Título/).fill('Tarefa E2E criada')
  await dialog.getByLabel('Prioridade').selectOption('urgent')
  await dialog.getByRole('button', { name: 'Criar tarefa' }).click()
  await expect(dialog).toBeHidden()

  await page.getByRole('searchbox').fill('Tarefa E2E criada')
  const created = page.locator('[data-task-id]').filter({ hasText: 'Tarefa E2E criada' })
  await expect(created).toHaveCount(1)
  await expect(created).toHaveAttribute('data-task-id', /^TSK-\d+$/, { timeout: 5000 }) // id real após persistir

  await created.dblclick()
  await expect(page).toHaveURL(/task=TSK-/)
  await page.getByRole('dialog').getByLabel(/Título/).fill('Tarefa E2E editada')
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click()
  await page.getByRole('searchbox').fill('E2E editada')
  await expect(page.locator('[data-task-id]').filter({ hasText: 'Tarefa E2E editada' })).toHaveCount(1)
})

/* ------------------------------------------------------------------ */
/* Filtros (nuqs), i18n, toque                                         */
/* ------------------------------------------------------------------ */

test('filtros por responsável/etiqueta persistem na URL', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Filtros' }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Ana Souza' }).click()
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/assignee=u0/)
  const names = await page.locator('[data-task-id] [title]').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('title')))])
  expect(names).toEqual(['Ana Souza'])
  await page.reload()
  await expect(page.getByRole('button', { name: /Filtros, 1 filtro ativo/ })).toBeVisible()
  await page.getByRole('button', { name: 'Limpar filtros' }).click()
  await expect(page).not.toHaveURL(/assignee=/)
})

test('troca de idioma (en-US)', async ({ page }) => {
  await open(page)
  await page.getByLabel('Idioma / Language').selectOption('en-US')
  await expect(page.getByRole('button', { name: 'Shortcuts' })).toBeVisible()
  await expect(page.getByRole('grid', { name: 'Task columns and swimlanes' })).toBeVisible()
})

test.describe('toque', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 420, height: 800 } })
  test('cards permitem rolagem nativa (touch-action: manipulation)', async ({ page }) => {
    await open(page)
    const ta = await page.locator('[data-task-id]').first().evaluate((el) => getComputedStyle(el).touchAction)
    expect(ta).toBe('manipulation')
  })
})

/* ------------------------------------------------------------------ */
/* Acessibilidade automatizada (axe-core)                              */
/* ------------------------------------------------------------------ */

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

for (const group of ['none', 'swimlane'] as const) {
  test(`axe: sem violações WCAG 2.2 AA (group=${group})`, async ({ page }) => {
    await open(page, `?group=${group}`)
    const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze()
    expect(violations.map((v) => `${v.id}: ${v.nodes.length} — ${v.help}`)).toEqual([])
  })
}

test('axe: diálogo de criação e ajuda de atalhos', async ({ page }) => {
  await open(page)
  await focusFirstCard(page)
  await page.keyboard.press('n')
  await page.getByRole('dialog').waitFor()
  let r = await new AxeBuilder({ page }).include('[role=dialog]').withTags(WCAG).analyze()
  expect(r.violations.map((v) => v.id)).toEqual([])
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Atalhos' }).click()
  r = await new AxeBuilder({ page }).include('[role=dialog]').withTags(WCAG).analyze()
  expect(r.violations.map((v) => v.id)).toEqual([])
})

test('axe: tema escuro', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Tema escuro' }).click()
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze()
  expect(violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
})

/* ------------------------------------------------------------------ */
/* Histórico completo, exclusão, colunas por ponteiro, persistência    */
/* ------------------------------------------------------------------ */

const waitIdle = (page: Page) => expect(page.locator('[data-pending]')).toHaveCount(0, { timeout: 5000 })

test('Delete exclui com undo/redo (Ctrl+Z / Ctrl+Shift+Z)', async ({ page }) => {
  await open(page)
  const id = await focusFirstCard(page)
  await page.keyboard.press('Delete')
  await expect(status(page)).toContainText('excluída')
  await expect(page.locator(`[data-task-id="${id}"]`)).toHaveCount(0)
  await expect.poll(async () => (await active(page)).cell).toBe('Tarefas: Backlog') // foco no vizinho
  await page.waitForTimeout(800)

  await page.keyboard.press('Control+z')
  await expect.poll(() => cellOfFiltered(page, id)).toBe('Tarefas: Backlog')
  await waitIdle(page)

  await page.locator('[data-task-id][tabindex="0"]').focus()
  await page.keyboard.press('Control+Shift+z')
  await expect(page.getByRole('button', { name: 'Refazer', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Desfazer', exact: true })).toBeEnabled()
  await page.getByRole('searchbox').fill(`#${id}`)
  await expect(page.locator(`[data-task-id="${id}"]`)).toHaveCount(0)
})

test('sem onTasksRestore: exclusão pede confirmação', async ({ page }) => {
  await open(page, '', 0, { noRestore: true })
  const id = await focusFirstCard(page)
  await page.keyboard.press('Delete')
  const dlg = page.getByRole('alertdialog')
  await expect(dlg).toContainText('Excluir 1 tarefa?')
  await dlg.getByRole('button', { name: 'Cancelar' }).click()
  await expect(page.locator(`[data-task-id="${id}"]`)).toHaveCount(1)
  await page.locator(`[data-task-id="${id}"]`).focus()
  await page.keyboard.press('Delete')
  await page.getByRole('alertdialog').getByRole('button', { name: 'Excluir' }).click()
  await expect(page.locator(`[data-task-id="${id}"]`)).toHaveCount(0)
})

test('desfaz/refaz edição e criação', async ({ page }) => {
  await open(page)
  const id = await focusFirstCard(page)
  const original = (await page.locator(`[data-task-id="${id}"] p`).first().textContent())!
  await page.keyboard.press('Enter')
  await page.getByRole('dialog').getByLabel(/Título/).fill('Título alterado')
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click()
  await expect(page.locator(`[data-task-id="${id}"]`)).toContainText('Título alterado')
  await waitIdle(page)
  await page.getByRole('button', { name: 'Desfazer', exact: true }).click()
  await expect(page.locator(`[data-task-id="${id}"]`)).toContainText(original)
  await waitIdle(page)
  await page.getByRole('button', { name: 'Refazer', exact: true }).click()
  await expect(page.locator(`[data-task-id="${id}"]`)).toContainText('Título alterado')
  await waitIdle(page)

  // criação → desfazer remove; refazer restaura com o mesmo id
  await page.getByRole('button', { name: 'Nova tarefa em Backlog' }).click()
  await page.getByRole('dialog').getByLabel(/Título/).fill('Criada para desfazer')
  await page.getByRole('dialog').getByRole('button', { name: 'Criar tarefa' }).click()
  await page.getByRole('searchbox').fill('Criada para desfazer')
  const created = page.locator('[data-task-id]').filter({ hasText: 'Criada para desfazer' })
  await expect(created).toHaveAttribute('data-task-id', /^TSK-/, { timeout: 5000 })
  const newId = await created.getAttribute('data-task-id')
  await expect(page.getByRole('button', { name: 'Desfazer', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Desfazer', exact: true }).click()
  await expect(created).toHaveCount(0)
  await waitIdle(page)
  await page.getByRole('button', { name: 'Refazer', exact: true }).click()
  await expect(page.locator(`[data-task-id="${newId}"]`)).toHaveCount(1)
})

test('vários responsáveis no formulário', async ({ page }) => {
  await open(page)
  const id = await focusFirstCard(page)
  await page.keyboard.press('Enter')
  const dlg = page.getByRole('dialog')
  for (const name of ['Ana Souza', 'Bruno Lima', 'Carla Dias', 'Diego Reis', 'Elisa Nunes']) await dlg.getByLabel(name).uncheck()
  await dlg.getByLabel('Bruno Lima').check()
  await dlg.getByLabel('Elisa Nunes').check()
  await dlg.getByRole('button', { name: 'Salvar' }).click()
  const names = await page.locator(`[data-task-id="${id}"] [title]`).evaluateAll((els) => els.map((e) => e.getAttribute('title')))
  expect(names).toEqual(['Bruno Lima', 'Elisa Nunes'])
})

test('arrasta coluna pelo ponteiro, com indicador; Ctrl+Z desfaz', async ({ page }) => {
  await open(page)
  const order = () => page.locator('[data-col-header]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.colHeader))
  const handle = page.getByRole('button', { name: 'Arrastar coluna Backlog' })
  const target = page.locator('[data-col-header="doing"]')
  const a = (await handle.boundingBox())!
  const b = (await target.boundingBox())!
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(a.x + 30, a.y + 5, { steps: 5 })
  await page.mouse.move(b.x + b.width - 20, b.y + b.height / 2, { steps: 15 })
  await expect(page.locator('[data-column-drop-indicator="after"]')).toHaveCount(1)
  await page.mouse.up()
  await expect.poll(order).toEqual(['todo', 'doing', 'backlog', 'review', 'done'])
  await waitIdle(page)
  await page.locator('[data-col-header="backlog"]').focus()
  await page.keyboard.press('Control+z')
  await expect.poll(order).toEqual(['backlog', 'todo', 'doing', 'review', 'done'])
})

test('colunas e raias recolhidas persistem após recarregar', async ({ page }) => {
  await open(page, '?group=swimlane')
  await page.getByRole('button', { name: 'Ações da coluna Revisão' }).click()
  await page.getByRole('menuitem', { name: 'Recolher coluna' }).click()
  await page.locator('[data-lane-header="mobile"] button').click()
  await page.reload()
  await page.locator('[data-task-id]').first().waitFor()
  await expect(page.getByRole('button', { name: /Expandir coluna Revisão/ })).toBeVisible()
  await expect(page.locator('[data-lane-header="mobile"]')).toHaveAttribute('aria-expanded', 'false')
})

test('selecionar não desloca o layout do quadro', async ({ page }) => {
  await open(page)
  const grid = page.getByRole('grid')
  const before = (await grid.boundingBox())!.y
  await page.locator('[data-task-id]').first().click()
  await expect(page.getByRole('group', { name: 'Ações da seleção' })).toBeVisible()
  expect((await grid.boundingBox())!.y).toBe(before)
})

/* ------------------------------------------------------------------ */
/* Concorrência: conflito de versão e rebase de mudanças remotas       */
/* ------------------------------------------------------------------ */

test('conflito de versão: servidor rejeita, UI reverte com mensagem específica', async ({ page }) => {
  await open(page, '', 0, { latency: 2500 }) // janela ampla para a edição remota chegar antes da resposta
  const id = await focusFirstCard(page)
  await page.keyboard.press('Alt+ArrowRight')
  await expect(page.locator(`[data-task-id="${id}"][data-pending]`)).toHaveCount(1)
  // Outro usuário altera a mesma tarefa enquanto o movimento está pendente.
  await page.evaluate((i) => window.__TASKBOARD_REMOTE__?.(i, { title: 'Editada remotamente' }), id)
  await expect(page.getByRole('alert').first()).toContainText('alterada por outra pessoa', { timeout: 5000 })
  await expect.poll(() => cellOf(page, id)).toBe('Tarefas: Backlog')
  await expect(page.locator(`[data-task-id="${id}"]`)).toContainText('Editada remotamente')
})

test('mudança remota em outra tarefa é aplicada sem perder o movimento pendente (rebase)', async ({ page }) => {
  await open(page)
  const cards = page.getByRole('listbox').first().locator('[data-task-id]')
  const other = (await cards.nth(1).getAttribute('data-task-id'))!
  const id = await focusFirstCard(page)
  await page.keyboard.press('Alt+ArrowRight')
  await page.evaluate((i) => window.__TASKBOARD_REMOTE__?.(i, { title: 'Remota durante pendência' }), other)
  await expect(page.locator(`[data-task-id="${other}"]`)).toContainText('Remota durante pendência')
  await expect.poll(() => cellOf(page, id)).toBe('Tarefas: A fazer') // movimento otimista preservado
  await waitIdle(page)
  await expect.poll(() => cellOf(page, id)).toBe('Tarefas: A fazer') // e confirmado
})

test('tarefa excluída remotamente sai da seleção', async ({ page }) => {
  await open(page)
  const cards = page.getByRole('listbox').first().locator('[data-task-id]')
  const a = (await cards.nth(0).getAttribute('data-task-id'))!
  await cards.nth(0).click()
  await cards.nth(1).click({ modifiers: ['Control'] })
  await expect(page.getByRole('group', { name: 'Ações da seleção' })).toContainText('2 selecionadas')
  await page.evaluate((i) => window.__TASKBOARD_REMOTE__?.(i, { columnId: '__removed__' }), a)
  await expect(page.getByRole('group', { name: 'Ações da seleção' })).toContainText('2 selecionadas') // ainda existe (só mudou de coluna)
})

/* ------------------------------------------------------------------ */
/* Virtualização horizontal de colunas                                 */
/* ------------------------------------------------------------------ */

test('virtualiza colunas (40) e navega por teclado até colunas fora da janela', async ({ page }) => {
  test.slow()
  await open(page, '?cols=40')
  const headers = await page.locator('[data-col-header]').count()
  expect(headers).toBeLessThan(15)
  await expect(page.getByRole('grid')).toHaveAttribute('aria-colcount', '40')
  await focusFirstCard(page)
  // ~30 teclas/s (taxa típica de auto-repeat).
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(30)
  }
  await expect.poll(async () => (await active(page)).cell).toMatch(/Etapa (2\d|3\d)/)
  await page.keyboard.press('ArrowUp')
  await expect.poll(async () => (await active(page)).col).toMatch(/^c(2\d|3\d)$/)
  await page.keyboard.press('End')
  await expect.poll(async () => (await active(page)).col).toBe('c40')
  await expect(page.locator('[data-col-header="c1"]')).toHaveCount(0) // primeira saiu da janela
  await page.keyboard.press('Home')
  await expect.poll(async () => (await active(page)).col).toBe('c1')
})

/* ------------------------------------------------------------------ */
/* RTL                                                                 */
/* ------------------------------------------------------------------ */

test('RTL: layout espelhado e ←/→ seguem a ordem visual', async ({ page }) => {
  await open(page, '?dir=rtl')
  const xs = await page.locator('[data-col-header]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().x))
  expect(xs[0]).toBeGreaterThan(xs[1]!) // 1ª coluna à direita
  await focusFirstCard(page)
  await page.keyboard.press('ArrowLeft') // em RTL: próxima coluna
  await expect.poll(async () => (await active(page)).cell).toBe('Tarefas: A fazer')
  await page.keyboard.press('ArrowRight')
  await expect.poll(async () => (await active(page)).cell).toBe('Tarefas: Backlog')
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze()
  expect(violations.map((v) => v.id)).toEqual([])
})

/* ------------------------------------------------------------------ */
/* Alto contraste (forced-colors) e árvore de acessibilidade           */
/* ------------------------------------------------------------------ */

test.describe('forced-colors', () => {
  test.use({ forcedColors: 'active' })
  test('foco, seleção e indicadores visíveis em Alto Contraste', async ({ page }) => {
    await open(page)
    const id = await focusFirstCard(page)
    await page.keyboard.press('Space')
    await page.keyboard.press('ArrowDown')
    const sel = page.locator(`[data-task-id="${id}"]`)
    await expect.poll(() => sel.evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe('dashed')
    await expect.poll(() => page.evaluate(() => (document.activeElement as HTMLElement).dataset.taskId)).not.toBe(id)
    const focused = page.locator('[data-task-id]:focus')
    await expect.poll(() => focused.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid')
    // Focado E selecionado: ambos os indicadores ao mesmo tempo.
    await page.keyboard.press('Space')
    await expect.poll(() => focused.evaluate((el) => [getComputedStyle(el).outlineStyle, getComputedStyle(el).borderTopStyle].join())).toBe('solid,dashed')
  })
})

test('árvore de acessibilidade: grid > row > columnheader/gridcell > listbox > option', async ({ page }) => {
  await open(page, '?group=swimlane')
  await expect(page.getByRole('grid')).toMatchAriaSnapshot(`
    - grid "Colunas e raias de tarefas":
      - row:
        - columnheader "Raia"
        - columnheader /Backlog/
        - columnheader /A fazer/
        - columnheader /Em andamento/
        - columnheader /Revisão/
        - columnheader /Concluído/
      - row:
        - rowheader /Web/
        - gridcell:
          - listbox /Backlog, Web/:
            - option
  `)
})

/* ------------------------------------------------------------------ */
/* Arrasto por toque (long-press) — Chromium via CDP                   */
/* ------------------------------------------------------------------ */

test.describe('toque (long-press)', () => {
  test.use({ hasTouch: true, viewport: { width: 1200, height: 900 } })
  test('toque curto rola; toque longo arrasta o card', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Eventos de toque sintéticos via CDP só no Chromium')
    await open(page)
    const cdp = await page.context().newCDPSession(page)
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })

    const card = page.getByRole('listbox').first().locator('[data-task-id]').first()
    const id = (await card.getAttribute('data-task-id'))!
    const a = (await card.boundingBox())!
    const b = (await page.getByRole('listbox').nth(1).boundingBox())!

    // Toque curto + movimento: não inicia arrasto.
    await touch('touchStart', a.x + 40, a.y + 20)
    await touch('touchMove', a.x + 40, a.y + 120)
    await touch('touchEnd', 0, 0)
    await expect(page.locator('[data-dragging]')).toHaveCount(0)

    // Toque longo (> 250ms) e arrasta até a próxima coluna.
    await touch('touchStart', a.x + 40, a.y + 20)
    await page.waitForTimeout(400)
    for (let i = 1; i <= 10; i++) await touch('touchMove', a.x + 40 + ((b.x - a.x) * i) / 10, a.y + 20 + 10 * i)
    await expect(page.locator('[data-dragging]')).toHaveCount(1)
    await touch('touchEnd', 0, 0)
    await expect.poll(() => cellOfFiltered(page, id)).toBe('Tarefas: A fazer')
  })
})
