# Breedhaven: villa free-roam implementation handoff

**Implementer:** GPT Sol  
**Deliverable:** A working editor/player implementation and revised Breedhaven project data, with author-owned adult-content placeholders.  
**Status:** In implementation. Phases are tracked in Section 12. The concrete defaults below resolve remaining implementation choices.

## 1. Product intent

The villa is the final reward for Chapter 5, which closes Episode 1. Its purpose is to let the player build and enjoy a household of the women whose relationships they pursued. It should provide a satisfying harem collection and relationship hub, with room restoration, invitations, existing private scenes, and accessible replay.

After the initial unlock phase, the player can remain in free roam to finish household goals and enjoy unlocked content. Completing the required milestones makes the Episode 1 finale available. **Only an explicit player action starts that finale and the introduction of the other nations.** Sleeping, finishing a scene, completing construction, and meeting the final requirement must never trigger it automatically.

This is a bounded Episode 1 expansion. Prioritize reuse and clear progression. Do not turn the villa into an endless management simulation or commission a new illustrated scene for every interaction.

## 2. Required reading and current files

Read the applicable repository instructions before editing, including `Editor/AGENTS.md` and the Player instructions present in the checkout. Read the following project guidance:

- `Editor/data/projects/breedhaven/project.md`
- `Editor/data/projects/breedhaven/writing-notes.md`
- `Editor/src/main/ai/prompts/assistant.md`
- The linked character codex entries under `Editor/data/codex/`.
- `MINIGAMES.md`, which documents the recent file-based minigame module refactor.

Relevant authored story and data:

| File | Responsibility |
| --- | --- |
| `Editor/data/projects/breedhaven/chapter5/villa-days.ink` | Day/phase progression, staff story choices, evening hub, sleep, last morning, finale |
| `Editor/data/projects/breedhaven/chapter5/villa.ink` | Villa entry and scene-result dispatch, resident scenes |
| `Editor/data/projects/breedhaven/chapter5/villa-staff.ink` | Tamsin and Isolde's story beats and private room scenes |
| `Editor/data/projects/breedhaven/chapter5/shared-court-days.ink` | Shared-relationship interludes; also inspect other shared-court files |
| `Editor/data/projects/breedhaven/chapter5/epilogue.ink` | Episode ending and wider-world reveal |
| `Editor/data/projects/breedhaven/minigames.json` | `consort_villa`: rooms, residents, calendar, scene gates, tutorial, economy |
| `Editor/data/projects/breedhaven/stats.json` and `npcs.json` | Authored variables and cast state |
| `Editor/data/projects/breedhaven/ink/state.ink` | Generated declarations; regenerate through `renderStateInk`, never hand-edit |
| `Editor/data/projects/breedhaven/media.json` and `gallery.json` | Existing asset references and image gallery metadata |

Relevant source modules:

- `Editor/src/shared/bundle/minigame/estate/estate.ts`: estate state, calendar, settlement, rooms, scene eligibility.
- `Editor/src/shared/bundle/minigame/estate/data.ts`: defaults and parsing.
- `Editor/src/shared/bundle/minigame/estate/check.editor.ts`: authoring validation.
- `Editor/src/renderer/src/minigame/estate/`: estate authoring controls.
- `Player/src/minigame/estate/EstateScene.ts` and `EstateUI.ts`: villa player UI.
- `Player/src/state/GameState.ts`, `Player/src/scenes/VNScene.ts`, and `Player/src/narrative/StoryEngine.ts`: narrative execution and presentation.
- `Player/src/save/SaveManager.ts`, `Player/src/gallery/GalleryUnlocks.ts`, and `Player/src/achievements/AchievementManager.ts`: persistent side effects relevant to replay.
- `Player/scripts/sync-spec.mjs`: copies the shared bundle spec; do not edit its vendored output directly.

Inspect the current files rather than assuming this inventory is exhaustive. Preserve the per-minigame module structure. New estate features belong in the estate modules, not a new hardcoded switch in app startup.

The real project under `Editor/data/` is gitignored user content. Back up files before changing them, and include their changes in the delivery report even if Git does not list them. Preserve existing unrelated work in this checkout.

## 3. Current behavior that must change

At the time of this handoff:

- `villa_day` is the story's authoritative clock. The villa uses `villa_phase`, `villa_settled`, and the estate ledger stored in Ink.
- Day 9 routes into `villa_last_morning`, which offers management and `Receive the court`, without a normal continuing day loop.
- The estate calendar declares `lastDay: 9` and `lastWorkday: 8`. Removing only the story's Day 9 redirect would therefore leave the player unable to keep earning.
- `villa_finale` marks the phase `done` and goes directly to `chapter5_epilogue`.
- The epilogue contains a fixed nine-day chronology. That needs a continuity edit when the player can wait indefinitely.
- Resident scenes currently use result knots and boolean gates. The image gallery is not a narrative-scene replay system.
- Estate state includes `seen`, but inspect when it is updated before using it as proof that a scene was completed. Launching a scene must not count as completing it.

### Preserve the latest staff story revision

Tamsin and Isolde now make the initial romance/friendship decision in **beat two**. Accepting opens the first private visit. The romantic third beat follows that first encounter and decides whether the relationship continues. Friendship branches must remain coherent and must not unlock intimate visits.

Current relevant gates:

- Tamsin's romantic third beat waits for `villa_tamsin_ordinary`.
- Isolde's romantic third beat waits for `villa_isolde_night`.
- `*_open` enables the first private visit.
- `*_settled` is now enabled when the ongoing romance is accepted at beat three; it is not a friendship flag.
- Initial rejection and later breakup keep both private-visit flags false.
- The compatibility name `villa_tamsin_night` forwards to `villa_tamsin_ordinary`.

Do not restore the old first-confession-at-beat-three structure or the old friendship/settled behavior.

## 4. Play structure and finale readiness

### Phase A: initial villa days

Keep the existing arrival, tutorial, early events, and paced relationship opportunities. Preserve the current once-per-day earnings and once-only story events. The first eight days still introduce the household, but no unfinished optional content expires when that period ends.

### Phase B: free roam

**Default:** beginning on Day 9, the ordinary morning/day/evening/sleep loop continues. Introduce free roam once with a short Isolde conversation using existing art. Explain that the household can finish its preparations and arrange the formal reception when Kael is ready.

- Display `Day N`, not a countdown that becomes negative.
- Sleeping advances the day and makes the next day's commissions available.
- Keep one substantial daytime activity per day, with evening management and visits following existing timing conventions.
- Continue stipend and commission income. Remove the workday cutoff for this project without removing support for finite calendars in other estate configurations.
- Previously missed staff beats and deferred shared-relationship decisions remain reachable. Audit upper-day limits such as `villa_day < 9`; preserve deliberate minimum-day and different-day pacing checks.
- Do not repeat the Day 5 complication, Day 8 warning, tutorial, arrival scenes, or other one-time events every subsequent day.
- No new upkeep drain, affection decay, daily attendance penalty, or random deadline.

### Phase C: player-selected finale

Implement these configurable default readiness requirements:

1. The initial eight-day introduction has elapsed.
2. Tamsin's and Isolde's rooms are restored, and both staff arcs have reached their third-beat aftermath. Friendship resolutions count fully; intimacy is not a required ending condition.
3. Two additional route-eligible residents have been invited and assigned valid rooms. Existing invitations count. Do not count the two staff again.

Audit reachability across the existing route combinations. If a route genuinely offers fewer than two eligible non-staff residents, require the number actually available on that route. Do not require a woman excluded by earlier story choices, and do not silently treat everyone as eligible. Keep the threshold in authored configuration so it is easy to tune.

The reception hall already starts active; do not invent a new paid reception-hall restoration just to satisfy a goal. Full restoration, every resident, every romance, every scene, and the new author-content placeholders are **optional completion goals**.

Once readiness is achieved:

- Announce it once with existing Isolde art.
- Keep a visible `Receive the court` action in an appropriate hub. Show unmet requirements before readiness rather than hiding all information.
- Selecting it presents one concise final choice: `Begin finale` or `Stay at the villa`. Clearly explain that the first option starts Episode 1's ending.
- Make a normal pre-finale checkpoint/autosave outside replay mode.
- Preserve the current reception-to-epilogue sequence and the existing nations/lore. Do not write Episode 2 or introduce a second competing finale.
- Edit time-sensitive epilogue wording so the proof may have arrived earlier and the council meeting occurs now. Free-roam days should not require a new pregnancy/growth simulation.

Readiness must survive saving and loading. If stored, make it an idempotent milestone; if derived, ensure later harmless changes cannot unexpectedly retract an already announced ending opportunity.

## 5. Gameplay features in scope

### A. Household goals

Add a compact `Goals` view within the villa UI. Prefer a data-driven extension of the estate configuration and its editor controls over a project-specific list embedded in Phaser.

Each goal needs a stable id, short title, explanatory text, prerequisites, completion condition, and required/optional classification. Reuse existing condition evaluation where suitable; extend it narrowly if room ownership or estate membership cannot be represented.

Example goals, linked to actual state:

- Restore Tamsin's chamber.
- Restore Isolde's office.
- Finish an afternoon with Tamsin.
- Follow up with Isolde.
- Invite two additional residents.
- Prepare for the reception.
- Optional: restore every available room.
- Optional: complete the available resident stories.

Show actionable lock reasons: a missing room, an unmet relationship step, or an invitation requirement. Do not reveal intimate scene descriptions or unavailable route outcomes merely to explain a lock. Distinguish unavailable-by-route content from unfinished available content; do not present an impossible completion percentage.

Use current state as the source of truth. Opening a goal must not grant rewards, increment progress, or reapply NPC changes. Do not add a second currency or a separate reward payout for every checkbox.

### B. Room and invitation rewards

Make the existing benefits visible before spending: who can live in a room and what class of visit it supports. Preserve exclusive assignments, shared-room rules, invitation eligibility, and stable media ids.

Use the current room art. Do not introduce a decorative upgrade tree, alternative artwork for every furniture choice, or new animated construction sequences. A restoration can unlock existing content or a text-and-sprite conversation.

### C. Resident menus

Use a small, consistent set of actions in the resident's room:

- `Spend time`: available first-time story scenes, with understandable requirements.
- `Talk`: inexpensive everyday conversation using existing room art and sprites.
- `Memories`: completed, replayable narrative scenes.

Existing welcome scenes and the one or two already-authored extra scenes remain each invited woman's core content package. Tamsin and Isolde retain their longer central arcs. Do not invent another multi-beat romance arc for every resident.

For ordinary conversation, write at most **three short exchanges per resident**, roughly 2–5 text beats each: a welcome/settling-in exchange, a post-visit acknowledgment, and an ordinary household exchange. Reuse variants and conditions where possible. Only acknowledge events that actually happened on that save. Friendship versions must not assume a romance.

### D. Narrative replay

Replaying a memory must not change the live playthrough's clock, money, ledger, relationships, choices, visit counts, goals, completion markers, or narrative location.

Implement an isolated replay context, with a guaranteed exit back to the originating resident menu. Capture any entry context necessary for the scene to replay coherently; do not simply jump the live Ink instance into the knot and hope to undo the changes afterward.

Important implementation traps:

- Ink state alone is not the whole player state. Account for scene presentation, audio, background/animation cleanup, and state-manager references.
- `SaveManager` and `GalleryUnlocks` currently have module-level state. Creating another `GameState` does not automatically isolate them.
- Disable replay-originated autosaves, manual/quick saves, achievements, gallery unlocks, and permanent completion writes. Keep save/load UI from exporting transient replay state.
- Replaying must not enter the live villa minigame at the scene's normal return divert. Use an explicit boundary or narrowly scoped replay return handling.
- Close/cancel/error paths must restore normal play. An application restart must load the last live save, never a transient replay.
- First-time completion unlocks a memory once. Opening a scene, visiting its guard, or viewing an unfinished placeholder is not completion.

Audit all proposed replay scenes and list unsupported shapes explicitly during implementation. The required initial replay set is the existing resident visit scenes, not every branch in the entire game. Preserve scene ids and aliases so earlier completed content can be recognized when reliable evidence exists in old saves.

## 6. Art budget and author-owned adult content

**Write no new explicit sexual prose.** Preserve the author's existing explicit scene bodies. Programmatic routing, scene boundaries, metadata, and non-explicit setup/aftermath may be adjusted when necessary for the feature, with a clear change report.

All core gameplay must work with existing assets. Do not generate images or animations, invent media ids, register nonexistent files, or spend money on assets during this implementation.

The only proposed new illustrated event is **one optional household celebration**. It is separate from the required formal reception and must not introduce the foreign nations early. Use existing reception/courtyard backgrounds and existing character sprites for its playable, non-explicit version.

Keep the future adult additions to **at most two author slots across the expansion**:

| Slot | Placeholder | Scope |
| --- | --- | --- |
| Optional small-group follow-up | `[threesome scene here]` | One fixed, author-selectable cast combination; no generated scene for every possible pair |
| Optional celebration follow-up | `[orgy scene here]` | One fixed supported roster/eligibility setup; no combinatorial group-scene system |

These are optional author slots, not a commitment to produce those scenes, new art, or animation now. Do not silently select a fixed cast without recording the decision for the author. A pending cast can remain unconfigured while the non-explicit celebration works.

For each slot, deliver a short author-facing content entry containing:

- Stable scene id and intended knot/file location.
- Placeholder label exactly as above, without explicit elaboration.
- Intended participants or `author to choose`, and the existing eligibility flags needed.
- Entry conditions, return destination, and whether it consumes an activity slot.
- Existing background/sprites available for setup and aftermath.
- Missing illustration/animation requirement, described only as asset type and quantity to be determined by the author.
- Proposed completion effects, kept separate from the unfinished body.

Use an Ink comment for the raw placeholder, for example `// AUTHOR CONTENT: [threesome scene here]`. Square-bracket prose has special meaning in Ink; do not paste bare bracket placeholders into story structure without checking compilation.

Pending scenes must be marked unfinished and excluded from required goals and attainable-content denominators. In normal play, hide them or show a clearly unavailable entry. In editor testing, they may open a neutral message and return safely. **Never pretend that the omitted encounter happened, unlock its memory, or award completion merely because its stub was opened.**

Suggested author deliverable: `Editor/data/projects/breedhaven/villa-author-content.md`. Include the two optional slots and an inventory of any existing scene boundaries that were adapted. Keep authoring metadata out of the finished player's prose.

## 7. Explicit scope limits

Do not add the following in this pass:

- A resident-to-resident relationship simulation, jealousy meters, or dynamic group pairings.
- A full appointment/calendar scheduling UI or recurring promise penalties.
- Procedural events requiring unique illustrations.
- Farming, crafting, inventory production chains, upkeep, or a new economic progression layer.
- Required adult scenes, group encounters, or romances as the price of reaching the finale.
- New pregnancy progression or alternate epilogues for every number of free-roam days.
- A requirement to collect every woman or every scene before ending Episode 1.
- New hosted services, account integrations, or website deployment.

Short fixed household exchanges are welcome within the conversation budget. They should support the fantasy of an inhabited household without multiplying the art workload.

## 8. State, compatibility, and authoring rules

Use distinct concepts for introduction completed, free roam available, finale ready, finale started/completed, and optional celebration seen. Concrete variable names are implementation choices; check the existing namespace first.

- Keep the current story/estate clock ownership. Avoid two independent day counters drifting apart.
- Advance the day only through the appropriate live-story sleep action. Pay each earning day once, including after re-entry or reload.
- Add variables through the authored catalogues, using the repository's id generator. Regenerate `ink/state.ink` with the current stats and NPC documents.
- Preserve existing knot names and result tokens wherever practical. Add compatibility redirects instead of silently removing saved destinations.
- Old saves at the Day 9 morning should reach free roam without another handover or duplicate money. Saves already inside/completed the epilogue must not be forcibly moved backward.
- Inspect old staff saves with `bond == "unset"` after beat two; provide a coherent recovery path rather than silently choosing friendship or inventing a prior encounter.
- Preserve crowns, restored rooms, assignments, trust, accepted/deferred relationships, and existing gallery unlocks during migration.
- Do not clear old `seen` collections to make the new completion model easier. Migrate conservatively and distinguish reliable completion evidence from a mere launch.
- Keep optional fields backward compatible in the estate parser. Mirror any spec change with `npm run spec:sync --workspace inkcrafter-player`.
- New estate configuration must be editable and round-trip through the editor, project export, plain player bundles, and protected bundles when relevant. Verify the actual export pipeline before assuming the new metadata is carried automatically.
- Back up the real project; do not overwrite an existing exported game as an incidental test. Use a temporary export directory for validation.

## 9. Implementation order

1. **Audit and baseline.** Read the project and source, record existing gates and scene inventory, back up authored files, compile the whole story, and run the existing villa checks. Identify pre-existing failures separately.
2. **Free-roam loop.** Remove the project's final-day/workday lockout, preserve finite-calendar support, update chronology and recurring copy, and prove several weeks of play with correct settlement.
3. **Goals and chosen finale.** Implement authored requirements, readable progress, one-time readiness announcement, explicit ending action, and old-save migration.
4. **Resident interaction UI.** Clarify restoration/invitation rewards, expose first-time visits, and add the small conversation set using existing assets.
5. **Replay isolation.** Implement and test the separate playback context before exposing Memories in normal play.
6. **Optional celebration and author slots.** Add the non-explicit wrapper and author handoff entries. Keep unfinished slots out of normal progression.
7. **End-to-end validation and delivery.** Validate editor, player, real project, saves, and export; report exactly what changed and what remains for the author.

Do not stop at a design proposal or a collection of stubs for the core gameplay. The free-roam, goals, finale gate, and replay features should work. Stubs are appropriate only for the explicitly author-owned future content.

## 10. Acceptance checks

Use both targeted tests and the real compiled Breedhaven story. Do not substitute a hand-authored mock story for all progression checks.

### Calendar and economy

- Walk from Day 1 through at least Day 30 without a forced ending or negative countdown.
- Initial events happen once; missed optional relationship opportunities remain reachable.
- Restore a costly room after Day 9 using legitimate continued earnings.
- Reopen the villa and reload saves before/after settlement; neither path pays a day twice.
- No calendar advancement or settlement occurs during memory replay.
- Another finite-calendar estate still respects its configured cutoff.

### Story and ending

- Both staff friendship resolutions can satisfy the central-arc requirement without enabling intimate scenes.
- Romantic third beats still follow the appropriate first encounter. Rejection and breakup remain respected.
- All existing trial-companion/relationship paths can reach readiness without an unavailable resident or scene.
- Readiness becomes visible without launching the finale; the player can spend additional days in free roam.
- `Stay at the villa` changes no progression state. `Begin finale` creates the checkpoint and reaches the existing episode ending exactly once.
- The reveal of other nations stays behind the explicit finale action. Time-related prose remains coherent after a long stay.

### Completion and replay

- A first-time scene unlocks its memory only on completion.
- Exit a memory normally, cancel it, and exercise a handled playback error. The live game returns to the same day, phase, location, choices, relationships, funds, assignments, and completed goals.
- Compare live Ink state and relevant persistent storage before/after replay, not merely the displayed day.
- Replay cannot earn achievements, alter image-gallery unlocks, trigger a live minigame, or create a save containing replay state.
- Old saves preserve their progress and do not gain invented scene completions.
- Unfinished author slots never block the ending or count as completed encounters.

### Editor and delivery

- New configuration survives edit/save/reload, spec sync, export, and player load.
- Short UI labels, keyboard/controller navigation, scrolling, and supported display sizes work with the larger resident menus.
- Run typechecks, appropriate tests, production builds, and a real editor/player launch. Verify actual interactions; compilation alone does not validate replay or menu return behavior.
- Existing real-project scripts include `Editor/scripts/story-compile.mjs`, `villa-regressions.mjs`, `villa-check.mjs`, and `chapter5-flow-check.mjs`. Run them from `Editor/`. Update assertions that intentionally change from a fixed nine-day ending to free roam; preserve their other coverage.
- Prefer uncached checks when new module files are not yet tracked. Document unrelated baseline failures rather than hiding them.

## 11. Final handoff back to the author

Deliver:

1. Working source changes and revised authored Breedhaven files.
2. A concise explanation of the new player loop and the exact finale requirements.
3. The author-content document with clearly located optional placeholders and pending cast/art decisions.
4. A content budget summary: conversations added, existing assets reused, and any future assets actually needed.
5. A migration note and concrete verification results, including failures or limitations.
6. A list of changes under gitignored `Editor/data/`, plus the backup location.

Do not generate adult scene prose or art to fill the author slots. Do not commit, push, or publish unless the user separately asks.

## 12. Implementation progress

### Follow-up — resident encounters and cast expansion: complete

Revised on 2026-09-07 following the author's correction of the visitor-based approach.

- Removed the evening invitation menu. Group scenes now appear as ambient encounters inside the estate: a `Voices` marker on an eligible room, a room cue, and `Join them`. Existing visitor-menu knot names redirect safely to the hub.
- Added eight authored encounters using the actual resident roster and bedroom assignments, alongside existing relationship eligibility and room-availability checks. Both the UI and shared action validator require every participant to live here and the scene location to be restored. Sending someone away immediately removes affected encounters, including after reload. A relationship unlock alone never brings an absent woman into a scene.
- Six scenes omit both staff members: Faye/Lira/Piri at the fountain discussing slime budding and individuality; Maren/Daphne's friendly strength contest at the baths; Anwen/Elowen/Tink's bell-and-ribbon argument in the hall; Dinah/Yelena/Faye relaxing formal manners in the conservatory; Lira/Maren/Daphne comparing balance and different bodies at the fountain; and Tink/Faye/Yelena's card game in Tink's room.
- The remaining two include one staff member each: Tamsin/Anwen/Maren mending Kael's coat in Maren's room, and Isolde/Faye/Dinah taking a break from work in Faye's room. Staff romantic lines continue to require an active romance.
- The twelve expanded solo Talk scenes remain. All new group moments use existing room backgrounds and two or three existing neutral sprites, with Kael participating in dialogue. No new art or animation is required.
- Encounter definitions are editable in the editor's `Encounters` tab and survive catalogue parsing, spec sync and export. A shared room with multiple available scenes rotates them by the story day. These encounters are repeatable, cost no day or crowns, and award no scene completion.
- Validation: both typechecks and production builds passed; the focused estate tests passed; full story compilation and project preflight passed with zero findings. The real-story conversation check covers 40 solo/group paths plus absent residents, departures, reloads, guarded dispatch, unchanged variables and same-phase returns. Existing villa regressions passed.
- Live player smoke test: the bathhouse showed no encounter with only Maren living here; moving Daphne in revealed `Voices`, the readable `Friendly rivals` room cue, and a working `Join them` action dispatching `villa_company_rivals`. This was performed in test mode; compiled story traversal verifies the authored body and return.
- Full Editor suite: 148 files and all 2,395 tests passed. The process still exits nonzero because of the previously observed CodeMirror/jsdom `getClientRects` unhandled exception in `knotLinks.test.ts`; encounter tests are clean.
- Authored changes are in gitignored `chapter5/villa-company.ink`, `chapter5/villa.ink`, `chapter5/villa-days.ink`, `minigames.json`, `writing-notes.md`, and `villa-author-content.md`. Exported Breedhaven includes 308 knots and the same 302 media files.


### Phase 1 — audit and baseline: complete

Completed on 2026-09-07.

- Read the editor and player repository instructions, project writing rules, estate data model, player scene, save/gallery architecture, current Chapter 5 flow, and staff-arc revisions.
- Confirmed the fixed calendar behavior: Day 9 currently diverts to `villa_last_morning`; authored estate configuration has `lastDay: 9` and `lastWorkday: 8`; `villa_finale` enters the existing epilogue immediately.
- Confirmed that `EstateState.seen` is currently written when a scene is launched in `actOnEstate`, before the authored scene finishes. It will not be used as completion proof without the Phase 5 completion-boundary change.
- Confirmed that Ink state is the source of truth for the villa clock and relationships, while gallery and achievement services keep additional module-level persistent state that replay must suppress.
- Preserved the revised Tamsin and Isolde structure: romance/friendship is chosen in beat two, a romantic beat three waits for the first private encounter, and `*_settled` represents an ongoing romance rather than friendship.
- Backed up the authored project and linked Breedhaven codex at `C:\Users\uytra\source\InkCrafter\.tmp\villa-free-roam-baseline-20260907`.
- Baseline verification passed: whole-story compilation, villa regressions, villa calendar/route probe, Chapter 5 flow probe, and project preflight with zero findings.

### Phase 2 — free-roam loop: complete

Completed on 2026-09-07.

- Removed Breedhaven's `lastDay` and `lastWorkday` values while preserving both optional fields and finite-calendar behavior in the shared estate module for other projects.
- Replaced the forced Day 9 route with the ordinary morning/day/evening/sleep loop. A one-time Isolde exchange now introduces free roam on Day 9, and the day display remains valid indefinitely.
- Continued stipend and commission income after Day 8 with the existing `villa_settled` once-per-day guard. The regression suite covers morning re-entry, evening settlement, duplicate settlement attempts, and reopening the board on the following day.
- Removed the Day 9 upper bound from the deferred shared-relationship answer. Kept minimum-day and different-day pacing gates intact, and retained exact-day guards for the Day 5 complication and Day 8 reception notice.
- Changed the old `villa_last_morning` knot into a compatibility redirect so saves parked at that destination enter free roam without repeating the handover.
- Updated tutorial and reception timing copy to explain that the palace awaits Kael's chosen date after the first eight days.
- Added `villa_free_roam_seen` through the authored stats catalogue and regenerated `ink/state.ink` through `renderStateInk`.
- Verification passed: story compilation, villa regressions, Chapter 5 flow checks, and sixteen route walks through Day 30 with exactly one payout per elapsed day.

### Phase 3 — goals and player-selected finale: complete

Completed on 2026-09-07.

- Added authored estate goals with stable ids, required/optional classification, room/story-flag/resident-count/all-available-room conditions, shared progress evaluation, parser support, and preflight validation.
- Added a `Goals` page to the player villa and a matching `Goals` authoring tab in the editor. Lock text names the missing room, story step, or eligible invitation count without exposing unavailable route content.
- Configured Breedhaven's required goals: restore both staff rooms, complete both staff arcs on either relationship outcome, and invite two eligible non-staff residents. The invitation target automatically falls to the number genuinely available on the current route. Full available-room restoration is optional.
- Added distinct authored flags for the eight-day introduction, readiness, readiness announcement, finale start/completion, celebration completion, and both staff-arc aftermaths. Legacy staff saves recover arc completion from their existing knot visit history.
- Finale readiness is written once from current Ink and estate state and never retracts. Day 9 alone is insufficient, and opening the goals view has no side effects.
- Added a one-time Isolde readiness announcement plus visible requirement review before readiness. `Receive the court` opens a checkpointed confirmation with `Begin finale` and `Stay at the villa`; staying leaves all progress intact.
- Retained the existing reception and wider-world epilogue, while replacing its fixed nine-day wording with chronology that remains coherent after a long free-roam stay.
- Verification passed: editor and player typechecks, 30 shared estate tests, project preflight, villa regressions, Chapter 5 flow, and all route walks through Day 30 followed by canceling and then explicitly confirming the finale.

### Phase 4 — resident interaction UI: complete

Completed on 2026-09-07.

- Replaced each occupied-room scene list with a consistent resident menu: `Spend time` for unfinished available scenes, `Talk` for a repeatable household exchange, and `Memories` for completed scenes. Shared rooms retain resident switching and joint departure rules.
- Kept scene gates and room restoration requirements in the shared action path. Locked first-time scenes continue to explain the missing relationship step or room, and completed content moves out of `Spend time`.
- Added an optional authored Talk result to the estate resident schema, parser, editor controls, shared action validation, and project preflight checks.
- Added one short, non-explicit, repeatable exchange for each of the villa's twelve residents. These reuse existing room backgrounds and neutral sprites, make no state changes, and stay within the three-conversation-per-resident content cap.
- Expanded unrestored-room copy so the player can see the intended resident and the interaction classes the room supports before spending crowns.
- Verification passed: editor/player typechecks, story compilation, all twelve Talk dispatch paths, villa preflight, goal/finale route walks, and resident action regressions.

### Phase 5 — replay isolation: complete

Completed on 2026-09-07.

- Added a dedicated replay VN scene running a disposable `GameState` cloned from the live Ink state. The live state remains in the registry and the villa remains paused underneath, so exit returns to the same resident and `Memories` page.
- Replay intercepts the authored `Return to the villa` boundary and returns to the resident menu without following the live villa divert. Escape/menu cancel also exits safely; dead ends, playback errors, word input, and minigame boundaries return a neutral error while leaving live play intact.
- Disabled replay map, character, save/load, quick-save, and quick-load entry points. Added reentrant module-level guards so autosaves/manual saves and gallery activation cannot persist even if a replay path attempts them.
- Constructed replay states with achievements disabled. Replay shutdown destroys its achievement observers, music, animation/background layers, and sprites before resuming the villa.
- Moved permanent scene completion from launch to the authored return choice. Estate ledger version 3 stores reliable `completed` history separately while retaining legacy `seen` launch history unchanged; version 1/2 saves migrate conservatively with no invented completions.
- `Spend time` and `Memories` now read reliable completion history. Old `seen` entries remain preserved but do not unlock replay because their former launch-time meaning cannot prove completion.
- The supported initial replay set is all existing villa resident visit scenes whose terminal choice is `Return to the villa`. Generic scenes that launch a minigame, request word input, end without that boundary, or need a branch outside the cloned save context are rejected with a safe return instead of entering live play.
- Verification passed: player production build, editor/player typechecks, 55 estate migration/action tests, first-time launch-versus-completion regressions, cloned Ink-state comparison, and explicit suppression checks for save and gallery storage writes.

### Phase 6 — celebration and author slots: complete

Completed on 2026-09-07.

- Added one optional, non-explicit household supper after reception readiness. It reuses the reception background and Tamsin/Isolde sprites, advances no day, pays no currency, starts no finale, and disappears after its one completion.
- Added the supper as an optional authored goal. It is excluded from reception readiness and remains available before the player chooses the ending.
- Added `chapter5/villa-author-slots.ink` with unreachable, neutral editor-test stubs and the exact Ink comments `AUTHOR CONTENT: [threesome scene here]` and `AUTHOR CONTENT: [orgy scene here]`. Neither stub changes state or claims the omitted event occurred.
- Added `villa-author-content.md` with stable ids, pending participant decisions, existing eligibility inputs, entry/return rules, activity cost, reusable setup assets, future illustration/animation decisions, and separate completion-effect guidance for both slots.
- Recorded the supported replay boundary and unsupported scene shapes for future author work.
- Verification passed: whole-story compilation, project preflight, all route/finale checks, celebration once-only behavior, and direct neutral returns from both pending author stubs.

### Phase 7 — end-to-end validation and delivery: complete

Completed on 2026-09-07.

- Regenerated the real Breedhaven estate data and Ink state, compiled the complete 294-knot story, and exported the project into the player bundle. The export contains 302 media files and loads with content hash `35de8af9e043`.
- Verified the exported player in a live browser. The villa opens directly in test mode, the tutorial can be dismissed, the open-ended Goals page renders all required and optional objectives, a room can be restored and assigned, and an occupied room exposes `Spend time`, `Talk`, and completion-gated `Memories` controls. The Talk action dispatches to the authored result and returns without changing the estate clock.
- Launched the built Electron editor after a production rebuild. The main, preload, and renderer bundles built and the application stayed running without a renderer or main-process failure. Chromium reported local disk/GPU cache permission warnings on launch; these did not prevent the editor from opening.
- Final focused validation passed: editor and player typechecks; player production build; 55 estate tests; project preflight with zero findings; whole-story compilation; villa regressions; Chapter 5 flow; and sixteen route walks through Day 30 with correct once-per-day settlement, readiness review, finale cancellation, and explicit finale confirmation.
- The complete editor suite executed 148 files and all 2,392 assertions passed. Vitest still returned a nonzero status for one unrelated jsdom/CodeMirror unhandled exception in `src/renderer/src/editor/knotLinks.test.ts` (`Range.getClientRects` is missing from jsdom after the test completes). The focused estate tests and production builds are clean.
- Save migration retains legacy `seen` launch history, restores no invented completions, and writes reliable replay eligibility only to the version 3 `completed` ledger after the authored return boundary. Existing crowns, rooms, assignments, relationship state, and gallery data remain intact.
- The implemented content budget is twelve short resident conversations and one optional household supper, all using existing room/reception backgrounds and existing sprites. The two future author slots remain optional and require only the illustration/animation choices the author makes for those encounters; no new asset is required by the core free-roam loop.
- Author-owned work remains in `Editor/data/projects/breedhaven/chapter5/villa-author-slots.ink` and `Editor/data/projects/breedhaven/villa-author-content.md`. Both paths are gitignored project data and must be carried with the authored Breedhaven project alongside the generated `minigames/consort_villa/config.yml`, `stats.yml`, `npcs.yml`, and `ink/state.ink` changes.
- The pre-implementation authored-project backup remains at `C:\Users\uytra\source\InkCrafter\.tmp\villa-free-roam-baseline-20260907`.
