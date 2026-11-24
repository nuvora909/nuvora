# Study notes: what each reference taught, and where it went

Studied 2026-11-24 in the browser pane, by looking at each page and stepping through the post videos frame by frame.

## Inspora: "admin dashboard" (Divan Raj)
A dark user-management screen for a workspace called "maydin.co".
- **Shell:** near-black app with a slightly lighter sidebar. Workspace switcher at the top. Small-caps section labels (WORKSPACE / FINANCE / PEOPLE), icon + label nav items with pill count badges, and the active item on a rounded lighter tile. A storage meter card sits at the bottom of the sidebar.
- **Header:** breadcrumb pill ("Workspace / Users"), a large title, a grey stats line ("2,847 customers across 418 companies · 4 plans · synced 2 min ago"), and a notification bell with a salmon count badge.
- **Controls:** segmented pills (All users / Active / Invited), a rounded search field, a Filter pill, and a white primary pill ("Invite user").
- **Bento metrics:** a large pastel-blue hero card with a big thin numeral, a floating avatar cluster and a black "312 online now" pill. Next to it, a "Users by plan" bubble chart in pastel circles (beige, blue, pink, slate). Then compact dark stat cards with thin numerals, an avatar stack, and a tinted "5 expire soon" badge.
- **Table:** a rounded dark container with checkboxes, avatar + name + email, plan pills (one highlighted in pastel blue), status dots, a usage bar with session count, and relative "last seen" times. Table/Cards view toggle.

**Applied:** `/admin` uses this structure one-for-one, driven by real Nuvora data. Accounts, passes, regions, readings, kundlis, orders and revenue come from the database. Avatars are initials, because Nuvora stores no photos.

## Inspora: "dark/light mode toggle" (Zsolt Kacso)
A rounded-square knob slides along a recessed track. Night shows a pixel-art moon with a cool blue under-glow; day shows a pixel sun with a warm amber rim light on a white glossy knob. Between states the pixels scatter and re-form.

**Applied:** `theme-toggle.css` + `theme.js`. The knob is drawn with CSS, the moon and sun are 9×9 pixel grids, and each pixel gets a random scatter offset and delay as it changes. It works as an accessible `role="switch"`, honours reduced motion, crossfades the page with view transitions, and remembers the choice.

## Inspora: "DayDream Studio" (David)
Website for a design studio. Bright sky-blue gradient hero with soft clouds and faint prismatic lens-flare streaks. Glassy white pill buttons, small mono section labels ("[01] · ABOUT US", "EST 2026"), white page, light-grey rounded project cards, grey secondary headline text.

**Applied, as the day theme:** a pale sky page tint, white cards with soft blue-tinted shadows, a sky-gradient hero card with clouds and a prism streak, glossy blue primary buttons, and blue/lavender chart colours. The `[01] · OVERVIEW` mono eyebrow labels are used in both themes.

## RareUI (rareui.com)
A free set of animated **React + Motion** components, installed with the shadcn CLI. 31 components, including Animated Counter, Notification Bell, GitHub Activity (dot grid), and Proximity / Bounce / Hook sidebars.

**Not installed.** Nuvora's front end is plain HTML/JS served by FastAPI with no React or build step, so installing RareUI would mean adding a whole React toolchain. Instead, the ideas were rebuilt in plain JS/CSS:
- counters that tick up to their value
- a 26-week activity dot grid, switchable between readings, sign-ins, sign-ups and orders
- a notification bell that rings when something needs attention
- a tactile, collapsible sidebar

## Design Bookmark (designbookmark.com)
A directory of about 2,800 design tools. Takeaways: an inset rounded sidebar, a filter-chip row, and a floating search bar. These shaped the sidebar and filter pills.

## Notion: "Free portfolio templates PT.3"
A list of Framer portfolio templates (Mondragon, Mondragon 4, Nika Stern, Foldfolio) and two motionsites.ai prompts. These are editorial portfolio sites: huge display type, big media, playful 3D objects. Not used for the dashboard, which is a data tool, but worth keeping for a future marketing page.

## Main Nuvora app: decided 2026-11-24
Daydream became the main app's **day** theme, and a new **midnight-sky night** theme was built to match. The previous cream-and-plum "Astral Atelier" palette was retired; its layout, type and motion are unchanged. About 1,070 hardcoded colours were moved onto theme variables. See `design-reference/THEMES.md` for how the theme files work.
