# Pocket DevTools (Bookmarklet Dev Tools — Improved Fork)

**Web developer tools as a bookmarklet — rebuilt from scratch, mobile-first, optimized for Android Firefox.**

This is an improved fork of [DeveloperExotic/Bookmarklet-Dev-Tools](https://github.com/DeveloperExotic/Bookmarklet-Dev-Tools).
The original `src.js` shipped as obfuscated code and was view-only in several places; this fork is a clean,
readable rewrite with a bigger feature set, a touch-friendly bottom-sheet UI, and full editing capabilities.

```
javascript:(function(){var s=document.createElement('script');s.src='https://cdn.jsdelivr.net/gh/shalosi00/Bookmarklet-Dev-Tools@main/src.js';(document.head||document.documentElement).appendChild(s);})();
```

## Install — Firefox for Android

Firefox strips `javascript:` URLs pasted into the address bar, so use the bookmark method:

1. Open **any** page and tap the **⋮ menu → Bookmark** (star icon) → **Add**.
2. Go to **Bookmarks** (menu → Bookmarks), **long-press** the new bookmark → **Edit**.
3. Change the **URL** to the bookmarklet code above (keep the `javascript:` prefix). Rename it to e.g. `DevTools`.
4. Visit any page, open **Bookmarks**, tap **DevTools** — the panel slides up from the bottom edge.

**Desktop browsers:** right-click the bookmarks bar → *Add page*, paste the code as the URL.

**Tip:** The floating round button re-opens the panel after you close it — no need to re-tap the bookmark while on the same page.

## Panels

| Panel | What it does |
|---|---|
| **Console** | Captures `log/info/warn/error/debug`, uncaught errors (`window.onerror`) and unhandled promise rejections. Filter chips + text search, command history (▲/▼), full-screen editor for multi-line code, duplicate-message counters. |
| **Elements** | Touch-friendly inspect mode: drag over the page to highlight, release to select. Collapsible DOM tree, breadcrumb path, attribute editor (add/edit/delete), class toggling, scroll-to, copy HTML / CSS selector, delete element. |
| **Styles** | Box-model diagram with live numbers, grouped computed-style browser with search, live inline-CSS editor, page color swatches (tap to copy), stylesheet enable/disable, and a live "custom page CSS" editor. |
| **Network** | Hooks `XMLHttpRequest`, `fetch` and `WebSocket`. Method/status/time/size per row, detail view with request/response headers and bodies, JSON pretty-print, copy URL, **copy as cURL**, pause capture. |
| **Sources** | View / copy / download the page HTML, every stylesheet and every script, with line numbers and lightweight syntax highlighting. |
| **Storage** | Full **editor** (not just viewer) for cookies, `localStorage` and `sessionStorage`: add, edit, delete, clear, copy all. |
| **Perf** | Navigation-timing waterfall (DNS/TCP/TLS/request/response/DOM), resource list with sizes and durations, live FPS meter with sparkline, memory info where available. |
| **Utils** | Device info (viewport, DPR, touch points, UA…), persistent **snippet library**, and one-tap tools: disable CSS, outline elements, find broken images, clear storage, reset viewport zoom. |
| **Plugins** | Run code, load plugins from a URL, or save plugins with **auto-run on load**. |
| **Settings** | 4 themes (**Dark, Light, AMOLED** pure black for OLED battery saving, **Auto**), panel height, text size, console cap, network body capture limit, FAB toggle. |

## What's new vs. the original

- Readable, modular source (`src/01-header.js` … `src/15-footer.js`) instead of obfuscated output — build with `node build.js`
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
```

## Build from source

```
node build.js          # concatenates src/*.js -> src.js
node build.js --minify # also minifies (requires terser)
```

A local test page lives in `test/index.html`.

## Known limitations

- Sites with a strict CSP that blocks `cdn.jsdelivr.net` or inline `<style>` cannot load the tools (same as the original).
- Requests that completed **before** the bookmarklet was activated are not visible — the hooks install at load time.
- `HttpOnly` cookies are invisible to JavaScript (by browser design).
- Network response headers are limited by CORS on cross-origin requests.
- Operates in the top-level frame only.

## License

MIT — see [LICENSE](LICENSE). Based on the concept of [DeveloperExotic/Bookmarklet-Dev-Tools](https://github.com/DeveloperExotic/Bookmarklet-Dev-Tools); rewritten from scratch.
