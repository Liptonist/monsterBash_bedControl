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

- `kyuugo/rooms/{roomIndex}/{beds|chairsIn|chairsOut}` — array of slot objects for each of the 4 fixed rooms (`ROOMS = ['本部','空海横','サーカス','茶堂']`, indexed 0-3). Each slot ("item") has: `localId` (1-based, fixed position within its room+kind), `patientId` (global, nullable), `status` (`empty|green|yellow|red`), `name`, `sym` (symptom), `waiting` (送迎待ち / pickup-wait flag), `enteredAt` (timestamp), `age`, `gender`.
- `kyuugo/globalPatientId` — a counter for assigning festival-wide sequential patient IDs (`P-###`), incremented via `runTransaction` to avoid collisions across concurrent editors.
- `kyuugo/discharged` — append-only-ish log of discharge records (pushed with `push()`), read by `discharged.html`.
- `kyuugo/discharged_trash` — soft-deleted discharge records; moving to/from trash is a manual `set` + `remove` pair (not atomic).

`index.html` mirrors this into an in-memory `rooms` array (`ROOMS.map(...)` of `{beds, chairsIn, chairsOut}`) via `onValue` listeners set up in `subscribeAll()`. Local state is optimistically mutated then pushed to Firebase — there's no offline queue despite the "オフライン中" banner text; edits made offline will simply fail silently (`.catch(e => console.warn(e))`) until reconnect fires the listeners again.

Legacy status values (`used`, `overtime`, `waiting`) are normalized to the current 4-state scheme (`empty/green/yellow/red`) via `LEGACY`/`normStatus()` for backward compatibility with older data still in the DB — don't remove this without checking production data.

## Key flows in `index.html`

- **Slot editing** (`openM` → `saveB`): clicking a bed/chair opens the modal (`#ovl`), pre-filled from the in-memory item. Saving assigns a new global `patientId` only when transitioning from empty (`wasEmpty && !b.patientId`), via the `globalPatientId` transaction. Typing a name also runs `sameNameToday()` (occupied slots across all rooms + everything currently in `kyuugo/discharged`, which the close-out empties, so it is "today"): matches show as a hint under the name field, and registering into an empty slot asks for confirmation first. It never blocks the save — same-name-different-person is a real case.
- **Checkout** (`checkoutB`): computes stay duration from entry/exit times, pushes a record to `kyuugo/discharged`, then resets the slot to empty.
- **Move** (`moveB`): transfers an occupied slot's data to an empty slot (possibly in another room/kind), clearing the source. The destination write and source-clear write happen together via a single multi-path `update()` (`pushItems`), so they always commit atomically — but the empty-check that picks the destination still reads local state before that write, so a race could theoretically double-occupy a destination between the empty-check and the write.
- **Resize** (`chgCnt`): grows/shrinks a room's bed/chair array (bounded 1–40) and rewrites the whole array via `pushCount`.

Room/kind/status labels and prefixes (`ROOMS`, `KIND_PREFIX`, `KIND_LABEL`, `SL`) are the single source of truth for display strings — update these constants rather than hardcoding labels elsewhere. `ROOMS` lives in `app-common.js` (every page imports it); the kind/status maps are per-page.

Shared list behaviour also lives in `app-common.js`: `normName`/`nameMatches`/`sameName` fold the ways staff write the same name (spaces between 姓 and 名, full/half width, hiragana vs katakana) so name search and the same-day duplicate check agree, and `sortRecords`/`nextSort`/`sortTh` drive the sortable table headers on `discharged.html` and `archives.html`. Blank values always sort last, and ties keep the incoming order (discharge-newest-first).

## Security rules

`database.rules.json` is the real access-control boundary — the in-page login flow (`requireAuth()` in `app-common.js`) is only there to give people a decent error message, since anyone can talk to the database directly with the public `apiKey`. Any change to what the app reads or writes has to be mirrored there, including new fields: the rules whitelist known children and reject unknown ones.

The rules are deployed by pasting the file into the Firebase console (there's no CI deploy). Before doing that, verify them locally — deploying broken rules locks every user out of a live first-aid station:

```bash
firebase emulators:start --only database --project monster-bash-test   # needs firebase-tools + Java
node tools/rules-test.mjs                                              # in another terminal
```

`tools/rules-test.mjs` checks both directions: that forbidden operations are denied, and that every real app flow (受け入れ・移動・退室・ゴミ箱・締め・ユーザー管理) still goes through. Add a case there when you change the rules.

## Conventions

- UI text and all data (patient names, symptoms) are Japanese; keep new UI strings consistent with the existing tone/terminology (e.g. 軽症/中等症/重症 for triage levels).
- No frameworks/bundlers — new features should stay as vanilla JS/CSS appended to the existing inline `<script>`/`<style>` blocks, consistent with the current dense, utility-class-driven CSS naming (`.item`, `.chair-item`, `.st-*`, `.sopt` etc.).
- Functions that need to be called from inline `onclick=""` handlers are explicitly attached with `window.fnName = fnName` at the bottom of the module script — follow this pattern for any new interactive handler.
