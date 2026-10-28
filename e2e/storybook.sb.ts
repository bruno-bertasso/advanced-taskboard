import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'

const ids = [
  'padrao',
  'raias',
  'milhares-de-tarefas',
  'muitas-colunas',
  'com-falhas',
  'limite-wip',
  'somente-leitura',
  'rtl',
  'english',
  'card-customizado',
]

/** O addon-a11y do Storybook também executa o axe no iframe; aguarda e tenta novamente. */
async function axe(page: Page) {
  for (let i = 0; ; i++) {
    try {
      return await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
    } catch (e) {
      if (i > 10 || !String(e).includes('already running')) throw e
      await page.waitForTimeout(500)
    }
  }
}

for (const id of ids) {
  test(`story ${id}: renderiza sem erros e sem violações axe`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(`http://localhost:6007/iframe.html?id=taskboard--${id}&viewMode=story`)
    await page.locator('[data-task-id]').first().waitFor()
    const { violations } = await axe(page)
    expect(violations.map((v) => `${v.id} (${v.nodes.length})`)).toEqual([])
    expect(errors).toEqual([])
  })
}
