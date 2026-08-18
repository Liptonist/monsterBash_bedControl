# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A real-time bed/chair occupancy tracker for a festival first-aid station (救護所), used at "Monster Bash". It's a two-page static web app with no backend of its own — Firebase Realtime Database is the backend, and the browser is the only client. There is no build system, no package manager, and no test suite; everything lives in two self-contained HTML files with inline `<style>` and a single inline `<script type="module">` per page that imports the Firebase SDK straight from `gstatic.com`.

- `index.html` — the main control screen: per-room grids of beds and chairs, a status/triage editor modal, and move/checkout flows.
- `discharged.html` — read-only-ish log of discharged patients, with filtering and a soft-delete "trash" (records move to `kyuugo/discharged_trash` instead of being hard-deleted, and can be restored).

## Running / testing

There is no build or test tooling. To work on this locally, just open `index.html` (and `discharged.html`) in a browser, e.g.:

```bash
python3 -m http.server 8000   # then open http://localhost:8000/index.html
```

Both pages talk live to the shared Firebase project defined inline in each file's `firebaseConfig` — there is no local/offline mode or emulator config, so manual testing against `index.html` writes real data other people may be viewing live. When verifying changes, prefer reasoning through the code paths and, if you do exercise the UI, be aware you're mutating shared production-like state (patient records, bed counts, discharge log/trash).

## Data model (Firebase Realtime Database)

All state lives under the `kyuugo/` root:

- `kyuugo/rooms/{roomIndex}/{beds|chairsIn|chairsOut}` — array of slot objects for each of the 4 fixed rooms (`ROOMS = ['本部','空海横','サーカス','茶堂']`, indexed 0-3). Each slot ("item") has: `localId` (1-based, fixed position within its room+kind), `patientId` (global, nullable), `status` (`empty|green|yellow|red`), `name`, `sym` (symptom), `waiting` (送迎待ち / pickup-wait flag), `companion` (付き添いあり / has-an-attendant flag), `enteredAt` (timestamp), `age`, `gender`.
- `kyuugo/globalPatientId` — a counter for assigning festival-wide sequential patient IDs (`P-###`), incremented via `runTransaction` to avoid collisions across concurrent editors.
- `kyuugo/discharged` — append-only-ish log of discharge records (pushed with `push()`), read by `discharged.html`.
- `kyuugo/discharged_trash` — soft-deleted discharge records; moving to/from trash is a manual `set` + `remove` pair (not atomic).

`index.html` mirrors this into an in-memory `rooms` array (`ROOMS.map(...)` of `{beds, chairsIn, chairsOut}`) via `onValue` listeners set up in `subscribeAll()`. Local state is optimistically mutated then pushed to Firebase — there's no offline queue despite the "オフライン中" banner text; edits made offline will simply fail silently (`.catch(e => console.warn(e))`) until reconnect fires the listeners again.

Legacy status values (`used`, `overtime`, `waiting`) are normalized to the current 4-state scheme (`empty/green/yellow/red`) via `LEGACY`/`normStatus()` for backward compatibility with older data still in the DB — don't remove this without checking production data.

## Key flows in `index.html`

- **Slot editing** (`openM` → `saveB`): clicking a bed/chair opens the modal (`#ovl`), pre-filled from the in-memory item. Saving assigns a new global `patientId` only when transitioning from empty (`wasEmpty && !b.patientId`), via the `globalPatientId` transaction. Typing a name also runs `sameNameToday()` (occupied slots across all rooms + everything currently in `kyuugo/discharged`, which the close-out empties, so it is "today"): matches show as a hint under the name field, and registering into an empty slot asks for confirmation first. It never blocks the save — same-name-different-person is a real case.
- **Checkout** (`checkoutB`): computes stay duration from entry/exit times, pushes a record to `kyuugo/discharged`, then resets the slot to empty.
- **Move** (`moveB`): transfers an occupied slot's data to an empty slot (possibly in another room/kind), clearing the source. The destination write and source-clear write happen together via a single multi-path `update()` (`pushItems`), so they always commit atomically — but the empty-check that picks the destination still reads local state before that write, so a race could theoretically double-occupy a destination between the empty-check and the write.
- **A slot that vanishes mid-edit**: the `−` on another device can delete the very slot an open modal is editing (the modal holds a position, `editCtx.idx`, and the `onValue` handler splices the local array). All three actions used to hit `if (!b) return` and do nothing at all, so the typed-in patient was silently unsaveable. `openM` now also stashes `editCtx.snap` (a copy of the item at open time), and each action recovers instead of dying: `saveB` delegates to `saveToNewSlot()`, which asks, appends one slot via `resizeTx(+1)`, repoints `editCtx.idx` at it (restoring `patientId`/`patientCode`/`enteredAt` from `snap`, so an already-registered patient does not get a second ID) and re-enters `saveB`; `checkoutB` still pushes the discharge record from `snap` and just skips the slot-clearing write; `moveB` writes the destination only. The kanji check runs before the slot check in `saveB` so a refused name cannot leave a restored-but-unused slot behind.
- **Resize** (`chgCnt`): grows/shrinks a room's bed/chair array (bounded 1–40) by rewriting the whole array inside a `runTransaction` on the array path. Shrinking drops slots from the end, so the transaction refuses (returns `undefined`, leaving `committed` false) when any slot about to disappear is still in use — `slotInUse` treats a slot as occupied on a non-`empty` status, a `patientId`, or a leftover name/symptom, which is also what greys out the `−` button in `cntCtrlHTML`. Doing the check inside the transaction is the point: the local state can be a moment stale, and a plain `set` of the whole array would delete a patient another device registered in the meantime. The transaction re-normalizes what the server holds (`normStatus` + `itemPayload` defaults) before writing it back, since legacy rows would otherwise fail the rules on the way out.

Room/kind/status labels and prefixes (`ROOMS`, `KIND_PREFIX`, `KIND_LABEL`, `SL`) are the single source of truth for display strings — update these constants rather than hardcoding labels elsewhere. `ROOMS` lives in `app-common.js` (every page imports it); the kind/status maps are per-page.

Shared list behaviour also lives in `app-common.js`: `fixName` is the write-side counterpart — it rewrites what staff typed into the house style (NFKC, single half-width space between 姓 and 名, hiragana→katakana — katakana is the house form, matching the direction `normName` folds; romaji is left alone; kanji can't be folded at all since a browser can't read it without a dictionary, so `hasKanji` rejects it instead — `saveB` blocks on it with an inline warning under `#fname`, while `checkoutB`/`moveB` deliberately don't, so pre-existing kanji records stay dischargeable) and is applied via `nameField()` in `index.html` on `change` and at every point that reads `#fname` (save/checkout/move), never on `input` (it would fight the IME). `normName`/`nameMatches`/`sameName` are the read side and fold the ways staff write the same name (spaces between 姓 and 名, full/half width, hiragana vs katakana) so name search and the same-day duplicate check agree — `index.html`'s `searchSlots` ORs `nameMatches` onto its plain substring match rather than replacing it, because that box also searches 症状, which is free text and may be kanji or kana; for the same reason its input is never rewritten by `fixName`. `discharged.html`'s name filter is the one search box that does apply the input rules (katakana on `change`, kanji refused — it drops the name predicate and warns instead of filtering); `archives.html` deliberately keeps kanji searchable, since the oldest records are the ones most likely to carry kanji names, and `sortRecords`/`nextSort`/`sortTh` drive the sortable table headers on `discharged.html` and `archives.html`. Blank values always sort last, and ties keep the incoming order (discharge-newest-first).

## Releasing

`APP_INFO.version` in `app-common.js` is the release number, and three things must move together, or the deploy breaks in ways that only show up for the first ten minutes:

1. bump `APP_INFO.version` and add a `CHANGELOG` entry;
2. update the `?v=` query on every page's `import … from './app-common.js?v=X.Y.Z'` (all five HTML files, keep them identical);
3. push to `main` — GitHub Pages serves HTML with `Cache-Control: max-age=600`, and `index.html` and `app-common.js` expire independently.

Step 2 is what makes step 3 safe. Without it, a browser can pair *new* HTML with a *cached old* `app-common.js`; if the new page imports an export the old file doesn't have, module resolution fails and the entire inline script never runs — the page renders but nothing works. The `?v=` query means new HTML always requests a URL no cache has seen.

`watchAppVersion()` (called from `requireAuth`, so every page gets it) subscribes to `kyuugo/appVersion` and shows a top bar when the DB carries a higher version than the loaded one. Nobody publishes that value by hand: whichever client loads a newer version writes it (`newerThan` compares numerically, so an old client never overwrites a newer value). It auto-reloads only when the page is idle — `busyNow()` refuses while writes are pending, an overlay is open, a field is focused, or the user touched the page in the last minute — and at most once per target version (`sessionStorage`), since a still-cached HTML would otherwise reload in a loop.

## Security rules

`database.rules.json` is the real access-control boundary — the in-page login flow (`requireAuth()` in `app-common.js`) is only there to give people a decent error message, since anyone can talk to the database directly with the public `apiKey`. Any change to what the app reads or writes has to be mirrored there, including new fields: the rules whitelist known children and reject unknown ones.

The rules are deployed by pasting the file into the Firebase console (there's no CI deploy). Before doing that, verify them locally — deploying broken rules locks every user out of a live first-aid station:

```bash
firebase emulators:start --only database --project monster-bash-test   # needs firebase-tools + Java
node tools/rules-test.mjs                                              # in another terminal
```

`kyuugo/auditLog` is append-only *by rule* — `$entry` requires `!data.exists() && newData.exists()`, so no client (admin included) can edit or delete an entry; pruning it is a console export/import job, and `tools/audit-split.mjs` does the offline half of that (splits an exported JSON into a full backup, a keep-set, and a removed-set; `KEEP_ACTIONS` is the list of user-management actions to retain). It never touches the database.

`tools/rules-test.mjs` checks both directions: that forbidden operations are denied, and that every real app flow (受け入れ・移動・退室・ゴミ箱・締め・ユーザー管理) still goes through. Add a case there when you change the rules.

## Conventions

- UI text and all data (patient names, symptoms) are Japanese; keep new UI strings consistent with the existing tone/terminology (e.g. 軽症/中等症/重症 for triage levels).
- No frameworks/bundlers — new features should stay as vanilla JS/CSS appended to the existing inline `<script>`/`<style>` blocks, consistent with the current dense, utility-class-driven CSS naming (`.item`, `.chair-item`, `.st-*`, `.sopt` etc.).
- Functions that need to be called from inline `onclick=""` handlers are explicitly attached with `window.fnName = fnName` at the bottom of the module script — follow this pattern for any new interactive handler.
