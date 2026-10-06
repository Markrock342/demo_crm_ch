# UI style rules — VISUAL-FIRST (authoritative)

The owner's feedback: "it's all text, hard on the eyes". Every screen must be picture-first: understandable from shapes, colors, icons, flags and position before reading words.

## Kit (import from "../components" in src/v2/pages, or "../v2/components" from src/pages)
- Layout: `PageHeader({title, subtitle?, back?, extra?, children?, helpKey?})` (has a "?" help button), `Panel({title?, extra?, flush?})` (never nest), `FilterBar({search?, tabs?, selects?, onClear?, count?, extra?})` (one row; ≤5 segmented tabs), `DataTable` (antd Table wrapper; `onRowClick`, `emptyText`, `emptyAction`), `StatStrip`, `EmptyState({title?, description?, action?})`, `LoadingState`, `StatusTag({status, label?, tone?})` (i18n `status_<KEY>`), `AiBriefCard`.
- Visuals (src/v2/components/Graphics.tsx + Visuals.tsx): `Flag`, `Port`, `RouteTrack({from,to,progress,fromDate,toDate,delayed,done,size})` + `progressBetween(etd, eta)`, `StageFlow({current, labels, dates?, problem?, size})` (6 shipment stages, labels `tx("stage_<key>")`), `IconBadge({icon, tone})`, `Tile` + `TileRow`, `SegmentBar`, `BarList`, `Donut`, `Legend`, `EntityCard`, `CardGrid`, `Board({columns})`, `ViewSwitch` + `readView/writeView`, `PersonAvatar`, `PeopleStack`, `LaneCell`, `StepMeter`. Tones: primary | accent | success | warning | danger | info | neutral.
- Helpers: src/v2/lib/format.ts (`fmtDate`, `fmtDateTime`, `fmtRelativeDay`, `fmtMoney`, `fmtNumber`), `useCustomerLookup()`, `useUserLookup()`, `useCan()`; icons from `@phosphor-icons/react`.
- Tokens only (src/index.css :root: --canvas --paper --fill --ink --ink-soft --ink-faint --line --primary --primary-soft --accent --success/--warning/--danger/--info (+ -soft) --space-* --radius). Never hardcode hex in pages (JS colors: `palette` from src/v2/theme.ts). No purple, no gradients/gradient text, no glassmorphism, no thick left-border accent stripes, no card-in-card.

## Rules
1. List pages default to a visual view (cards/board) with a ViewSwitch to a compact table; remember choice.
2. Each card has one picture (RouteTrack / StageFlow / IconBadge / avatar / Donut); title = identifier (bold); ≤2 short text lines; details in the detail page/drawer.
3. Color = meaning: red only late/overdue/blocked; amber needs action soon; teal normal progress; green done.
4. Numbers as graphics on summary areas (Tiles with icons, Donut, BarList, SegmentBar).
5. Few words: headers 1–3 words, hints only in tooltips; never show raw ids/ISO dates/enum strings; one bold thing per row.
6. Works at 390px: cards stack, boards scroll inside themselves, no page-level horizontal scroll.
7. Keep behaviour, URL params, permissions; a11y: real buttons/links, labels on icon buttons.
