# PawsDee — Project Instructions

PawsDee is a Pet Care CRM for the Thai market (990 THB/mo, first 3 years). Deliverables are bilingual **Thai · English**. Primary channel is **LINE**; the public web booking flow links customers to LINE for reminders.

## Folder structure
The **project root is the deploy root** (GitHub Pages serves from here). Shipped standalones, the design system, and review reports stay flat at root because they are mutually relative-linked; editable sources live in `prototype/`.

```
/                                     ← deploy root (GitHub Pages)
├── index.html                        ← SHIP: playable prototype (entry point)
├── add.html                          ← SHIP: calendar lander — MUST sit beside index.html
├── PawsDee Journey - LINE.html       ← SHIP: storyboard (compiled standalone)
├── PawsDee Design System v1.6.html   ← SHIP: design system (current; bump = new vX.Y file)
├── PawsDee Design System v1.5.html   ← prior version (kept)
├── PawsDee Design System v1.4.html   ← prior version (kept: historical reviews link to it)
├── CX Review - PawsDee Journey.html  ← review report  (+ cx-review.css)
├── UX Review - PawsDee CRM.html      ← review report
├── CLAUDE.md
│
├── prototype/                        ← EDIT HERE: design sources + compile inputs
│   ├── journey-play.jsx              → compiles to /index.html
│   ├── journey-app-line.jsx          → compiles to /PawsDee Journey - LINE.html
│   ├── Play - Source.html            ← wrapper that loads journey-play.jsx
│   ├── Storyboard - Source.html      ← wrapper that loads journey-app-line.jsx
│   ├── add.html                      → copies as-is to /add.html (self-contained — no bundling needed)
│   ├── ios-frame.jsx                 ← shared iOS device frame (exports IOSDevice)
│   └── journey.css                   ← shared journey styles
│
├── src/                              ← BACKEND product (Express + Handlebars) — routes/ + views/
├── archive/                          ← superseded drafts + README (do not edit/link)
├── uploads/                          ← raw source assets (photos, pasted images, notes) — non-authoritative, see uploads/README.md
└── screenshots/ , views/             ← stale/working scratch — NOT live deliverables
```

Rules:
- **Edit in `prototype/`, ship from root.** Never hand-edit a root standalone directly — edit the `.jsx` (or `prototype/add.html`) and recompile/copy to the root path. Every file at deploy root has a `prototype/` source; there are no exceptions.
- `add.html` must stay at the deploy root beside `index.html` — the prototype builds its URL relative to itself (`new URL('add.html', location.href)`).
- Keep the design system + review reports at root so the relative `<a href>` links between them resolve.
- **Root is the deploy target, not `dist/`.** GitHub Pages is configured to serve from repo root, and the DS + both review reports + storyboard link to each other with relative `<a href>`s that assume they're flat at root. Moving to a `dist/` layout is possible but requires changing the GitHub Pages source setting on GitHub itself first — don't restructure into `dist/` without that being done.

## Design system — source of truth
- **Use `PawsDee Design System v1.6.html` in THIS project.** It is the authoritative design system. The externally-bound "Design System" project is currently empty — do not wait on it; the in-project file is what governs visuals.
- Pull colors, type, spacing, components, and journey/booking patterns from that file. Don't invent tokens or colors.
- `prototype/journey.css` is the **runtime mirror** of the DS tokens (colors, type, spacing, radius, shadow) — not a second source of truth. When a token changes in the DS, mirror it in `journey.css` in the same commit and bump its `mirrors … vX.Y` header comment so the two never drift.
- Palette: warm **teal** primary (trust), **amber** for warmth/CTA energy. Never use teal and amber as competing CTAs in the same stack (one primary accent per action group).
- Fonts: Plus Jakarta Sans (Latin) · Sarabun (Thai) · JetBrains Mono (code).
- When you add or change a pattern in a mock, reflect it in the design system and bump its version. Keep a matching entry in the DS **Version history** section.

## DS version hygiene
- The current DS is **v1.6**. When you rev the DS, rename the file (`vX.Y`), update: the `<title>`, `.ds-header` line, `<footer>`, and add a Version history card.
- Every mock/review that references the DS must point to the **current** filename and show the correct `DS vX.Y` label + footer string. After a DS rename, grep the project for the old version and fix live deliverables and any broken links.
- Live deliverables to keep current: `prototype/journey-app-line.jsx` (→ storyboard) and `CX Review - PawsDee Journey.html`. Older `journey-app.*.jsx` drafts are superseded and now live in `archive/` — leave them.

## Journey versioning — phase-based (NOT .vN)
- The journey is versioned by **phase/scope**, not filename `.vN` suffixes.
- **Phase 1 · LINE-only** is current: `prototype/journey-app-line.jsx` (storyboard) + `prototype/journey-play.jsx` (playable). The footer stamp `Phase 1 · LINE only · PawsDee Design System vX.Y` is the version of record.
- Future phases (SMS, multi-channel) get a new named file in `prototype/` (e.g. `journey-phase2.jsx`) — don't resurrect `.vN`.
- Superseded drafts live in `archive/` with a README; don't link to them from live deliverables.

## Build / compile workflow
- **Playable prototype:** edit `prototype/journey-play.jsx` → compile `prototype/Play - Source.html` → standalone **`/index.html`** (via the inliner).
- **Storyboard:** edit `prototype/journey-app-line.jsx` → compile `prototype/Storyboard - Source.html` → standalone **`/PawsDee Journey - LINE.html`**.
- **Calendar lander:** edit `prototype/add.html` → copy as-is to **`/add.html`**. It's a single self-contained file (no JSX, no external `<link>`/`<script src>` refs), so the "build" step is a plain copy, not a bundle.
- Both wrappers load the shared `prototype/ios-frame.jsx` + `prototype/journey.css`; the inliner resolves those relative paths from the wrapper's location, so keep sources together in `prototype/`.
- Never hand-edit a compiled standalone — edit the `.jsx` / source wrapper and recompile. Standalones must stay self-contained (GitHub-Pages deployable, no external deps).
- Source wrappers carry a `<template id="__bundler_thumbnail">` splash for bundling.

## PDPA rules (Thailand PDPA B.E. 2562)
These are product requirements, not decoration. (Design guidance, not legal advice — confirm bases/retention with the tenant's DPO.)
- **Collection notice at point of collection (§23):** the booking form collects name, phone, pet — so the notice (purpose, retention, rights) lives **on that form, above submit**. It is a **notice, not a consent checkbox** — lawful basis is contract performance, so booking is never blocked. Marketing/promo use is a separate purpose and *does* need an opt-in checkbox (§19).
- **"Point of collection" = when the person types the data, not when a server receives it.** The notice must precede or coincide with data entry — so it stays on the Booking form (Stage 1), never moves to Review (Stage 2), even though the real POST-to-server should happen at Review's confirm(), not Booking's submit(). By Review, the person has already handed over the data by typing it; showing the notice there would be after collection. Both `journey-app-line.jsx` and `journey-play.jsx` have a code comment on `submit()`/`confirm()` documenting this for backend integration.
- **Add-to-calendar reminders carry NO personal data.** A calendar invite is forwardable/screenshottable, so PII in it is an uncontrolled disclosure (§37). The `.ics` is a generic "PawsDee appointment" + time + alert only — no pet, owner, phone, reason, clinic name/address. Data minimisation (§22). Because nothing personal is processed, it sits outside the consent/lawful-basis matrix entirely.
- **The notice-only PDPA block is a standard, reusable component — not a one-off.** It carries the same `.consent-block` + `.consent-title` scaffold everywhere personal data is collected OR updated: the Booking form (point of collection) and the SMS backup screen (updating/repurposing an already-collected phone number to a new channel). Whenever a mock lets a person change previously-collected data, or use it for a new purpose, show this block again with purpose/retention/rights copy scoped to that specific use — don't assume the original notice still covers it.

## Add-to-calendar — native-first routing
The options sheet is a **fallback**, not the default. Each platform gets its fewest-tap native path:
- **iOS Safari** → navigate straight to the `text/calendar` blob (1 tap; Calendar.app opens).
- **LINE / Chrome iOS (WKWebView)** → blob is blocked → open `add.html?d=&t=&openExternalBrowser=1`; LINE re-opens it in Safari, which rebuilds the same PII-free `.ics`.
- **Android** → `googlecal://` deep link → web Google Calendar → `add.html` as last resort.
- **Desktop / unknown** → the options sheet (`.ics` download · Google Calendar · payload viewer).
- `add.html` is a static GitHub-Pages lander carrying **only date & time** as query params (not personal data) — safe to bounce through the OS.
- `window.__PD_SIM = 'ios' | 'line' | 'android' | 'desktop'` forces a route for testing; simulated routes open in a new tab + toast so the running prototype isn't navigated away.
- **When does `add.html` need updating?** Only when its own logic/UI changes — the `.ics`/Google-Calendar payload fields, the native-routing detection (UA sniffing for iOS Safari / WKWebView / Android), or its own copy/branding. It does **not** need touching when journey screens, the DS, or other `prototype/` files change — it's decoupled by design, receiving only `?d=` / `?t=` via the URL.

## Copy & UX conventions
- Bilingual Thai · English throughout (Thai first in customer-facing strings, e.g. `เพิ่มลงปฏิทิน · Add reminder`).
- Never a dead end: when a LINE link/token expires, surface the phone backup proactively (amber notice + "Verify by phone").
- Hit targets ≥ 44px. Buddhist-era dates (B.E.) in customer-facing date strings where the rest of the UI uses them.
