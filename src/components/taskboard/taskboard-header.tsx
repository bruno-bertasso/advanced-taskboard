import { AlertDialog } from '@base-ui/react/alert-dialog'
import { Dialog } from '@base-ui/react/dialog'
import { Menu } from '@base-ui/react/menu'
import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'
import { Check, Filter, Keyboard, MoveRight, Redo2, Search, Trash2, Undo2, X } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import type * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useTaskboard } from './context'
import { TASKBOARD_SHORTCUTS } from './shortcuts'
import type { Task, TaskboardGroupBy, TaskPriority, TaskUpdate } from './types'
import { FOCUS_RING } from './styles'
import { NO_LANE, PRIORITY_ORDER } from './utils'

export function TaskboardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-wrap items-center gap-2', className)} {...props} />
}

/* ------------------------------------------------------------------ */
/* Busca                                                               */
/* ------------------------------------------------------------------ */

export function TaskboardSearch({ className }: { className?: string }) {
  const { query, setQuery, boardId, t } = useTaskboard()
  return (
    <div className={cn('relative w-full max-w-xs', className)}>
      <label htmlFor={`${boardId}-search`} className="sr-only">
        {t.searchLabel}
      </label>
      <Search aria-hidden className="pointer-events-none absolute top-1/2 start-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        id={`${boardId}-search`}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && query) {
            e.stopPropagation()
            setQuery('')
          }
        }}
        placeholder={t.searchPlaceholder}
        aria-keyshortcuts="/"
        className={`h-9 w-full rounded-md border border-input bg-background ps-8 pe-3 text-sm placeholder:text-muted-foreground ${FOCUS_RING}`}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Agrupamento                                                         */
/* ------------------------------------------------------------------ */

const GROUP_VALUES: readonly TaskboardGroupBy[] = ['none', 'swimlane', 'assignee', 'priority']

export function TaskboardGroupBySelect() {
  const { groupBy, setGroupBy, t } = useTaskboard()
  const labelId = useId()
  return (
    <div className="flex items-center gap-2">
      <span id={labelId} className="text-xs text-muted-foreground">
        {t.groupByLabel}
      </span>
      <ToggleGroup
        aria-labelledby={labelId}
        value={[groupBy]}
        onValueChange={(v) => {
          const next = v[0] as TaskboardGroupBy | undefined
          if (next) setGroupBy(next)
        }}
        className="inline-flex rounded-md border bg-background p-0.5"
      >
        {GROUP_VALUES.map((g) => (
          <Toggle
            key={g}
            value={g}
            className={`h-7 rounded-sm px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground data-[pressed]:bg-secondary data-[pressed]:text-foreground forced-colors:data-[pressed]:outline-1 forced-colors:data-[pressed]:outline-solid forced-colors:data-[pressed]:outline-[Highlight] ${FOCUS_RING}`}
          >
            {t.groupBy[g]}
          </Toggle>
        ))}
      </ToggleGroup>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Filtros (responsável / etiqueta) — persistidos na URL               */
/* ------------------------------------------------------------------ */

const menuItemClass =
  'flex min-h-8 cursor-default items-center gap-2 rounded-sm px-2 text-sm outline-none select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:opacity-50 forced-colors:data-[highlighted]:outline-2 forced-colors:data-[highlighted]:outline-solid forced-colors:data-[highlighted]:outline-[Highlight]'
const menuLabelClass = 'px-2 pt-1.5 pb-1 text-xs font-medium text-muted-foreground'
const menuPopupClass =
  'max-h-[60dvh] min-w-52 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md'

function toggle(list: readonly string[], id: string, on: boolean) {
  return on ? [...new Set([...list, id])] : list.filter((x) => x !== id)
}

export function TaskboardFilters() {
  const ctx = useTaskboard()
  const { t } = ctx
  const count = ctx.assigneeFilter.length + ctx.labelFilter.length
  const assignees = [...ctx.availableAssignees, { id: NO_LANE, name: t.laneNoAssignee }]
  return (
    <div className="flex items-center gap-1">
      <Menu.Root>
        <Menu.Trigger
          render={<Button variant="outline" size="sm" aria-label={count ? `${t.filters}, ${t.activeFilters(count)}` : t.filters} />}
        >
          <Filter /> {t.filters}
          {count > 0 && <Badge variant="default">{count}</Badge>}
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner sideOffset={4} align="start" className="z-50">
            <Menu.Popup className={menuPopupClass}>
              <Menu.Group>
                <Menu.GroupLabel className={menuLabelClass}>{t.filterAssignees}</Menu.GroupLabel>
                {assignees.map((a) => (
                  <Menu.CheckboxItem
                    key={a.id}
                    className={menuItemClass}
                    checked={ctx.assigneeFilter.includes(a.id)}
                    onCheckedChange={(on) => ctx.setAssigneeFilter(toggle(ctx.assigneeFilter, a.id, on))}
                    closeOnClick={false}
                  >
                    <span className="grid size-4 place-items-center rounded-sm border">
                      <Menu.CheckboxItemIndicator>
                        <Check className="size-3" />
                      </Menu.CheckboxItemIndicator>
                    </span>
                    {a.name}
                  </Menu.CheckboxItem>
                ))}
              </Menu.Group>
              {ctx.availableLabels.length > 0 && (
                <>
                  <Menu.Separator className="my-1 h-px bg-border" />
                  <Menu.Group>
                    <Menu.GroupLabel className={menuLabelClass}>{t.filterLabels}</Menu.GroupLabel>
                    {ctx.availableLabels.map((l) => (
                      <Menu.CheckboxItem
                        key={l.id}
                        className={menuItemClass}
                        checked={ctx.labelFilter.includes(l.id)}
                        onCheckedChange={(on) => ctx.setLabelFilter(toggle(ctx.labelFilter, l.id, on))}
                        closeOnClick={false}
                      >
                        <span className="grid size-4 place-items-center rounded-sm border">
                          <Menu.CheckboxItemIndicator>
                            <Check className="size-3" />
                          </Menu.CheckboxItemIndicator>
                        </span>
                        {l.color && <span aria-hidden className="size-2 rounded-full" style={{ background: l.color }} />}
                        {l.name}
                      </Menu.CheckboxItem>
                    ))}
                  </Menu.Group>
                </>
              )}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      {(count > 0 || ctx.query) && (
        <Button variant="ghost" size="sm" onClick={ctx.clearFilters}>
          <X /> {t.clearFilters}
        </Button>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Seleção em lote + "Mover para" (WCAG 2.5.7)                         */
/* ------------------------------------------------------------------ */

export function TaskboardSelectionBar() {
  const { selectedIds, clearSelection, columns, lanes, groupBy, moveSelection, t, canDelete, requestDelete } = useTaskboard()
  if (!selectedIds.size) return null
  return (
    <div
      role="group"
      aria-label={t.selectionActions}
      // Flutuante: aparecer/desaparecer não desloca o layout do quadro.
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-lg border bg-popover py-1 pe-1 ps-3 text-sm text-popover-foreground shadow-lg"
    >
      <span aria-live="polite">{t.selectedCount(selectedIds.size)}</span>
      <Menu.Root>
        <Menu.Trigger render={<Button size="sm" variant="ghost" />}>
          <MoveRight /> {t.moveTo}
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner sideOffset={4} align="start" className="z-50">
            <Menu.Popup className={menuPopupClass}>
              <Menu.Group>
                <Menu.GroupLabel className={menuLabelClass}>{t.column}</Menu.GroupLabel>
                {columns.map((c) => (
                  <Menu.Item key={c.id} className={menuItemClass} onClick={() => moveSelection({ columnId: c.id })}>
                    {c.title}
                  </Menu.Item>
                ))}
              </Menu.Group>
              {groupBy !== 'none' && (
                <>
                  <Menu.Separator className="my-1 h-px bg-border" />
                  <Menu.Group>
                    <Menu.GroupLabel className={menuLabelClass}>{t.lane}</Menu.GroupLabel>
                    {lanes.map((l) => (
                      <Menu.Item key={l.id} className={menuItemClass} onClick={() => moveSelection({ laneId: l.id })}>
                        {l.title}
                      </Menu.Item>
                    ))}
                  </Menu.Group>
                </>
              )}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      {canDelete && (
        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => requestDelete([...selectedIds])} aria-keyshortcuts="Delete">
          <Trash2 /> {t.deleteAction}
        </Button>
      )}
      <Button size="icon-sm" variant="ghost" onClick={clearSelection} aria-label={t.clearSelection}>
        <X />
      </Button>
    </div>
  )
}

export function TaskboardUndoButton() {
  const { canUndo, undo, t } = useTaskboard()
  return (
    <Button variant="outline" size="sm" onClick={undo} disabled={!canUndo} aria-keyshortcuts="Control+Z Meta+Z">
      <Undo2 /> {t.undo}
    </Button>
  )
}

export function TaskboardRedoButton() {
  const { canRedo, redo, t } = useTaskboard()
  return (
    <Button variant="outline" size="sm" onClick={redo} disabled={!canRedo} aria-keyshortcuts="Control+Shift+Z Control+Y Meta+Shift+Z">
      <Redo2 /> {t.redo}
    </Button>
  )
}

/** Confirmação de exclusão — usada apenas quando não há `onTasksRestore` (exclusão irreversível). */
export function TaskboardDeleteConfirm() {
  const { confirmDeleteIds, confirmDelete, cancelDelete, t } = useTaskboard()
  return (
    <AlertDialog.Root open={confirmDeleteIds.length > 0} onOpenChange={(o) => !o && cancelDelete()}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className={backdropClass} />
        <AlertDialog.Popup className={cn(popupClass, 'w-[min(28rem,calc(100vw-2rem))]')}>
          <AlertDialog.Title className="text-lg font-semibold">{t.confirmDeleteTitle(confirmDeleteIds.length)}</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">{t.confirmDeleteDescription}</AlertDialog.Description>
          <div className="mt-6 flex justify-end gap-2">
            <AlertDialog.Close render={<Button variant="outline" />}>{t.cancel}</AlertDialog.Close>
            <Button variant="destructive" onClick={confirmDelete}>
              <Trash2 /> {t.deleteAction}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}

/* ------------------------------------------------------------------ */
/* Ajuda de atalhos                                                    */
/* ------------------------------------------------------------------ */

const popupClass =
  'fixed top-1/2 left-1/2 z-50 w-[min(36rem,calc(100vw-2rem))] max-h-[85dvh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border bg-popover p-6 text-popover-foreground shadow-xl outline-none transition-all data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0'
const backdropClass =
  'fixed inset-0 z-50 bg-black/40 transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0'

export function TaskboardShortcutsHelp() {
  const { helpOpen, setHelpOpen, t, locale } = useTaskboard()
  const shortcuts = TASKBOARD_SHORTCUTS[locale]
  const groups = [...new Set(shortcuts.map((s) => s.group))]
  return (
    <Dialog.Root open={helpOpen} onOpenChange={setHelpOpen}>
      <Dialog.Trigger render={<Button variant="outline" size="sm" aria-keyshortcuts="?" />}>
        <Keyboard /> {t.shortcuts}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className={backdropClass} />
        <Dialog.Popup className={popupClass}>
          <Dialog.Title className="text-lg font-semibold">{t.shortcutsTitle}</Dialog.Title>
          <Dialog.Description className="mb-4 text-sm text-muted-foreground">{t.shortcutsDescription}</Dialog.Description>
          {groups.map((g) => (
            <section key={g} className="mb-4">
              <h3 className="mb-1.5 text-sm font-semibold">{g}</h3>
              <table className="w-full text-sm">
                <tbody>
                  {shortcuts
                    .filter((s) => s.group === g)
                    .map((s) => (
                      <tr key={s.action} className="border-b last:border-0">
                        <th scope="row" className="w-44 py-1.5 text-start font-normal">
                          <span className="flex flex-wrap gap-1">
                            {s.keys.map((k) => (
                              <kbd key={k} className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">
                                {k}
                              </kbd>
                            ))}
                          </span>
                        </th>
                        <td className="py-1.5 text-muted-foreground">{s.action}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </section>
          ))}
          <Dialog.Close render={<Button variant="outline" className="mt-2 w-full" />}>{t.close}</Dialog.Close>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/* ------------------------------------------------------------------ */
/* Detalhe / edição (?task=) e criação                                 */
/* ------------------------------------------------------------------ */

export function TaskboardTaskDialog() {
  const ctx = useTaskboard()
  const { editor } = ctx
  const task = editor?.mode === 'edit' ? ctx.taskById.get(editor.taskId) : undefined
  const open = editor?.mode === 'create' ? ctx.canCreate : !!task
  const editable = editor?.mode === 'create' || (!!task && ctx.canEdit)

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && ctx.closeEditor()}>
      <Dialog.Portal>
        <Dialog.Backdrop className={backdropClass} />
        <Dialog.Popup className={popupClass}>
          {editable ? (
            <TaskForm key={editor?.mode === 'create' ? `new:${editor.columnId}` : task?.id} task={task} />
          ) : (
            task && <TaskDetails task={task} />
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function TaskDetails({ task }: { task: Task }) {
  const { columns, t } = useTaskboard()
  return (
    <>
      <p className="font-mono text-xs text-muted-foreground">{task.id}</p>
      <Dialog.Title className="mt-1 text-lg font-semibold">{task.title}</Dialog.Title>
      <Dialog.Description className="mt-2 text-sm text-muted-foreground">{task.description || t.noDescription}</Dialog.Description>
      <dl className="mt-4 grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
        <dt className="text-muted-foreground">{t.status}</dt>
        <dd>{columns.find((c) => c.id === task.columnId)?.title}</dd>
        <dt className="text-muted-foreground">{t.priorityField}</dt>
        <dd>{t.priority[task.priority]}</dd>
        <dt className="text-muted-foreground">{t.assignees}</dt>
        <dd>{task.assignees.map((a) => a.name).join(', ') || '—'}</dd>
        <dt className="text-muted-foreground">{t.dueDate}</dt>
        <dd>{task.dueDate ?? '—'}</dd>
        <dt className="text-muted-foreground">{t.labels}</dt>
        <dd className="flex flex-wrap gap-1">
          {task.labels.length ? task.labels.map((l) => <Badge key={l.id} variant="outline">{l.name}</Badge>) : '—'}
        </dd>
      </dl>
      <div className="mt-6 flex gap-2">
        <DeleteFromDialog task={task} />
        <Dialog.Close render={<Button variant="outline" className="flex-1" />}>{t.close}</Dialog.Close>
      </div>
    </>
  )
}

function DeleteFromDialog({ task }: { task: Task }) {
  const { canDelete, requestDelete, closeEditor, t } = useTaskboard()
  if (!canDelete) return null
  return (
    <Button
      variant="ghost"
      className="me-auto text-destructive"
      onClick={() => {
        closeEditor()
        requestDelete([task.id])
      }}
    >
      <Trash2 /> {t.deleteAction}
    </Button>
  )
}

const fieldClass =
  `w-full rounded-md border border-input bg-background px-3 py-2 text-sm aria-[invalid=true]:border-destructive ${FOCUS_RING}`

function TaskForm({ task }: { task?: Task }) {
  const ctx = useTaskboard()
  const { t, editor } = ctx
  const id = useId()
  const titleRef = useRef<HTMLInputElement>(null)
  const [titleError, setTitleError] = useState(false)
  const isCreate = editor?.mode === 'create'
  const columnTitle = isCreate ? ctx.columns.find((c) => c.id === editor.columnId)?.title : undefined

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const title = String(fd.get('title') ?? '').trim()
    if (!title) {
      setTitleError(true)
      titleRef.current?.focus()
      return
    }
    const assigneeIds = fd.getAll('assignees').map(String)
    const labelIds = fd.getAll('labels').map(String)
    const estimateRaw = String(fd.get('estimate') ?? '')
    const patch: TaskUpdate & { title: string } = {
      title,
      description: String(fd.get('description') ?? '') || undefined,
      priority: String(fd.get('priority')) as TaskPriority,
      dueDate: String(fd.get('dueDate') ?? '') || null,
      estimate: estimateRaw ? Number(estimateRaw) : null,
      // Mantém a ordem já existente (o 1º responsável define a raia no agrupamento por responsável).
      assignees: [
        ...(task?.assignees.filter((a) => assigneeIds.includes(a.id)) ?? []),
        ...ctx.availableAssignees.filter((a) => assigneeIds.includes(a.id) && !task?.assignees.some((x) => x.id === a.id)),
      ],
      labels: ctx.availableLabels.filter((l) => labelIds.includes(l.id)),
    }
    if (isCreate) ctx.createTask(patch, { columnId: editor.columnId, laneId: editor.laneId })
    else if (task) ctx.updateTask(task.id, patch)
    ctx.closeEditor()
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      {task && <p className="font-mono text-xs text-muted-foreground">{task.id}</p>}
      <Dialog.Title className="text-lg font-semibold">
        {isCreate ? (columnTitle ? t.newTaskIn(columnTitle) : t.newTask) : t.edit}
      </Dialog.Title>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-title`} className="text-sm font-medium">
          {t.title} <span aria-hidden className="text-destructive">*</span>
        </label>
        <input
          ref={titleRef}
          id={`${id}-title`}
          name="title"
          required
          autoFocus
          defaultValue={task?.title}
          aria-invalid={titleError}
          aria-describedby={titleError ? `${id}-title-error` : undefined}
          onChange={() => titleError && setTitleError(false)}
          className={fieldClass}
        />
        {titleError && (
          <p id={`${id}-title-error`} className="text-xs text-destructive">
            {t.titleRequired}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-desc`} className="text-sm font-medium">
          {t.description}
        </label>
        <textarea id={`${id}-desc`} name="description" rows={3} defaultValue={task?.description} className={fieldClass} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-prio`} className="text-sm font-medium">
            {t.priorityField}
          </label>
          <select id={`${id}-prio`} name="priority" defaultValue={task?.priority ?? 'none'} className={fieldClass}>
            {PRIORITY_ORDER.map((p) => (
              <option key={p} value={p}>
                {t.priority[p]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-due`} className="text-sm font-medium">
            {t.dueDate}
          </label>
          <input id={`${id}-due`} name="dueDate" type="date" defaultValue={task?.dueDate ?? ''} className={fieldClass} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-est`} className="text-sm font-medium">
            {t.estimate}
          </label>
          <input id={`${id}-est`} name="estimate" type="number" min={0} step={1} defaultValue={task?.estimate ?? ''} className={fieldClass} />
        </div>
      </div>

      {ctx.availableAssignees.length > 0 && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">{t.assignees}</legend>
          <div className="flex flex-wrap gap-3">
            {ctx.availableAssignees.map((a) => (
              <label key={a.id} className="flex min-h-6 items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  name="assignees"
                  value={a.id}
                  defaultChecked={task?.assignees.some((x) => x.id === a.id)}
                  className="size-4 accent-primary"
                />
                {a.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {ctx.availableLabels.length > 0 && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">{t.labels}</legend>
          <div className="flex flex-wrap gap-3">
            {ctx.availableLabels.map((l) => (
              <label key={l.id} className="flex min-h-6 items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  name="labels"
                  value={l.id}
                  defaultChecked={task?.labels.some((x) => x.id === l.id)}
                  className="size-4 accent-primary"
                />
                {l.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="mt-2 flex justify-end gap-2">
        {task && <DeleteFromDialog task={task} />}
        <Dialog.Close render={<Button variant="outline" />}>{t.cancel}</Dialog.Close>
        <Button type="submit">{isCreate ? t.create : t.save}</Button>
      </div>
    </form>
  )
}
