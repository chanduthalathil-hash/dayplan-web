# DayPlan — Web

Browser build of [DayPlan](https://github.com/chanduthalathil-hash/dayplan-desktop). Same UI and the same account, synced through [dayplan-server](https://github.com/chanduthalathil-hash/dayplan-server) — log in with your desktop app's email/password and your plan, habits, goals and work tasks appear here too.

This is a static copy of `dayplan-desktop/renderer/{index.html,desktop.js}` with no Electron dependency:

- No account / not logged in → data is kept in this browser's `localStorage` only (per browser, per device).
- Logged in → synced privately through the Render/Turso backend, same as the desktop app.
- Desktop-only features (tray, global hotkeys, mini focus widget, auto screen-time, auto-update) simply don't appear — `desktop.js` already degrades to a "browser fallback" mode when `window.dayplan` isn't present.

## Updating this site

Whenever `dayplan-desktop/renderer/index.html` or `desktop.js` change, copy them over here and push:

```
cp ../dayplan-desktop/renderer/index.html .
cp ../dayplan-desktop/renderer/desktop.js .
git add -A && git commit -m "Sync from dayplan-desktop" && git push
```

Served via GitHub Pages — https://chanduthalathil-hash.github.io/dayplan-web/
