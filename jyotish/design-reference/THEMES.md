# Nuvora day and night themes

The main app and the admin dashboard share one theme choice. **Day** is Daydream: open sky, white glass, glossy sky-blue buttons, navy ink. **Night** is a midnight sky: navy glass, moonlight text, starlight gold, periwinkle buttons.

## How a page picks its theme
1. A one-line script in `<head>` reads `localStorage["nuvora-theme"]`. With no saved choice it follows the OS setting (`prefers-color-scheme`). It then sets `data-theme="light"` or `"dark"` on `<html>` before first paint.
2. `theme.js` turns every `<button data-theme-toggle>` into the pixel sun/moon switch, saves the visitor's choice, and keeps following the OS until they pick one.

## Files (in `server/static/`)
| File | What it is |
|---|---|
| `theme-palette.css` | **Generated.** About 670 `--p-*` colour variables, with a day value under `:root, [data-theme="light"]` and a night value under `[data-theme="dark"]`. |
| `theme-sky.css` | **Hand-tuned.** Touches a colour swap can't express: white text on blue buttons, the cloud bank and prism streak in the day hero, the stars at night, frosted day overlays, and the floating toggle for signed-out visitors. |
| `design-tokens.css` | Semantic tokens used by tarot, the kundli chart and `index.html`. The `[data-theme="light"]` block is the Daydream version. |
| `theme.js`, `theme-toggle.css` | The toggle and the saved choice. Shared with `/admin`. |
| `experience.css`, `account.css`, `reports.css`, inline `<style>` in `index.html` | Every colour now points at a `var(--p-…)` variable instead of a hardcoded value. |

## Changing colours
- **Tweak one colour in one theme:** find its `--p-…` variable in the stylesheet, then edit that variable's day or night value in `theme-palette.css`.
- **Restyle a component for one theme:** add a `[data-theme="light"] .thing { … }` or `[data-theme="dark"] .thing { … }` rule to `theme-sky.css`.
- **New CSS:** reuse existing `--p-*` or design-token variables, or write it as two theme rules. Don't add bare hex colours, or that part won't follow the theme.

## The migration scripts (one-off)
`theme_convert.py` built the palette. It sorts each original colour by family (paper, ink, lime, coral, …) and by role (text, surface, border, shadow, highlight), then derives the day and night values. `theme_wire.py` adds the loader, stylesheets, toggles and starfield colours to `index.html`. `theme_rebuild.sh` runs both, starting from the originals in `pre-theme-backup/`.

**Warning:** `theme_rebuild.sh` copies the pre-theme originals back over `experience.css`, `account.css`, `reports.css` and `index.html` before converting them. Any edits made to those files after 2026-11-24 would be lost. Treat it as a record of how the migration was done. Only rerun it if you first move your newer edits into the backup copies.

To undo the theme work entirely, copy the files in `pre-theme-backup/` back into `server/static/`.
