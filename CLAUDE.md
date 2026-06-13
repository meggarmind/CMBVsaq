# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start Vite dev server
npm run build      # Type-check then build for production (tsc -b && vite build)
npm run lint       # Run ESLint
npm run preview    # Preview the production build locally
```

There are no tests configured in this template.

## Architecture

This is a **Vite + TypeScript + React** starter for [Power Apps Code Apps](https://github.com/microsoft/PowerAppsCodeApps). The `@microsoft/power-apps-vite` Vite plugin and `@microsoft/power-apps` runtime package handle Power Apps hosting integration.

### Provider stack (`src/App.tsx`)

Providers are nested in dependency order — `ThemeProvider` must be outermost since `SonnerProvider` calls `useTheme()`:

```
ThemeProvider → SonnerProvider → QueryProvider → RouterProvider
```

### Routing (`src/router.tsx`)

The two lines before `createBrowserRouter` are **required for Power Apps hosting** — they derive the correct `basename` from the deployment URL and strip `/index.html` from the path. Do not remove or refactor them. New routes are added as children of the root `"/"` route inside `_layout.tsx`.

The root route passes `showHeader={false}` by default (template demo); set it to `true` or remove the prop when building a real app with navigation.

### Path alias

`@/` maps to `src/`. Use it for all imports — e.g., `@/components/ui/button`, `@/hooks/use-theme`.

### Styling

Tailwind CSS v4 (`@tailwindcss/vite` plugin) — no `tailwind.config` file; configuration lives entirely in `src/index.css` via `@theme inline {}` and CSS custom properties. Dark mode is class-based (`.dark` on `<html>`), managed by `ThemeProvider`.

shadcn/ui components are in `src/components/ui/`. Add new components with `npx shadcn@latest add <component>`.

### Pre-wired libraries (unused in template, ready to use)

- **Zustand** — state management
- **TanStack Query** (`src/providers/query-provider.tsx`) — `QueryClient` configured with 5 min stale time, no window-focus refetch
- **TanStack Table** — data grids
- **Recharts** — charts (shadcn chart wrapper at `src/components/ui/chart.tsx`)
- **Sonner** (`src/providers/sonner-provider.tsx`) — toasts via `import { toast } from "sonner"`

### Key conventions

- `asChild` prop on `Button` (and other Radix-based components) merges styles onto child elements — use `<Button asChild><Link to="/">...</Link></Button>` instead of nesting interactive elements.
- Theme is read via `useTheme()` from `@/hooks/use-theme` — throws if called outside `ThemeProvider`.
