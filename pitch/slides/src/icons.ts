// Иконки рисуются цветом текста (currentColor). Двухтоновые: заливка с прозрачностью и обводка.
const duo = (body: string) =>
  `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
const soft = 'fill="currentColor" fill-opacity=".16" stroke="none"'

export const icons: Record<string, string> = {
  // точечная диаграмма: лестница Парето и выбранная точка
  bench: duo(`<path ${soft} d="M8 40V30h9v-8h9v-7h14v25z"/><path d="M8 7v33h33"/><path d="M8 30h9v-8h9v-7h14"/><circle cx="26" cy="15" r="4.5" fill="currentColor" stroke="none"/><circle cx="26" cy="15" r="9"/>`),
  // два судьи сходятся к арбитру
  judges: duo(`<rect ${soft} x="29" y="17" width="14" height="14" rx="4"/><rect x="5" y="7" width="12" height="12" rx="3.5"/><rect x="5" y="29" width="12" height="12" rx="3.5"/><rect x="29" y="17" width="14" height="14" rx="4"/><path d="M17 13h5a3 3 0 0 1 3 3v5h4M17 35h5a3 3 0 0 0 3-3v-5"/>`),
  // чек-лист превращается в фигурные скобки промпта
  checklist: duo(`<rect ${soft} x="6" y="6" width="22" height="30" rx="5"/><rect x="6" y="6" width="22" height="30" rx="5"/><path d="m11 14 2.5 2.5L18 12M11 25l2.5 2.5L18 23"/><path d="M36 22c-2 0-3 1-3 3v2c0 1.5-1 2.5-2.5 2.5 1.5 0 2.5 1 2.5 2.5v2c0 2 1 3 3 3M41 22c2 0 3 1 3 3"/>`),
  // щит с номером реплики
  shield: duo(`<path ${soft} d="M24 5 39 10.5V23c0 9.5-6.5 16-15 20-8.5-4-15-10.5-15-20V10.5Z"/><path d="M24 5 39 10.5V23c0 9.5-6.5 16-15 20-8.5-4-15-10.5-15-20V10.5Z"/><path d="M21 16.5 19 31M29 16.5 27 31M16.5 21h15M15.5 27h15"/>`),
  // замок: эталон зафиксирован до прогона
  lock: duo(`<rect ${soft} x="9" y="21" width="30" height="21" rx="5"/><rect x="9" y="21" width="30" height="21" rx="5"/><path d="M16 21v-5a8 8 0 0 1 16 0v5"/><circle cx="24" cy="30" r="2.5" fill="currentColor" stroke="none"/><path d="M24 32v4"/>`),
  // волна речи со скрытым фрагментом
  wave: duo(`<rect ${soft} x="18" y="15" width="14" height="18" rx="4"/><path d="M5 24v0M10 19v10M15 14v20"/><rect x="18" y="15" width="14" height="18" rx="4"/><path d="M22 21l6 6M28 21l-6 6"/><path d="M36 16v16M41 21v6"/>`),
  // книга-справочник
  book: duo(`<path ${soft} d="M8 9h12a4 4 0 0 1 4 4v27a3 3 0 0 0-3-3H8z"/><path d="M8 9h12a4 4 0 0 1 4 4v27a3 3 0 0 0-3-3H8zM40 9H28a4 4 0 0 0-4 4v27a3 3 0 0 1 3-3h13z"/><path d="M29 17h6M29 23h6"/>`),
  // две дорожки звонка
  tracks: duo(`<rect ${soft} x="5" y="9" width="38" height="12" rx="4"/><rect x="5" y="9" width="38" height="12" rx="4"/><rect x="5" y="27" width="38" height="12" rx="4"/><path d="M11 15h4M19 15h8M31 15h3M11 33h6M21 33h3M28 33h9"/>`),
  // окно CRM с встроенной карточкой
  crm: duo(`<rect ${soft} x="23" y="17" width="16" height="17" rx="3"/><rect x="5" y="7" width="38" height="34" rx="5"/><path d="M5 14h38M11 20h7M11 26h7M11 32h5"/><rect x="23" y="17" width="16" height="17" rx="3"/>`),
}

// Линейные значки 24×24 для узлов схемы
export const nodeIcons: Record<string, string> = {
  api: '<path d="M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0zM12 16v5"/>',
  norm: '<path d="M4 6h16M4 12h11M4 18h14"/><path d="m18 10 2 2-2 2"/>',
  signals: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  compile: '<path d="M8 4C6 4 5 5 5 7v2c0 1.2-.8 2-2 2 1.2 0 2 .8 2 2v2c0 2 1 3 3 3M16 4c2 0 3 1 3 3v2c0 1.2.8 2 2 2-1.2 0-2 .8-2 2v2c0 2-1 3-3 3"/><path d="M10 9h4M10 13h3"/>',
  check: '<path d="M4 8h16M4 13h8"/><path d="m14 16.5 2.5 2.5L21 14.5"/>',
  arbiter: '<path d="M12 4v16M7 20h10M5 7h14"/><path d="M8 7l-3 6a3 3 0 0 0 6 0zM16 7l-3 6a3 3 0 0 0 6 0z"/>',
  score: '<path d="M17 5H7l6 7-6 7h10"/>',
  ui: '<path d="M8.5 3h7L21 8.5v7L15.5 21h-7L3 15.5v-7z"/><path d="M12 7v5l3 3"/>',
  appeal: '<path d="M5 21V4M5 4h11l-2.5 4L16 12H5"/>',
  export: '<path d="M6 3h8l4 4v14H6zM14 3v4h4"/><path d="m9 15 3 3 3-3M12 10v8"/>',
}
