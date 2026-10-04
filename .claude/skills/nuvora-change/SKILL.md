---
name: nuvora-change
description: Make any change the Nuvora owner asks for (website text or sections, programs, prices, batches, materials, portal or database behaviour) end to end, then test it three times, commit, push and report in plain words. Use whenever the owner asks to change, add, remove, fix or update anything in Nuvora.
---

# Make a change for the Nuvora owner

The owner is not a developer. They describe what they want in everyday words. You do everything else.

1. **Restate the change.** Say it back in one sentence. If a fact the site would publish is unknown (a price, a person, a date, a policy), ask for it instead of inventing it.
2. **Decide where it belongs.** Use the table in `CLAUDE.md`.
   - Day-to-day operations (create a batch, record a payment, pause or restore access, upload a PDF, seat requests) are done in the portal's admin area. Walk the owner through `docs/admin-guide.md` unless they ask you to do it in code.
3. **Make the change.**
   - Keep the honesty, video and accessibility rules in `CLAUDE.md`.
   - Check the result in the running site (`npm run dev`) at 1280 and 390 wide, in light and dark mode.
4. **Add or update tests** for the new behaviour.
5. **Run the suites.**
   - Run `node tests/run-3x.mjs` until all three runs pass. Then run `node tests/sabotage.mjs`.
   - If something fails, fix the cause and run again.
6. **Commit and push.**
   - Stage only the files you changed and commit with the trailer from `CLAUDE.md`.
   - Push to `origin`. After go-live, Cloudflare Pages deploys the website from GitHub automatically.
7. **Report in plain words.** Say what changed, where to see it, what was tested (with pass counts), and anything the owner still needs to decide.
