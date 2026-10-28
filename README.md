# Taskboard Enterprise

Kanban / gestão de projetos em **React 19 + Base UI + Tailwind v4** (tokens shadcn/ui), com React Compiler.

```bash
npm install
npm run dev               # demo: 2.000 tarefas · ?cols=40 (virtualização horizontal) · ?dir=rtl
npm run storybook         # catálogo interativo (10 stories, addon-a11y)
npm test                  # unitários (vitest)
npm run test:e2e          # Playwright: Chromium, Firefox e WebKit + axe-core
npm run build:lib         # pacote ESM + .d.ts em dist-lib/
npm run registry:build    # registro shadcn em public/r/taskboard.json
```

## Instalação em outro projeto

**Via registro shadcn** (copia o código-fonte para o projeto):

```bash
npx shadcn@latest add https://SEU-HOST/r/taskboard.json
```

> O item inclui `ui/button` e `ui/badge` (variantes `size="icon-sm"`, `variant="warning"`); revise o diff se o seu projeto já os customizou.

**Via pacote** (`npm run build:lib`): dependências são *peer* (React 19, Base UI, dnd-kit, TanStack Virtual, nuqs…).

```css
@import "tailwindcss";
@import "taskboard/theme.css";                 /* token --warning */
@source "../node_modules/taskboard/dist-lib";  /* Tailwind gera as classes usadas pelo componente */
```

Em ambos os casos, envolva a aplicação com o `NuqsAdapter` do seu framework.

## API (compound components)

```tsx
<Taskboard
  tasks={tasks}                               // fonte de verdade vinda do servidor
  columns={columns}
  swimlanes={swimlanes}
  onTasksMove={async (move) => {}}            // obrigatório; rejeitar ⇒ rollback
  onTaskCreate={async (draft) => createdTask} // retornar a Task habilita desfazer/refazer da criação
  onTaskUpdate={async (id, patch) => {}}
  onTasksDelete={async (ids) => {}}
  onTasksRestore={async (tasks) => {}}        // torna a exclusão desfazível; sem ele há confirmação
  onColumnsReorder={async (ids) => {}}        // alça de arrasto, menu da coluna, Alt+←/→
  onMoveError={(err, move) => {}}
  onTaskOpen={(task) => {}}
  enforceWipLimits                            // bloqueia (em vez de só alertar) acima do wipLimit
  availableAssignees={people} availableLabels={labels}
  storageKey="sprint-42"                      // persiste colunas/raias recolhidas
  locale="pt-BR" messages={{}}                // ou "en-US"; `messages` sobrescreve qualquer texto
  dir="ltr"                                   // ou "rtl"
  columnVirtualizationThreshold={12}
  renderCard={(ctx) => …} renderColumnHeader={(ctx) => …} renderSwimlaneHeader={(ctx) => …}
>
  <TaskboardHeader>
    <TaskboardSearch />          {/* `#TSK-12` = busca exata por id */}
    <TaskboardFilters />
    <TaskboardGroupBySelect />
    <TaskboardSelectionBar />    {/* flutuante: Mover para…, Excluir */}
    <TaskboardUndoButton />
    <TaskboardRedoButton />
    <TaskboardShortcutsHelp />
  </TaskboardHeader>
  <TaskboardBody />              {/* ou compor TaskboardColumnHeaders / TaskboardSwimlane / TaskboardColumn */}
  <TaskboardTaskDialog />
</Taskboard>
```

Utilitários exportados: `applyMove`, `applyOptimistic`, `computeMove`, `invertMove`, `invertUpdate`,
`reorderColumns`, `needsRebalance`, `RANK_GAP`, `TaskboardConflictError`, `useTaskboard`, `ptBR`, `enUS`.

## Dados e consistência

### Atualização otimista, rollback e fila
Toda mutação é aplicada via `useOptimistic` dentro de uma transição. Se a Promise rejeitar, a transição termina sem que
`tasks` mude e o React descarta o estado otimista (rollback); um `role="alert"` explica o ocorrido e o foco volta ao card.
As chamadas são **serializadas**: o servidor recebe as mutações na ordem em que o usuário as fez.

### Desfazer / refazer
Cada ação gera `{ undo, redo }` (`TaskboardCommand`) no histórico (50 entradas): mover, criar, editar, excluir e
reordenar colunas. `Ctrl+Z` desfaz; `Ctrl+Shift+Z` / `Ctrl+Y` refaz. Ações que falham saem do histórico.

### Concorrência entre usuários
- **Versões:** se `Task.version` existir, `TaskMove.expectedVersions` envia as versões vistas pelo cliente
  (lidas no momento da execução — inclusive em undo/redo). O servidor deve rejeitar com
  `throw new TaskboardConflictError(ids)` quando divergirem; a UI reverte e mostra uma mensagem específica.
- **Tempo real:** entregue atualizações remotas por `setTasks(...)` **fora** de `startTransition` (ex.: no handler do
  WebSocket). Assim o `useOptimistic` faz *rebase* imediato das ações pendentes sobre o novo estado; dentro de uma
  transição a atualização ficaria entrelaçada à ação pendente e só apareceria quando ela terminasse.
- Tarefas removidas remotamente saem da seleção automaticamente; o diálogo de uma tarefa removida fecha.

### Ordenação fracionária
Ranks são números entre os vizinhos. Quando a precisão de ponto flutuante se esgota (`needsRebalance`), a célula
inteira é renumerada com espaçamento `RANK_GAP` — os vizinhos renumerados vêm em `move.patches`.

## Desempenho
- Cards virtualizados por célula (`@tanstack/react-virtual`); itens arrastados permanecem montados durante o auto-scroll.
- Colunas virtualizadas horizontalmente acima de `columnVirtualizationThreshold`; a navegação por teclado rola até
  colunas fora da janela.
- React Compiler (sem `useMemo`/`useCallback` manuais). Exceções com `'use no memo'`: `TaskboardBody` e `TaskboardColumn`,
  porque `useVirtualizer` é incompatível com memoização automática.
- Demo com *code splitting* por vendor (react, base-ui, dnd/virtual).

## Acessibilidade (WCAG 2.2 AA)
- Padrão ARIA grid completo: `grid > row > columnheader/rowheader/gridcell > listbox > option`, `aria-rowindex/colindex`,
  `aria-posinset/setsize` sob virtualização. Um único ponto de Tab; setas alcançam cards, cabeçalhos e o canto;
  controles dos cabeçalhos entram com Enter e saem com Esc.
- **2.5.7 Dragging Movements:** alternativas sem arrasto para cards ("Mover para…", Alt+setas) e colunas (menu, Alt+←/→).
- **2.5.8 Target Size:** ≥ 24×24 px. **2.4.11 Focus Not Obscured:** rola antes de focar; a barra de seleção é flutuante.
- **Alto Contraste (`forced-colors`):** foco por outline sólido, seleção por borda tracejada (coexistem), indicadores de
  soltura em `Highlight`.
- **RTL:** propriedades lógicas, ←/→ seguem a ordem visual, `DirectionProvider` do Base UI.
- Prioridade, atraso e WIP excedido nunca são indicados apenas por cor. `prefers-reduced-motion` respeitado.
- Toque: `MouseSensor` (6 px) + `TouchSensor` (long-press 250 ms) com `touch-action: manipulation` — rolagem nativa preservada.

## Atalhos de teclado

| Teclas | Ação |
|---|---|
| `↑` `↓` | Tarefa anterior/próxima (atravessa raias; do topo vai ao cabeçalho da coluna) |
| `←` `→` | Coluna anterior/próxima (da 1ª coluna vai ao cabeçalho da raia; espelhado em RTL) |
| `Home` / `End` | Primeira/última da célula (em cabeçalhos: primeira/última coluna) |
| `Ctrl` + `Home` / `End` | Primeira/última do quadro |
| `PgUp` / `PgDn` | Salta 10 tarefas |
| `Espaço` | Alterna seleção |
| `Shift` + `↑`/`↓` | Estende seleção |
| `Ctrl`/`⌘` + `A` | Seleciona todas da célula |
| `Esc` | Limpa seleção · volta dos controles ao cabeçalho |
| `Alt` + `←`/`→` | Move seleção para a coluna adjacente · no cabeçalho: reordena a coluna |
| `Alt` + `↑`/`↓` | Reordena na coluna |
| `Alt` + `Shift` + `↑`/`↓` | Move para a raia adjacente |
| `Enter` | Abre detalhes · cabeçalho de coluna: entra nos controles · de raia: recolhe/expande |
| `N` | Nova tarefa na coluna focada |
| `Delete` / `Backspace` | Exclui a seleção (ou a tarefa focada) |
| `Ctrl`/`⌘` + `Z` | Desfaz |
| `Ctrl`/`⌘` + `Shift` + `Z` · `Ctrl` + `Y` | Refaz |
| `/` | Foca o filtro |
| `?` | Ajuda de atalhos |

Mouse: clique seleciona, `Ctrl`/`⌘`+clique alterna, `Shift`+clique seleciona intervalo, duplo clique abre.

## Qualidade e CI

`.github/workflows/ci.yml`: lint, tipos, unitários, build da demo, build da biblioteca e do registro shadcn →
E2E em matriz (Chromium, Firefox, WebKit) → build do Storybook + axe em todas as stories.

Cobertura E2E: teclado (grid completo), DnD em lote com indicador, toque com long-press (Chromium/CDP), rollback,
conflito de versão, rebase de mudanças remotas, undo/redo de todas as ações, exclusão com e sem confirmação, WIP,
colunas (arrasto/teclado/menu), virtualização 2D, filtros/URL, i18n, RTL, `forced-colors`, snapshot da árvore de
acessibilidade e axe (claro/escuro, com/sem raias, diálogos, RTL).

### Limites conhecidos
- **Leitores de tela reais** (NVDA, JAWS, VoiceOver, TalkBack) não podem ser executados neste ambiente; a estrutura é
  validada por axe e por snapshot da árvore de acessibilidade, mas recomenda-se uma rodada manual.
- **Toque em dispositivos reais / iOS Safari:** o teste de long-press usa eventos sintéticos via CDP (só Chromium).
- **Especificação oficial:** tipos e matriz de atalhos foram definidos sem o documento; revisar quando disponível.
