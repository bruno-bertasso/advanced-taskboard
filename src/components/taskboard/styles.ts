/**
 * Classes compartilhadas de foco/indicadores.
 * Em `forced-colors` (Alto Contraste do Windows) `box-shadow` é removido e fundos são
 * substituídos por cores do sistema — por isso cada indicador tem um equivalente com
 * outline/cores de sistema (`Highlight`, `CanvasText`).
 */
export const FOCUS_RING =
  'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 forced-colors:focus-visible:outline-2 forced-colors:focus-visible:outline-solid forced-colors:focus-visible:outline-offset-2 forced-colors:focus-visible:outline-[Highlight]'

/** Seleção usa borda (não outline) para coexistir com o anel de foco em Alto Contraste. */
export const SELECTED_FORCED =
  'forced-colors:data-[selected]:border-2 forced-colors:data-[selected]:border-dashed forced-colors:data-[selected]:border-[Highlight]'

/** Barras de indicador de soltura (visíveis também em Alto Contraste). */
export const DROP_BAR = 'pointer-events-none absolute rounded-full bg-ring forced-color-adjust-none forced-colors:bg-[Highlight]'
