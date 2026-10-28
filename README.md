# Pocket DevTools v5 (Bookmarklet Dev Tools — Improved Fork)

**Web developer tools as a bookmarklet — rebuilt from scratch, mobile-first, optimized for Android Firefox.**

This is an improved fork of [DeveloperExotic/Bookmarklet-Dev-Tools](https://github.com/DeveloperExotic/Bookmarklet-Dev-Tools).
The original `src.js` shipped as obfuscated code and was view-only in several places; this fork is a clean,
readable rewrite with a much bigger feature set, a touch-friendly bottom-sheet UI, and full editing capabilities.

It ships in **two editions** from the same source:

| Edition | File | Best for |
|---|---|---|
| **Bookmarklet** | `src.js` (via jsDelivr CDN) | On-demand use on any page — zero install |
| **Userscript** | `pocket-devtools.user.js` | Always-on dev tools that **survive page refresh** |

```
javascript:(function(){if(window.__POCKET_DEVTOOLS__){window.__POCKET_DEVTOOLS__.toggle();return}var s=document.createElement('script');s.src='https://cdn.jsdelivr.net/gh/shalosi00/Bookmarklet-Dev-Tools@main/src.js';s.onerror=function(){alert('Pocket DevTools failed to load (offline or CSP-blocked)')};(document.head||document.documentElement).appendChild(s);})();
```

(Tapping the bookmarklet again toggles the panel — it no longer needs to reload the script.)

## Install — Firefox for Android

Firefox strips `javascript:` URLs pasted into the address bar, so use the bookmark method:

1. Open **any** page and tap the **⋮ menu → Bookmark** (star icon) → **Add**.
2. Go to **Bookmarks** (menu → Bookmarks), **long-press** the new bookmark → **Edit**.
3. Change the **URL** to the bookmarklet code above (keep the `javascript:` prefix). Rename it to e.g. `DevTools`.
4. Visit any page, open **Bookmarks**, tap **DevTools** — the panel slides up from the bottom edge.

**Desktop browsers:** right-click the bookmarks bar → *Add page*, paste the code as the URL.

**Tip:** The floating round button re-opens the panel after you close it — no need to re-tap the bookmark while on the same page.

## Surviving a page refresh

A bookmarklet is **wiped by every refresh** — the browser destroys all JavaScript on reload, and by security
 design only the page's own code (or an extension) may auto-run at load. Back/forward navigation often
 survives (bfcache); refresh never does. Pocket DevTools offers two answers:

**Option A — re-tap, everything restored (bookmarklet edition, zero setup).**
All state is persisted for you: theme, panel height, text size, capture limits, last-open tab,
network blocklist, snippets, plugins and console history. One tap on the bookmark reopens the
tools exactly where you left them. The settings write is flushed on `pagehide`, so even an
instant refresh right after switching tabs loses nothing.

**Option B — never disappears (userscript edition, one-time 2-minute setup).**
Firefox for Android supports userscript managers. Install one, add `pocket-devtools.user.js`,
and the tools load on **every page automatically**:

1. Install **Tampermonkey** or **Violentmonkey** from addons.mozilla.org (both work on Firefox for Android).
2. Create a new userscript and paste the full contents of
   [`pocket-devtools.user.js`](https://github.com/shalosi00/Bookmarklet-Dev-Tools/blob/main/pocket-devtools.user.js)
   (or point the manager at its raw GitHub URL and let it track updates).
3. Done. Reload any page — the floating button is already there, and the panel reopens
   by itself if it was open before the refresh.

The userscript edition also gains something the bookmarklet can **never** do: capture starts at
`document-start`, *before* the page's own scripts run — so startup errors, early network requests
and warnings that happen before you could possibly tap a bookmark are all recorded.

Prefer it on some sites only? **Settings → Persistence** lets you turn auto-injection off, keep the
panel closed until summoned, or list hosts where zero Pocket DevTools code should run
(no hooks, no button — nothing). Sheet state is remembered per tab session: open stays open across
refreshes, closed stays closed.

## Panels (13)

| Panel | What it does |
|---|---|
| **Console** | Full console API capture: `log/info/warn/error/debug/table/time/timeEnd/timeLog/count/countReset/group/groupCollapsed/groupEnd/trace/dir/assert/clear`, plus uncaught errors and unhandled promise rejections. Expandable **object inspector** (arrays/objects/Maps/Sets to any depth), `console.table` grid rendering, filter chips + text search, command history (▲/▼ keys or buttons), multi-line editor, duplicate-message counters. |
| **Elements** | Touch-friendly inspect mode: drag over the page to highlight, release to select. Collapsible DOM tree, breadcrumb path, **$0–$4 selection history**, attribute editor (add/edit/delete), class toggling, **event-listener list** (captured via patched `addEventListener`), **XPath of the selected element**, **Edit HTML**, scroll-to, copy HTML / CSS selector, delete element. |
| **Styles** | Box-model diagram with live numbers, grouped computed-style browser with search, live inline-CSS editor, page color swatches (tap to copy), stylesheet enable/disable, and a live "custom page CSS" editor. |
| **Network** | Hooks `XMLHttpRequest`, `fetch` and `WebSocket`. Method/status/time/size per row, detail view with request/response headers and bodies, JSON pretty-print, copy URL, **copy as cURL**, pause capture, **request blocker** (glob patterns, persisted), **HAR export**. |
| **API** | Built-in **REST client**: method + URL + headers + body builder, JSON formatting, saved requests, request history, response inspector with headers/body/download, copy as cURL. Sent through the page's fetch so requests also appear in the Network panel. |
| **Page** | Page overview (title/description/canonical/lang/charset/viewport/robots…), plus audits: **headings outline**, **images** (missing `alt` flagged), **links** (internal/external/rel-noopener), and **tech detection** (frameworks, analytics, meta generators). |
| **Sources** | View / copy / download the page HTML, every stylesheet and every script, with line numbers and lightweight syntax highlighting. |
| **Storage** | Full **editor** for cookies, `localStorage` and `sessionStorage`: add, edit, delete, clear, copy all. |
| **Perf** | Navigation-timing waterfall (DNS/TCP/TLS/request/response/DOM), resource list with sizes and durations, **long-task observer**, live FPS meter with sparkline, memory info where available. |
| **Toolkit** | **QR generator** (full ISO/IEC 18004 encoder, versions 1–10, EC L/M — verified against a QR decoder round-trip), **color converter** (hex/rgb/hsl/hsv/cmyk + **contrast checker**), **regex tester** with live matches and capture groups, **transformer** (Base64, URL-encode, JWT decode, JSON pretty/minify/validate/escape, HTML escape), **media queries** list. |
| **Utils** | Device info (viewport, DPR, touch points, UA…), persistent **snippet library** (built-ins + your own), and one-tap tools: disable CSS, outline elements, find broken images, clear storage, reset viewport zoom, color eyedropper (where supported). |
| **Plugins** | Run code, load plugins from a URL, or save plugins with **auto-run on load**. |
| **Settings** | 4 themes (**Dark, Light, AMOLED** pure black for OLED battery saving, **Auto**), panel height, text size, console cap, network body capture limit, FAB toggle, **persistence controls** (auto-inject, open-on-load, site exclusions). Your last-open tab is remembered. |

## Console helpers installed on the page

```js
$('#sel')            // querySelector          $$('.sel')     // querySelectorAll -> array
$x('//xpath')        // XPath snapshot         $_             // last command result
$0 … $4              // last five inspected elements
copy(value)          // copy to clipboard      clear()        // clear the console
inspect(el)          // jump to Elements       keys(o)/values(o)
getListeners(el)     // captured listeners     monitorEvents(el, [types])
pdt                  // the public API object
```

## What's new in v5.1 — refresh survival

- **Userscript edition** (`pocket-devtools.user.js`): runs at `document-start` on every page via
  Tampermonkey/Violentmonkey — the tools, their capture and the open panel **survive a page refresh**
- **Early capture**: console output, uncaught errors and network requests are recorded *before* the
  DOM is ready — impossible with a bookmarklet
- Sheet state persisted per tab session (open stays open across reloads; closed stays closed)
- Settings are flushed on `pagehide`, so a refresh immediately after a change loses nothing
- **Site exclusion list** + auto-inject toggle in Settings → Persistence; excluded sites run zero code
- Bookmarklet now toggles the panel on re-tap instead of re-loading the script
- `__POCKET_DEVTOOLS__.edition` reports the running build flavour

## What's new in v5

- **Full console API emulation** (table/timers/counters/groups/trace/assert) with an expandable object inspector
- **Console command helpers** — `$ $$ $x $_ $0–$4 copy inspect keys values getListeners monitorEvents`
- **API tester panel** — a mini REST client with saved requests and cURL export
- **Page audits** — headings outline, image alt-check, link classification, tech detection
- **Toolkit** — QR generator (own ISO 18004 encoder), color converter with WCAG contrast, regex tester, JWT/Base64/JSON transformer, media queries
- **Network blocker + HAR export** — block URLs by pattern (persisted), export captured traffic as a standard `.har` file
- **Event listener capture + XPath + Edit HTML** in Elements
- Long-task observer in Perf; last-tab persistence; many bug fixes over v4

## What's new vs. the original

- Readable, modular source (`src/01-header.js` … `src/19-footer.js`) instead of obfuscated output — build with `node build.js`
- UI rendered inside a **closed shadow root**, so page CSS can't break the tools and vice versa
- **Storage editors** (cookies / localStorage / sessionStorage were view-only before)
- **Performance panel** (timing waterfall, resource list, FPS meter)
- **Utilities panel** (snippets, quick tools, device info)
- **Box-model diagram, computed styles, color picker, live CSS editing** (new Styles panel)
- Full-screen multi-line console editor, history navigation, duplicate collapsing
- **Copy as cURL**, request/response bodies with JSON pretty-print in Network
- Error trapping for uncaught exceptions and unhandled rejections
- Bottom-sheet layout with drag-to-resize handle, horizontally scrolling tabs, ≥34px touch targets
- Public API: `window.__POCKET_DEVTOOLS__`

## API (for console/snippets/plugins)

```js
__POCKET_DEVTOOLS__.toggle()           // show/hide panel
__POCKET_DEVTOOLS__.select(el)         // inspect an element programmatically
__POCKET_DEVTOOLS__.tab('network')     // switch to a tab
__POCKET_DEVTOOLS__.run('1+1')         // eval in page scope -> {ok, value}
__POCKET_DEVTOOLS__.entries()          // captured console entries
__POCKET_DEVTOOLS__.requests()         // captured network requests
__POCKET_DEVTOOLS__.listeners(el)      // captured event listeners for el
__POCKET_DEVTOOLS__.har()              // HAR 1.2 object of captured traffic
__POCKET_DEVTOOLS__.block('*.ads.*')   // add a network block rule
__POCKET_DEVTOOLS__.unblockAll()       // remove all block rules
```

## Build from source

```
node build.js          # concatenates src/*.js -> src.readable.js + src.js + pocket-devtools.user.js
node build.js --minify # also minifies (requires terser)
```

Local test pages live in `test/` (`index.html` manual, `e2e.html` + `e2e2.html` + `e2e3.html` automated
suites — 86 automated end-to-end checks covering every panel, plus `e2e3.html` which simulates a
userscript manager loading the core at document-start in three phases: deferred boot + early capture,
refresh restore, and site exclusion; `us.html` verifies the shipped userscript artifact itself).

## Known limitations

- **Bookmarklet edition only:** sites with a strict CSP that blocks `cdn.jsdelivr.net` or inline `<style>` cannot load the tools (same as the original). The userscript edition is injected by the manager itself and works on far more pages; if a specific site still blocks it, enable the manager's experimental/instant injection mode.
- **Bookmarklet edition only:** requests that completed **before** the bookmarklet was activated are not visible — the userscript edition sees everything from `document-start`.
- `HttpOnly` cookies are invisible to JavaScript (by browser design).
- Network response headers are limited by CORS on cross-origin requests.
- Operates in the top-level frame only (`@noframes`).

## License

MIT — see [LICENSE](LICENSE). Based on the concept of [DeveloperExotic/Bookmarklet-Dev-Tools](https://github.com/DeveloperExotic/Bookmarklet-Dev-Tools); rewritten from scratch.
