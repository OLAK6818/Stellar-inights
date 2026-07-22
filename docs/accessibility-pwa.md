# Accessibility & PWA Readiness

## Overview

This document is the authoritative reference for accessibility (a11y), internationalisation (i18n), Progressive Web App (PWA) offline experience, mobile network fallback behaviour, and production error/telemetry safety for the Stellar Insights dashboard.

---

## Accessibility (WCAG 2.1 AA)

### Standards

All audited components target **WCAG 2.1 Level AA** compliance. Automated checks use [jest-axe](https://github.com/nickcolley/jest-axe) which runs the axe-core engine inside vitest.

### Component-level implementations

| Component | Accessibility work |
|---|---|
| `SkipNavigation` | Visually-hidden link to `#main-content`; becomes visible on keyboard focus |
| `Sidebar` | `<aside aria-label="Sidebar navigation">`, `<nav aria-label="Primary navigation">`, `aria-current="page"` on active link, collapse button has `aria-label` + `aria-expanded`, status region uses `role="status" aria-live="polite"`, all SVG icons carry `aria-hidden="true"` |
| `ErrorBoundary` | Outermost wrapper has `role="alert" aria-live="assertive"` so errors are announced immediately; `<h1>` heading hierarchy; stack traces gated to `NODE_ENV === "development"` only; both action buttons have `focus-visible:ring` styles |
| `CreateProposalModal` | `role="dialog" aria-modal="true" aria-labelledby="modal-title"`; focus trapped with Tab/Shift+Tab cycle; Escape closes; all inputs have `<label htmlFor>` association, `aria-required="true"`, and `aria-describedby` on error |
| `NotificationItem` | `role="button" tabIndex={0}` on the `<article>` element; Enter/Space keyboard handler; actions dropdown trigger has `aria-label="Notification actions"`; unread dot has `role="status" aria-label="Unread"`; all icons `aria-hidden="true"` |
| `NotificationList` | Wrapping `<div>` has `role="list" aria-label="Notifications"` with explicit `role="listitem"` children for full screen reader compatibility; empty state `BellOff` icon is `aria-hidden` |
| `CorridorHealthCard` | `<section aria-labelledby>`, `<h2>` heading, `role="list"`, health badges use `role="status" aria-label="Health score: …%"` |
| `Button` | `loading` + `loadingText` props set `aria-busy="true"` and `disabled` atomically; `focus-visible:ring-2` focus indicator; `size="lg"` maps to `h-11` (44 px) for touch compliance |
| `Badge` | `focus:outline-none focus:ring-2` focus ring; `min-h-[44px] min-w-[44px]` touch target |

### Running accessibility tests

```bash
cd frontend

# axe component scans (Button, Badge, forms, nav, images, ARIA)
npx vitest run src/components/__tests__/accessibility.a11y.test.tsx

# dashboard-specific component scans (Sidebar, CorridorHealthCard, CreateProposalModal, NotificationList)
npx vitest run src/components/__tests__/accessibility.test.tsx
```

---

## Internationalisation (i18n)

### Supported locales

| Locale | Direction |
|---|---|
| `en` | LTR |
| `es` | LTR |
| `zh` | LTR |
| `ar`, `he`, `fa`, `ur` | RTL (direction resolved; layout must set `<html dir="rtl">`) |

### Translation coverage guarantees

`src/__tests__/i18n.test.ts` enforces:

- All keys in `en.json` exist in `es.json` and `zh.json`
- No locale carries extra keys missing from `en`
- No translation value is empty, `null`, or `undefined`
- Locale switching falls back to `en` for unsupported locales
- RTL locales resolve `"rtl"`, LTR locales resolve `"ltr"`

```bash
cd frontend
npx vitest run src/__tests__/i18n.test.ts
```

---

## Progressive Web App (PWA)

### Public assets

| File | Purpose |
|---|---|
| `public/manifest.json` | App name, theme colour `#6366f1`, background `#0f172a`, shortcuts to `/en/dashboard` and `/en/corridors` |
| `public/icon.svg` | Scalable icon — `purpose: any` and `purpose: maskable` |
| `public/icon-light-32x32.png` | 32 × 32 favicon |
| `public/apple-touch-icon.png` | 180 × 180 iOS home screen icon |

### Offline experience

1. Service worker registered via `lib/pwa.ts → registerSW()` which calls `navigator.serviceWorker.register('/sw.js')`.
2. `lib/pwa.ts → addOfflineListener()` updates the `isOnline` module variable and fires a callback on every `online`/`offline` browser event. The function is a no-op in SSR (`typeof window === 'undefined'` guard).
3. `getSWStatus()` returns `'unsupported'` in SSR and in browsers without the API, `'registered'` when a SW is active, or `'no-permission'` when the ready promise rejects.
4. When the network fails, the service worker falls back to `app/offline/page.tsx` which shows an animated offline screen with cached-route links, elapsed time, and a **Retry** button that calls `window.location.reload()` after 800 ms.
5. `OfflineBanner` renders a dismissible top banner whenever `navigator.onLine` is `false`.
6. `ProgressiveWebApp` component exposes install prompt, update notification, offline indicator, and cache management UI.

### Running PWA tests

```bash
cd frontend
npx vitest run src/__tests__/pwa.test.tsx
```

Covers: offline page rendering, `isOffline()`, `getSWStatus()`, `registerSW()`, `addOfflineListener()` event callbacks, icon file existence on disk, cache API simulation.

---

## Mobile fallback behaviour

### Network status indicator (`mobile/src/components/NetworkStatusIndicator`)

- Shows when `isOnline === false` or `isSyncing === true`
- `accessibilityRole="alert"` announces status to screen readers immediately
- `accessibilityLabel` includes the current message text
- Dismiss button has `accessibilityRole="button"` and a 44 pt minimum hit area (`minHeight: 44`)
- Banner style adapts per platform: iOS uses rounded corners (14 px), Android uses elevation 3
- `useNetworkStatusIndicator` auto-resets the dismissed state whenever the network status changes

### Notification service (`mobile/src/services/notifications`)

Hardened against three failure modes:

| Condition | Behaviour |
|---|---|
| `requestPermission` rejects (simulator, restricted device) | Catches, returns early — no crash |
| Permission is `DENIED` or `NOT_DETERMINED` | Returns early, no channel or listener created |
| FCM message has no `notification` payload (data-only) | `displayNotification` is skipped |

The exported `NOTIFICATION_CHANNEL_ID = 'default'` constant is used in both the service and its tests to prevent magic-string drift.

### Running mobile tests

```bash
cd mobile

# Notification service (permission paths, iOS vs Android, message handling)
npx jest src/services/__tests__/notifications.test.ts

# Network status indicator (render, hidden state)
npx jest src/components/__tests__/NetworkStatusIndicator.test.tsx
```

---

## Error boundary & telemetry safety

### Production error safety

`ErrorBoundary` gates all error detail output behind `process.env.NODE_ENV === "development"`:

- In **development**: error message, error class, and component stack are visible
- In **production**: only "Something went wrong" and the two action buttons are shown — no stack traces, no raw error objects

### Telemetry guard

Both Sentry configs initialise only when an explicit DSN is provided:

```js
// sentry.client.config.js
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, ... });
}

// sentry.server.config.js
if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, ... });
}
```

When the DSN variable is absent (CI, local dev without `.env`), `Sentry.init` is never called and no data leaves the process.

### `beforeSend` redaction (client)

`sentry.client.config.js` redacts before every event is sent:

| Pattern | Replacement |
|---|---|
| Sensitive key names (`password`, `token`, `secret`, `auth`, …) | `[REDACTED]` |
| Stellar addresses (`G` + 55 alphanum) | `G****[REDACTED]` |
| Stellar secret keys (`S` + 55 alphanum) | `S****[REDACTED_SECRET]` |
| JWT tokens (`eyJ…`) | `[REDACTED_JWT]` |
| Hex strings 32–64 chars (API keys) | `[REDACTED_KEY]` |
| Email addresses | `****@[REDACTED]` |
| User object | Only `id` is forwarded; all other fields are stripped |

### Running ErrorBoundary tests

```bash
cd frontend
npx vitest run src/components/__tests__/ErrorBoundary.test.tsx
```

Covers: normal render, error capture, `onError` callback, dev vs production display, `role="alert"` announcement, telemetry guard (DSN absent), production no-raw-details, recovery flow, accessibility, nested boundaries, sequential errors.

---

## Folder coverage

| Folder | Changes in this PR |
|---|---|
| `frontend/src/components/` | `ErrorBoundary.tsx` — `role="alert"`, `aria-hidden` on icons, focus rings |
| `frontend/src/components/notifications/` | `NotificationList.tsx` — closed `</article>` bug, `BellOff aria-hidden`, unread dot `role="status"`, removed unused state, `role="list"` wrapper, `aria-label` on actions trigger |
| `frontend/src/components/ui/` | `button.tsx` — `loading`/`loadingText`/`aria-busy`; `badge.tsx` — touch target |
| `frontend/src/components/__tests__/` | `accessibility.a11y.test.tsx` — touch-target assertion fixed; `accessibility.test.tsx` — existing; `ErrorBoundary.test.tsx` — `role="alert"` + telemetry guard tests |
| `frontend/src/__tests__/` | `pwa.test.tsx` — correct button label, `addOfflineListener` test, better cache test |
| `frontend/src/lib/` | `pwa.ts` — SSR guard, correct `getSWStatus` logic |
| `frontend/` | `sentry.client.config.js` — DSN guard, tighter key regex; `sentry.server.config.js` — DSN guard |
| `mobile/src/services/` | `notifications.ts` — try/catch, permission fallback, payload guard, exported constant |
| `mobile/src/services/__tests__/` | `notifications.test.ts` — 10 tests across iOS/Android, all permission paths, message handling |
| `docs/` | `accessibility-pwa.md` — this file |
