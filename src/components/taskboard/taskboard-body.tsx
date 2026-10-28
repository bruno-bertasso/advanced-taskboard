import { Menu } from '@base-ui/react/menu'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual'
import { ChevronDown, ChevronRight, ChevronsLeftRight, GripVertical, MoreHorizontal, Plus } from 'lucide-react'
import { createContext, use, useEffect, useRef } from 'react'
import type * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useTaskboard } from './context'
import { TaskboardCard } from './taskboard-card'
import type { CellDropData, ColumnDropData, TaskboardColumnDef, TaskboardLane } from './types'
import { DROP_BAR, FOCUS_RING } from './styles'
import { cellKey } from './utils'

/**
 * Controles dentro de cabeçalhos ficam fora da ordem de Tab (padrão ARIA grid: um único
 * ponto de Tab). Acessa-se com Enter no cabeçalho; ←/→ alternam entre eles; Esc retorna.
 */
const HEADER_CONTROL_TABINDEX = -1

const headerFocusClass = cn(FOCUS_RING, 'rounded-md')

/* ------------------------------------------------------------------ */
/* Janela de colunas (virtualização horizontal)                        */
/* ------------------------------------------------------------------ */

const COL_PX = 272 // 17rem
const COL_COLLAPSED_PX = 44 // 2.75rem
const LANE_PX = 176 // 11rem
const GAP_PX = 8
const ROW_PAD_PX = 8 // px-2

interface ColumnWindow {
  /** Colunas renderizadas, com o índice absoluto. */
  readonly items: readonly { readonly column: TaskboardColumnDef; readonly index: number }[]
  readonly template: string
  /** Espaçadores (px) antes/depois das colunas renderizadas; 0 = ausente. */
  readonly lead: number
  readonly trail: number
}

const ColumnWindowContext = createContext<ColumnWindow | null>(null)

/** Colunas visíveis + grid-template; sem virtualização retorna todas. */
function useColumnWindow(): ColumnWindow {
  const win = use(ColumnWindowContext)
  const { columns, collapsedColumns, groupBy } = useTaskboard()
  if (win) return win
  const cols = columns.map((c) => (collapsedColumns.has(c.id) ? '2.75rem' : 'minmax(16rem, 1fr)'))
  return {
    items: columns.map((column, index) => ({ column, index })),
    template: (groupBy !== 'none' ? ['11rem', ...cols] : cols).join(' '),
    lead: 0,
    trail: 0,
  }
}

function Spacer({ width }: { width: number }) {
  return width > 0 ? <div aria-hidden data-column-spacer="" style={{ width }} /> : null
}

/* ------------------------------------------------------------------ */
/* Body (role=grid)                                                    */
/* ------------------------------------------------------------------ */

export function TaskboardBody({ className, children, ...props }: React.ComponentProps<'div'>) {
  // @tanstack/react-virtual retorna instância mutável: optar por não memoizar este componente.
  'use no memo'
  const ctx = useTaskboard()
  const { lanes, columns, groupBy, boardId, t, collapsedColumns } = ctx
  const hasLanes = groupBy !== 'none'
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const virtual = columns.length > ctx.columnVirtualizationThreshold
  const widthOf = (i: number) => (collapsedColumns.has(columns[i]?.id ?? '') ? COL_COLLAPSED_PX : COL_PX)
  const paddingStart = ROW_PAD_PX + (hasLanes ? LANE_PX + GAP_PX : 0)

  const v = useVirtualizer({
    horizontal: true,
    enabled: virtual,
    count: columns.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: widthOf,
    getItemKey: (i) => columns[i]?.id ?? i,
    gap: GAP_PX,
    paddingStart,
    paddingEnd: ROW_PAD_PX,
    overscan: 2,
    isRtl: ctx.dir === 'rtl',
  })

  // Larguras mudam ao recolher/expandir colunas.
  const collapsedSig = [...collapsedColumns].sort().join()
  useEffect(() => {
    if (virtual) v.measure()
  }, [collapsedSig, virtual, v])

  const { registerColumnScroller } = ctx
  useEffect(() => {
    registerColumnScroller(virtual ? (i) => v.scrollToIndex(i, { align: 'auto' }) : null)
    return () => registerColumnScroller(null)
  }, [registerColumnScroller, virtual, v])

  let win: ColumnWindow | null = null
  if (virtual) {
    const vItems = v.getVirtualItems()
    const first = vItems[0]
    const last = vItems[vItems.length - 1]
    const lead = first ? Math.max(0, first.start - paddingStart - GAP_PX) : 0
    const trail = last ? Math.max(0, v.getTotalSize() - ROW_PAD_PX - last.end - GAP_PX) : 0
    const items = vItems.flatMap((it) => {
      const column = columns[it.index]
      return column ? [{ column, index: it.index }] : []
    })
    const tracks = [
      ...(hasLanes ? [`${LANE_PX}px`] : []),
      ...(lead > 0 ? [`${lead}px`] : []),
      ...items.map((it) => `${widthOf(it.index)}px`),
      ...(trail > 0 ? [`${trail}px`] : []),
    ]
    win = { items, template: tracks.join(' '), lead, trail }
  }

  return (
    <ColumnWindowContext value={win}>
    <div
      ref={scrollRef}
      data-virtual-columns={virtual || undefined}
      role="grid"
      aria-label={t.gridLabel}
      aria-describedby={`${boardId}-instructions`}
      aria-rowcount={lanes.length + 1}
      aria-colcount={columns.length + (hasLanes ? 1 : 0)}
      aria-multiselectable
      className={cn('relative max-h-[calc(100dvh-9rem)] min-h-0 overflow-auto rounded-xl border bg-muted/30', className)}
      {...props}
    >
      {children ?? (
        <>
          <TaskboardColumnHeaders />
          {lanes.map((lane, i) => (
            <TaskboardSwimlane key={lane.id} lane={lane} rowIndex={i + 2} />
          ))}
        </>
      )}
    </div>
    </ColumnWindowContext>
  )
}

/* ------------------------------------------------------------------ */
/* Cabeçalhos de coluna                                                */
/* ------------------------------------------------------------------ */

export function TaskboardColumnHeaders() {
  const { groupBy, t } = useTaskboard()
  const win = useColumnWindow()
  const template = win.template
  const hasLanes = groupBy !== 'none'
  return (
    <div
      role="row"
      aria-rowindex={1}
      className="sticky top-0 z-20 grid min-w-max gap-2 border-b bg-background/95 px-2 py-2 backdrop-blur"
      style={{ gridTemplateColumns: template }}
    >
      {hasLanes && (
        <div
          role="columnheader"
          aria-colindex={1}
          tabIndex={-1}
          data-corner-header=""
          className={cn('sticky start-0 z-10 flex items-center bg-background/95 px-2 text-xs font-medium text-muted-foreground', headerFocusClass)}
        >
          {t.laneCorner[groupBy]}
        </div>
      )}
      <Spacer width={win.lead} />
      {win.items.map(({ column, index }) => (
        <TaskboardColumnHeader key={column.id} column={column} colIndex={index + 1 + (hasLanes ? 1 : 0)} />
      ))}
      <Spacer width={win.trail} />
    </div>
  )
}

export function TaskboardColumnHeader({ column, colIndex }: { column: TaskboardColumnDef; colIndex?: number }) {
  const ctx = useTaskboard()
  const { t } = ctx
  const taskCount = ctx.columnTotals.get(column.id) ?? 0
  const isOverWipLimit = column.wipLimit != null && taskCount > column.wipLimit
  const isCollapsed = ctx.collapsedColumns.has(column.id)
  const toggleCollapsed = () => ctx.toggleColumn(column.id)

  // Arrasto de coluna por ponteiro (alternativas: menu da coluna e Alt + ←/→ — WCAG 2.5.7).
  const {
    listeners: dragListeners,
    setNodeRef: setDragRef,
    setActivatorNodeRef,
  } = useDraggable({
    id: `column:${column.id}`,
    data: { type: 'column', columnId: column.id },
    disabled: !ctx.canReorderColumns,
  })
  const drop = useDroppable({
    id: `coldrop:${column.id}`,
    data: { type: 'column', columnId: column.id } satisfies ColumnDropData,
    disabled: !ctx.canReorderColumns,
  })
  const indicator = ctx.dropIndicator?.kind === 'column' && ctx.dropIndicator.columnId === column.id ? ctx.dropIndicator.edge : null

  return (
    <div
      ref={(node) => {
        drop.setNodeRef(node)
        setDragRef(node)
      }}
      role="columnheader"
      aria-colindex={colIndex}
      tabIndex={-1}
      data-col-header={column.id}
      data-dragging={ctx.draggingColumnId === column.id || undefined}
      className={cn('relative min-w-0 data-[dragging]:opacity-40', headerFocusClass)}
    >
      {indicator && (
        <span
          aria-hidden
          data-column-drop-indicator={indicator}
          className={cn(DROP_BAR, '-inset-y-1 w-0.5', indicator === 'before' ? '-start-[5px]' : '-end-[5px]')}
        />
      )}
      {ctx.renderColumnHeader ? (
        ctx.renderColumnHeader({ column, taskCount, isOverWipLimit, isCollapsed, toggleCollapsed })
      ) : isCollapsed ? (
        <Button
          variant="ghost"
          size="icon"
          tabIndex={HEADER_CONTROL_TABINDEX}
          onClick={toggleCollapsed}
          aria-expanded={false}
          aria-label={t.expandColumn(column.title, taskCount)}
          title={column.title}
        >
          <ChevronsLeftRight />
        </Button>
      ) : (
        <div className="flex items-center gap-2 px-1">
          {ctx.canReorderColumns && (
            <button
              ref={setActivatorNodeRef}
              type="button"
              {...dragListeners}
              tabIndex={HEADER_CONTROL_TABINDEX}
              aria-label={ctx.t.dragColumn(column.title)}
              aria-describedby={`${ctx.boardId}-instructions`}
              className={cn('-ms-1 grid size-6 shrink-0 cursor-grab touch-manipulation place-items-center rounded text-muted-foreground hover:bg-accent active:cursor-grabbing', FOCUS_RING)}
            >
              <GripVertical className="size-4" aria-hidden />
            </button>
          )}
          {column.color && <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: column.color }} />}
          <h2 className="truncate text-sm font-semibold">{column.title}</h2>
          <Badge
            variant={isOverWipLimit ? 'destructive' : 'secondary'}
            aria-label={column.wipLimit != null ? t.wipCount(taskCount, column.wipLimit, isOverWipLimit) : t.tasks(taskCount)}
          >
            {taskCount}
            {column.wipLimit != null && `/${column.wipLimit}`}
          </Badge>
          <span className="ms-auto flex items-center">
            {ctx.canCreate && (
              <Button
                variant="ghost"
                size="icon-sm"
                tabIndex={HEADER_CONTROL_TABINDEX}
                aria-label={t.newTaskIn(column.title)}
                aria-keyshortcuts="N"
                onClick={() => ctx.openCreate(column.id)}
              >
                <Plus />
              </Button>
            )}
            <TaskboardColumnMenu column={column} onCollapse={toggleCollapsed} />
          </span>
        </div>
      )}
    </div>
  )
}

const menuItemClass =
  'flex min-h-8 cursor-default items-center rounded-sm px-2 text-sm outline-none select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:opacity-50 forced-colors:data-[highlighted]:outline-2 forced-colors:data-[highlighted]:outline-solid forced-colors:data-[highlighted]:outline-[Highlight]'

function TaskboardColumnMenu({ column, onCollapse }: { column: TaskboardColumnDef; onCollapse: () => void }) {
  const ctx = useTaskboard()
  const { t } = ctx
  const index = ctx.columns.findIndex((c) => c.id === column.id)
  const columnTaskIds = ctx.lanes.flatMap((l) => (ctx.cells.get(cellKey(column.id, l.id)) ?? []).map((x) => x.id))
  return (
    <Menu.Root>
      <Menu.Trigger
        render={<Button variant="ghost" size="icon-sm" tabIndex={HEADER_CONTROL_TABINDEX} aria-label={t.columnActions(column.title)} />}
      >
        <MoreHorizontal />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={4} align="end" className="z-50">
          <Menu.Popup className="min-w-52 rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
            {ctx.canCreate && (
              <Menu.Item className={menuItemClass} onClick={() => ctx.openCreate(column.id)}>
                {t.newTask}
              </Menu.Item>
            )}
            <Menu.Item className={menuItemClass} onClick={() => ctx.selectMany(columnTaskIds)}>
              {t.selectAll(columnTaskIds.length)}
            </Menu.Item>
            <Menu.Item className={menuItemClass} onClick={onCollapse}>
              {t.collapseColumn}
            </Menu.Item>
            {ctx.canReorderColumns && (
              <>
                <Menu.Separator className="my-1 h-px bg-border" />
                <Menu.Item className={menuItemClass} disabled={index <= 0} onClick={() => ctx.moveColumn(column.id, -1)}>
                  {t.moveColumnLeft}
                </Menu.Item>
                <Menu.Item
                  className={menuItemClass}
                  disabled={index >= ctx.columns.length - 1}
                  onClick={() => ctx.moveColumn(column.id, 1)}
                >
                  {t.moveColumnRight}
                </Menu.Item>
              </>
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}

/* ------------------------------------------------------------------ */
/* Swimlane (role=row)                                                 */
/* ------------------------------------------------------------------ */

export function TaskboardSwimlane({ lane, rowIndex }: { lane: TaskboardLane; rowIndex: number }) {
  const ctx = useTaskboard()
  const win = useColumnWindow()
  const template = win.template
  const hasLanes = ctx.groupBy !== 'none'
  const isCollapsed = ctx.collapsedLanes.has(lane.id)
  const toggleCollapsed = () => ctx.toggleLane(lane.id)
  const taskCount = ctx.columns.reduce((n, c) => n + (ctx.cells.get(cellKey(c.id, lane.id))?.length ?? 0), 0)

  return (
    <div
      role="row"
      aria-rowindex={rowIndex}
      data-collapsed={isCollapsed || undefined}
      className={cn('grid min-w-max gap-2 px-2 py-2', hasLanes && 'border-b last:border-b-0')}
      style={{ gridTemplateColumns: template }}
    >
      {hasLanes && (
        <div
          role="rowheader"
          aria-colindex={1}
          aria-expanded={!isCollapsed}
          tabIndex={-1}
          data-lane-header={lane.id}
          className={cn('sticky start-0 z-10 self-start rounded-md bg-muted/80 backdrop-blur-sm', headerFocusClass)}
        >
          {ctx.renderSwimlaneHeader ? (
            ctx.renderSwimlaneHeader({ lane, taskCount, isCollapsed, toggleCollapsed })
          ) : (
            <button
              type="button"
              tabIndex={HEADER_CONTROL_TABINDEX}
              onClick={toggleCollapsed}
              aria-expanded={!isCollapsed}
              className={cn('flex min-h-8 w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-start text-sm font-medium hover:bg-accent', FOCUS_RING)}
            >
              {isCollapsed ? <ChevronRight className="size-4 rtl:rotate-180" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}
              <span className="flex-1 truncate">{lane.title}</span>
              <Badge variant="outline" aria-label={ctx.t.tasks(taskCount)}>
                {taskCount}
              </Badge>
            </button>
          )}
        </div>
      )}
      <Spacer width={win.lead} />
      {win.items.map(({ column, index }) => (
        <TaskboardColumn
          key={column.id}
          column={column}
          lane={lane}
          laneCollapsed={isCollapsed}
          colIndex={index + 1 + (hasLanes ? 1 : 0)}
        />
      ))}
      <Spacer width={win.trail} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Coluna / célula virtualizada (role=gridcell > listbox)              */
/* ------------------------------------------------------------------ */

export function TaskboardColumn({
  column,
  lane,
  laneCollapsed = false,
  colIndex,
}: {
  column: TaskboardColumnDef
  lane: TaskboardLane
  laneCollapsed?: boolean
  colIndex?: number
}) {
  // @tanstack/react-virtual retorna instância mutável: optar por não memoizar este componente.
  'use no memo'
  const ctx = useTaskboard()
  const { t } = ctx
  const key = cellKey(column.id, lane.id)
  const tasks = ctx.cells.get(key) ?? []
  const colCollapsed = ctx.collapsedColumns.has(column.id)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const hasLanes = ctx.groupBy !== 'none'

  const { setNodeRef, isOver } = useDroppable({
    id: `cell:${key}`,
    data: { type: 'cell', columnId: column.id, laneId: lane.id } satisfies CellDropData,
    disabled: colCollapsed || laneCollapsed,
  })

  const virtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ctx.estimateCardSize,
    getItemKey: (i) => tasks[i]?.id ?? i,
    // Mantém montados os cards sendo arrastados, mesmo fora da janela visível
    // (o dnd-kit perde o nó ativo se ele desmontar durante o auto-scroll).
    rangeExtractor: (range) => {
      const base = defaultRangeExtractor(range)
      if (!ctx.draggingIds.size) return base
      const extra = tasks.flatMap((x, i) => (ctx.draggingIds.has(x.id) && !base.includes(i) ? [i] : []))
      return extra.length ? [...base, ...extra].sort((a, b) => a - b) : base
    },
    overscan: 6,
    gap: 8,
    paddingStart: 6,
    paddingEnd: 6,
  })

  const { registerCell } = ctx
  useEffect(() => {
    registerCell(key, { scrollToIndex: (i) => virtualizer.scrollToIndex(i, { align: 'auto' }) })
    return () => registerCell(key, null)
  }, [key, registerCell, virtualizer])

  const label = `${column.title}${hasLanes ? `, ${lane.title}` : ''}`

  if (colCollapsed || laneCollapsed) {
    return (
      <div role="gridcell" aria-colindex={colIndex} aria-label={t.collapsedCell(label, tasks.length)} className="rounded-lg">
        {colCollapsed && !laneCollapsed && (
          <span aria-hidden className="block pt-2 text-center text-xs text-muted-foreground [writing-mode:vertical-rl]">
            {column.title} · {tasks.length}
          </span>
        )}
      </div>
    )
  }

  const incoming = [...ctx.draggingIds].filter((id) => ctx.taskById.get(id)?.columnId !== column.id).length
  const wouldExceed =
    ctx.enforceWipLimits &&
    column.wipLimit != null &&
    incoming > 0 &&
    (ctx.columnTotals.get(column.id) ?? 0) + incoming > column.wipLimit
  const isCellTarget = ctx.dropIndicator?.kind === 'cell' && ctx.dropIndicator.key === key

  const setRefs = (node: HTMLDivElement | null) => {
    scrollRef.current = node
    setNodeRef(node)
  }

  return (
    <div role="gridcell" aria-colindex={colIndex} className="relative min-w-0">
      <div
        ref={setRefs}
        role="listbox"
        aria-label={t.tasksIn(label)}
        aria-multiselectable
        aria-orientation="vertical"
        data-drop-blocked={(isOver && wouldExceed) || undefined}
        className={cn(
          'overflow-y-auto overscroll-contain rounded-lg px-1 transition-colors [scrollbar-width:thin]',
          hasLanes ? 'max-h-[26rem] min-h-20' : 'h-[calc(100dvh-14rem)] min-h-64',
          isOver && !wouldExceed && 'bg-accent/60 ring-2 ring-ring/40 ring-inset',
          isOver && wouldExceed && 'cursor-not-allowed bg-destructive/10 ring-2 ring-destructive/50 ring-inset',
        )}
      >
        <div role="presentation" className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const task = tasks[item.index]
            if (!task) return null
            return (
              <TaskboardCard
                key={item.key}
                ref={virtualizer.measureElement}
                data-index={item.index}
                task={task}
                laneId={lane.id}
                posInSet={item.index + 1}
                setSize={tasks.length}
                className="absolute inset-x-0"
                style={{ transform: `translateY(${item.start}px)` }}
              />
            )
          })}
          {isCellTarget && !wouldExceed && (
            <span
              aria-hidden
              data-drop-indicator="end"
              className={cn(DROP_BAR, 'inset-x-1 h-0.5')}
              style={{ top: Math.max(virtualizer.getTotalSize() - 4, 2) }}
            />
          )}
        </div>
      </div>
      {tasks.length === 0 && (
        <p className="pointer-events-none absolute inset-x-0 top-6 text-center text-xs text-muted-foreground">
          {ctx.query || ctx.assigneeFilter.length || ctx.labelFilter.length ? t.emptyFiltered : t.emptyCell}
        </p>
      )}
    </div>
  )
}
