# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Application Overview

**CMB VSAQ** — Vendor Security Assessment Questionnaire. A Power Apps Code App used by CMB to manage third-party vendor risk assessments.

Three roles:
- **CISO** — full access: Dashboard, Vendors, Assessments, Settings
- **Assessor** — own assessments only: Dashboard (filtered), Vendors, Assessments (filtered)
- **Vendor** — external; arrives via `?aid=<assessmentId>` URL param → `/vendor-form` (no sidebar, no Microsoft login)

## Commands

```bash
npm run dev        # Start Vite dev server
npm run build      # Type-check then build for production (tsc -b && vite build)
npm run lint       # Run ESLint
npm run preview    # Preview the production build locally
```

There are no tests configured.

## Architecture

**Vite + TypeScript + React** Power Apps Code App. The `@microsoft/power-apps-vite` Vite plugin and `@microsoft/power-apps` runtime package handle Power Apps hosting integration.

### Provider stack (`src/App.tsx`)

Providers nested in dependency order — `ThemeProvider` must be outermost since `SonnerProvider` calls `useTheme()`:

```
ThemeProvider → SonnerProvider → QueryProvider → RouterProvider
```

### Routing (`src/router.tsx`)

The two lines before `createBrowserRouter` are **required for Power Apps hosting** — they derive the correct `basename` from the deployment URL and strip `/index.html` from the path. Do not remove or refactor them.

New internal routes are added as children of the root `"/"` route (rendered inside `_layout.tsx`). Routes that must appear without the sidebar (`/vendor-form`, `/access-denied`) are defined as top-level siblings outside the Layout wrapper.

### Path alias

`@/` maps to `src/`. Use it for all imports.

### Styling

Tailwind CSS v4 — no `tailwind.config` file; configuration lives entirely in `src/index.css` via `@theme inline {}` and CSS custom properties. Dark mode is class-based (`.dark` on `<html>`), managed by `ThemeProvider`.

shadcn/ui components are in `src/components/ui/`. Add new components with `npx shadcn@latest add <component>`.

### Brand & Sidebar

- CMB Navy `oklch(0.267 0.078 263.5)` (#1F3864) → `--sidebar` background
- CMB Gold `oklch(0.723 0.138 83.5)` (#C9A84C) → `--sidebar-primary` (active nav item + logo text)
- `--sidebar-*` CSS tokens set in `:root` in `src/index.css`; **not overridden in `.dark`** — sidebar stays navy regardless of content-area theme
- Layout: `w-56` fixed left sidebar + `flex-1` scrollable main area (`src/pages/_layout.tsx`)

### Pre-wired libraries

- **Zustand** — state management (`src/stores/`)
- **TanStack Query** (`src/providers/query-provider.tsx`) — `QueryClient` with 5 min stale time, no window-focus refetch
- **TanStack Table** — sortable data grids (used in Dashboard assessment table)
- **Recharts** — charts (shadcn chart wrapper at `src/components/ui/chart.tsx`)
- **Sonner** (`src/providers/sonner-provider.tsx`) — toasts via `import { toast } from "sonner"`

### Key conventions

- `asChild` prop on `Button` (and other Radix-based components) merges styles onto child elements.
- Theme is read via `useTheme()` from `@/hooks/use-theme` — throws if called outside `ThemeProvider`.
- OData filters are built with a `parts.join(" and ")` pattern; always include `statecode eq 0` as the first part:
  ```typescript
  const parts = ["statecode eq 0"]
  if (role === "Assessor") parts.push(`cr871_assessoremail eq '${email}'`)
  if (search) parts.push(`contains(cr871_fieldname,'${search}')`)
  filter = parts.join(" and ")
  ```
- SDK results use `.data` (not `.value`) — `IOperationResult<T>` pattern from `@microsoft/power-apps`.
- Period filtering on the Dashboard is client-side from cached TanStack Query data; only role and name search changes trigger a re-query.

## Dataverse Tables

| Logical name | Purpose |
|---|---|
| `cr871_vendors` | Vendor registry |
| `cr871_assessments` | Assessment lifecycle |
| `cr871_questions` | Question bank |
| `cr871_responses` | Per-question responses |
| `cr871_settings` | App-wide config (risk thresholds, etc.) |
| `cr871_appusers` | Internal user registry with role assignment |
| `cr871_annotations` | Evidence file attachments |

Generated service classes live in `src/generated/services/`.

## Enum Codes

All stored as integers in Dataverse. Human-readable labels and Tailwind color classes are in `src/lib/labels.ts`.

**Assessment Status:** Invited=144610000, InProgress=144610001, Submitted=144610002, UnderReview=144610003, Complete=144610004, Lapsed=144610005

**Risk Band:** LowRisk=144610000, MediumRisk=144610001, HighRisk=144610002, CriticalRisk=144610003

**App Role:** CISO=144610000, Assessor=144610001

## Auth & Role Store (`src/stores/auth-store.ts`)

Initialized once in `App.tsx` via `getContext()` from `@microsoft/power-apps/app`. Exposes `role`, `email`, `name`, `objectId`, `assessmentId`, `loading`, `denied`.

- `?aid=<id>` in URL → sets `role = "Vendor"` and `assessmentId`, no Dataverse lookup
- Otherwise: looks up `cr871_appusers` by UPN email → sets `role = "CISO"` or `"Assessor"`
- `denied: true` when user is authenticated but has no `cr871_appusers` record → `_layout.tsx` redirects to `/access-denied`

## Page Inventory

| Route | File | Roles |
|---|---|---|
| `/dashboard` | `src/pages/dashboard.tsx` | CISO, Assessor |
| `/vendors` | `src/pages/vendors/index.tsx` | CISO, Assessor |
| `/vendors/:id` | `src/pages/vendors/detail.tsx` | CISO, Assessor |
| `/assessments` | `src/pages/assessments/index.tsx` | CISO, Assessor |
| `/assessments/:id` | `src/pages/assessments/detail.tsx` | CISO, Assessor |
| `/settings` | `src/pages/settings.tsx` | CISO only |
| `/vendor-form` | `src/pages/vendor-form.tsx` | Vendor (no sidebar) |
| `/access-denied` | `src/pages/access-denied.tsx` | Unauthenticated/denied users |

## Vendors Screen (`src/pages/vendors/index.tsx`) — implemented

Single-page UX: no navigation away from the list.

- Searchable (client-side global filter), sortable table of `cr871_vendors`
- Filter dropdowns: Current Risk Rating (`cr871_currentriskrating`) and Vendor Status (`cr871_vendorstatus`)
- Client-side pagination — page size 15; "Showing X–Y of Z" + prev/next
- **Row click** → opens Vendor Profile slide-in panel (Sheet); no `navigate()`
- `profileVendor` resolved client-side from already-fetched `allVendors` — no extra Dataverse fetch
- **Register New Vendor** button → opens Registration Form panel (blank)
- **Profile panel**: read-only 2-col grid of all vendor fields; "Initiate New Assessment" button pre-fills Registration Form with vendor data (`registerVendorId` set = re-assess mode)
- **Registration Form panel**: 8 fields; on Save:
  1. Required-field guard (client-side)
  2. RC uniqueness check via `Cr871_vendorsService.getAll` — inline error if duplicate; **no records written**
  3. Assessor email check via `Cr871_appusersService.getAll` — inline error if not found; **no records written**
  4. Create `cr871_vendors` record (new-vendor mode only)
  5. Create `cr871_assessments` record with `cr871_status = 144610000` (Invited) + `cr871_invitedate`
  6. Trigger Power Automate flow (best-effort `fetch` POST to `settingsStore.get("Flow_InviteURL", "")`)
- In re-assess mode (from "Initiate New Assessment"): vendor fields are disabled; only assessment fields are editable; vendor creation step is skipped
- Close without saving resets all state, writes nothing to Dataverse
- `src/pages/vendors/detail.tsx` unchanged — still accessible via `/vendors/:id` for direct URL access

## Assessments Screen (`src/pages/assessments/index.tsx`) — implemented

- Sortable table of `cr871_assessments` records
- Columns: Assessment ID, Vendor Name, Risk Rating, Status, Overall Score, Risk Band, Submit Date, Due Date, Assessor Email, Actions
- Server-side search (300ms debounced) filters by vendor name or Assessment ID via `contains()` OData
- Status filter dropdown is server-side (included in query key); query re-fires on change
- **Send Reminder** button appears only on In Progress (144610001) and Lapsed (144610005) rows:
  1. Patches `cr871_remindercount` + 1 on that record
  2. Invalidates query cache
  3. Best-effort POST to `settingsStore.get("Flow_ReminderURL", "")` with `{ assessmentId }`
- Row click navigates to `/assessments/:id`
- Flow helper: local `triggerFlow(url, assessmentId)` function — silent failure, same pattern as Flow_InviteURL

## Assessment Detail Screen (`src/pages/assessments/detail.tsx`) — implemented

Two-panel layout: `flex gap-6 items-start` — left panel `w-[380px] shrink-0`, right panel `flex-1 min-w-0`.

**Left panel:**
- Metadata card: Vendor Name, Assessment ID, Risk Rating, Status, Overall Score, Risk Band, Submit Date, Due Date, Assessor Email, Vendor Contact
- Section Breakdown table: per section — FI count, Partial count, NI count, mini progress bar (`<Progress>`) showing FI/(FI+Partial+NI)%; N/A and Not Answered excluded from denominator
- Assessor Actions card (conditionally rendered):
  - Visible to CISO always; visible to Assessor only when `cr871_assessoremail` matches signed-in `email`
  - **Save Notes**: patches `cr871_assessornotes` only
  - **Save Decision**: Select dropdown + button → patches `cr871_finaldecision` + sets `cr871_status = 144610004` (Complete) + stamps live score/band
  - **Export Report**: best-effort POST to `settingsStore.get("Flow_ExportURL", "")` with `{ assessmentId }`

**Right panel:**
- Responses grouped by section → subsection, sorted by `cr871_sortorder`
- Per response card: question text, evidence label, response text, compensating controls, maturity badge

**Data init pattern:** `useRef(initialized)` guards a `useEffect` so notes/decision fields populate from the fetched assessment exactly once (avoids re-setting on every user keystroke).

**OData lookup access:** `_cr871_questionid_value` is accessed via double-cast `(r as unknown as Record<string, unknown>)["_cr871_questionid_value"]` since it's a Dataverse-returned navigation field not present in the TypeScript model definition.

## Vendor Form (`src/pages/vendor-form.tsx`) — implemented (Phase 5)

Multi-screen wizard contained within `/vendor-form` route. State machine: `screen: "home" | "profile" | "section" | "submit" | "done"` + `currentSection: string | null`. No router changes — `?aid=` URL param preserved throughout.

**Four data queries loaded once at component root:** assessment, responses, questions (ordered by sectionid + sortorder), and vendor record (fetched via `assessment._cr871_vendorid_value`).

**Screen_Home:**
- CMB-branded header using `bg-[--sidebar]` + `text-[--sidebar-primary]` Tailwind v4 CSS variable classes
- Welcome message + due date label (red + days-remaining if ≤ 7 days from today)
- `<Progress>` bar: answered/total applicable questions (answered = maturity ≠ NotAnswered 144610004)
- Section checklist: applicable sections (data-driven from `cr871_applicableratings` on questions), each showing Not Started / In Progress / Complete badge; clickable → navigate to that section
- "Edit Profile" → Screen_Profile; "Continue Assessment" → first section where status ≠ Complete; "Review & Submit" → Screen_Submit

**Screen_Profile:**
- Read-only grid: Company Name + Legal Entity Name + RC Number (from vendor record) + Contact Email (from assessment `cr871_vendorcontactemail`)
- Editable "Primary Contact Name" saves to `cr871_vendorname` on assessment
- `profileInitialized` useRef guard populates input once from assessment data
- Back → Screen_Home; Next → first applicable section

**Screen_Section:**
- Single section at a time (replaces old Tabs-based layout)
- Breadcrumb: Overview / {sectionName}; subsections grouped and sorted
- Question cards identical to previous: maturity dropdown, response textarea, compensating controls textarea, Gate badge, Covered-by-cert badge
- Bottom nav: "Back to Overview" | "Next: {sectionName}" or "Review & Submit" (if last section)

**Screen_Submit:**
- Summary table: section | status badge | answered/total per section
- Overall `<Progress>` bar
- "Submit Assessment" button → confirmation dialog → patches status=Submitted (144610002) + submitdate + overallscore → transitions to Screen_Done

**Screen_Done:** full-page success message (CheckCircle2 icon).

**Status transition (Invited → InProgress):** fires inside `handleFieldUpdate` on the first response field save. Guarded by `statusTransitioned` useRef (set optimistically, reset on failure) + secondary useEffect that sets ref if DB status is already ≠ Invited. Prevents duplicate patches.

**Section applicability:** data-driven — `cr871_applicableratings` on each question contains the rating name substring (e.g., "Low", "Critical"). `isApplicableQuestion()` checks `ar.toLowerCase().includes(ratingName.toLowerCase())`.

## Dashboard Screen (`src/pages/dashboard.tsx`) — implemented

- Period selector top-right: This Month / This Quarter / This Year (client-side filter, no re-fetch)
- 6 KPI tiles (2×3 grid): Total Vendors, Active Assessments, Awaiting Review, Overdue (always red), Completed This Period, Avg Risk Score This Period
- Tiles 5 & 6 and both Top Vendors cards show a `CalendarDays` icon + active period label to indicate they react to the period selector
- Top Vendors panel: Top 3 Lowest Risk + Top 3 Highest Risk, filtered to vendors with period-complete assessments
- Sortable assessment table with 300ms debounced server-side vendor name search
- Assessor role: `cr871_assessoremail eq '${email}'` appended to OData filter server-side (included in query key)
