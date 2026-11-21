---
name: studio-playbook
description: Box47 Games' studio rules for building a game with Claude agents and the owner, learned on Nestfall. Use when starting a new game or repository, planning balance or pacing, delegating to a subagent, working out how the owner likes to work, or when asked what the studio has learned. Copy this folder into every new game.
---

# Box47 studio playbook

Rules for you, the agent, learned on Nestfall (a browser factory and tower-defence game, 0.1 to 0.104,
2025-2026). Each rule comes first; the incident that taught it follows where it helps.

**Precedence:** the repository's own `CLAUDE.md` and skills win over this file; they know their game.
Rules marked *(TS/Vite)* apply to a TypeScript, Vite and Playwright stack; on another stack, find the
equivalent.

## Using this skill

- **Starting a new game:** work through section 1 in order before writing gameplay, then copy the `ship`
  and `steward` skills from Nestfall and adapt their commands.
- **Mid-project:** read the section for the task at hand (balance → 2, delegating → 5, CI → 6, legal and
  stores → 9) and the gotchas (8).
- **Adding a lesson:** when something costs you real time and would bite another game too, add one line
  under the right heading, in the same pull request: the rule, then "(Game x.y: what happened)". Keep
  game-only rules in that game's `CLAUDE.md`, not here. Copy the improved file back to Nestfall's (and other
  live games') `.claude/skills/studio-playbook/` when you can, so the copies don't drift.

## 1. Starting a new game

Build these on day one. Every one was harder to add later.

1. **Rules module with no screen.** All game rules in one folder (`src/sim/`) with no DOM, rendering or
   audio. Nestfall's co-op, dedicated server, main-menu demo and pacing bot all reuse it for free.
2. **Deterministic.** A fixed tick (Nestfall: 1/20 s), seeded random numbers (`world.random()`, never
   `Math.random()` in the rules), and none of the float functions whose last bit varies between browsers
   (`Math.hypot`, `sin`, `exp`, `pow`); write your own where the rules need them. Prove it with a test that
   runs the same commands in Chromium, Firefox and WebKit and compares the results.
3. **Every change is a command.** Input and UI issue `Command`s; a `Session` applies and logs them. Add a
   unit test that fails if UI or input code calls a world method that changes state.
4. **Errors are values.** World methods return an error code instead of throwing, so the UI can say why.
5. **One data file** (`data.ts`) for every cost, recipe, timing and balance number. Docs follow it.
6. **Versioned saves.** `SAVE_VERSION`, and a tested migration for each bump. State that steers the rules
   lives in the saved game state, never in private fields, or co-op games loaded from a snapshot drift.
7. **Phones from day one.** Run the browser tests at a phone viewport with touch as well as desktop.
   (Nestfall 0.100.2 had to fix three touch bugs at once.)
8. **Hear from players in the game.** A feedback form with optional diagnostics (version, save summary,
   and the milestones below) that sends straight to the studio's own server, not a third party and not the
   player's email app; and opt-in error reports sent the same way. Plan who reads them and how often: the
   server keeps them, but nothing tells you they arrived. Nestfall's pacing analysis was built on 74 such
   reports. (Nestfall 0.94, D-173; 0.112: feedback by email was cut short and needed an email app, D-229.)
9. **Milestones in saves:** game seconds at which each research, stage and goal was reached
   (`research:<id>`, `stage:<id>`, `run:<n>`), in the feedback diagnostics and on the victory screen.
10. **Docs** (section 4), **skills** (`ship`, `steward`, this one), **CI** (section 6), and a `CLAUDE.md` with
    the commands, code rules and gotchas.
11. **The final name before identifiers.** A working title spreads into storage keys, server names and salts,
    and renaming them later is costly. Pick the name first, or keep it out of identifiers.
    (Nestfall: "Foundry Front" took two releases to remove, D-194, D-195.)
12. **The game's own address from day one, and save export.** Browsers keep saves per address, so moving
    the game strands every save. Serve it from its own domain from the start, and ship save export and import
    early. (Nestfall 0.95: the move needed every playtester to export first, D-172, D-181.)
13. **Per-game legal items** (section 9): search trademarks and stores for the name, write the game's
    privacy page, and put the rest of section 9's per-game list on the game's roadmap. The studio itself
    (company, tax number, store accounts) is set up once, not per game.

Folder layout:

| Folder | Holds | Rule |
|---|---|---|
| `src/sim/` | rules, data, commands, session, saves, bot | no DOM; deterministic |
| `src/render/` | drawing | effects come from diffing world state each frame |
| `src/audio/` | music, sound | sounds come from diffing world state, like effects |
| `src/ui/`, `src/input/` | overlay, controls | read the world; change it only through commands |
| `src/net/` | co-op | sends commands, not state |
| `e2e/` | browser tests | shared helpers; trigger states directly, never wait for game time |
| `docs/` | design, decisions, roadmap, pacing | kept true in every pull request |

## 2. Balance and pacing

**Measure before you tune, and make the measuring automatic.** Nestfall's "the Steam Age feels slow" became
"Electronics research stalls for 195 seconds" once a bot played it; the fix brought that to 35.

- **Build a pacing bot as soon as the game has a goal.** No AI: a fixed plan of what to build and research,
  played by the real rules on a few seeds. Two plans bracket the range: *lean* (only what the goal needs,
  instant placement) and *competent* (everything, with a player's time spent placing). Report the median of
  the seeds: minutes to each stage and to the goal, and the main resource used.
- **The bot is a floor.** Nestfall players took 3 to 9 times the bot's game time (median about 6). Never
  present bot minutes as a player estimate without that multiplier.
- **Look at stalls, not totals.** Report the longest waits for research or resources; that is where to cut.
- **Before and after, every time.** Run the bot on the main branch and on your change, and put both tables
  in the pull request. CI does the same on any change to the rules folder and posts it in the job summary.
- **Keep a pacing record** (`docs/PACING.md`): a row per release that moves the table, and a line on why.
- **Pit the defences against the threats with a script too.** A table of each stage's defences against each
  enemy, at each threat level, finds what a pacing bot never fights. (Nestfall 0.94: steel walls made bugs
  ignore a base, D-174, D-176.)
- **Use the bot as a map tester.** On Nestfall it found a factory stranded on a power island with no
  generator, and a starter deposit inside the hub's clear zone.
- **Estimate first when asked "what if".** A quick calculation from the data file answers most questions
  about a proposed change; run the bot when the owner wants the change made.

## 3. Releases

Every merge to the main branch is a release: a version, a changelog entry and a decision row. The
repository's `ship` skill has the steps and commands; its `steward` skill covers an open pull request. Rules
that hold whatever the repository:

- Start from the latest main. Other sessions release too, so versions and decision numbers move under you.
- Docs change in the same commit as the code (section 4).
- Run every check locally before pushing; run the browser tests twice after touching input, the HUD or a
  tutorial. One validated push beats three speculative ones.
- Never skip, disable or loosen a test to get green; find the cause.
- Merge through the API with the exact head SHA, only when CI is green.

## 4. Docs are the project's memory

Your context gets compacted and the next agent starts cold. What isn't written in the repository is lost.

| File | Rule |
|---|---|
| `docs/GAME_DESIGN.md` | The game as it is on main: mechanics, numbers, controls. |
| `docs/DECISIONS.md` | One `D-0xx` row per real choice: date, decision, why, status. Never edit an old row; supersede it. Open questions are `Q-xx`. |
| `CHANGELOG.md` | One entry per release, written for players; the game shows it as What's new. A test checks it matches `package.json`. |
| `docs/ROADMAP.md` | Status per item. |
| `docs/PACING.md` | The pacing record (section 2). |
| `CLAUDE.md` | Commands, code rules, gotchas. Add a gotcha the moment one costs you time. |

Write plain, short sentences, for players in the changelog and for agents everywhere else. Avoid needless
words such as "honest".

## 5. Working with subagents

- **Delegate bounded questions that end in a written report:** a balance or pacing review, a feedback
  analysis, a design study of one feature. Nestfall's best delegated work was a pacing review that produced
  a report and a bot later moved into the repo.
- **Keep in the main session:** building that touches many files, the release loop, merging, and anything
  the owner must approve.
- **Brief as for a colleague who wasn't in the room:** the goal, the files to read first, what done looks
  like, where to write the report, and what not to touch. A scratch file is fine for working notes; move
  what's worth keeping into the repository.
- **Make long work resumable.** Usage limits stop agents mid-task. Have them write progress to files, and
  resume by messaging the same agent rather than starting a fresh one.
- **Clean up.** Remove agent worktrees and local branches once their work is merged; keep their reports.

## 6. CI

- Pin every action to a full commit SHA with its version in a comment. Update them when a runtime is
  deprecated (Nestfall moved off Node 20 actions in 0.104.0).
- On every pull request: lint, typecheck, unit tests, build, browser tests. *(TS/Vite)* Run them in the
  Playwright container image of the same version as `@playwright/test`, with a step that checks the two match.
- Add the pacing comparison job once the bot exists.
- Keep a `scripts/check.sh` that runs the same checks locally, stopping any stale preview server first.

## 7. Working with the owner

What the owner has shown they prefer (keep adding to it):
- Green pull requests are merged without asking, once CI passes.
- Plain, short sentences; no needless words such as "honest".
- Some evenings there is little usage left: offer small pieces of work that finish, not big open-ended ones.
- Account, legal and money steps they do themselves, from clear steps and drafts you prepare.
- Feedback comes from playing and from in-game reports, so build those paths early.

- **Let them choose by ear or eye, not from descriptions.** Build a page they can open on a phone: two to
  four takes in different directions, matched in loudness or size, a note box each, and a way to send the
  picks back. (Nestfall 0.95: four rounds settled every sound, D-182 to D-185.)
- **Accounts are the owner's.** Say before you change anything in them (DNS, hosting, stores). Never take a
  token in chat, and have a pasted one revoked. Give each token the narrowest permissions, and read back
  each change you make.
- **Keep what they need** (contracts, reports, picks) in the repository or their own documents, not only in
  a scratch folder, which can be wiped.
- **Offer options for design choices; don't pick silently.** Give two to four concrete options with their
  trade-offs and your recommendation, then record the owner's choice as a decision row.
- **Their standing preferences live in the repository** (`CLAUDE.md`, `steward`): for example, whether a
  green pull request may be merged without asking. Follow those; when nothing says, ask.
- **Report what happened, plainly:** what changed in the game, what you checked, what failed, and any
  choice they may want changed. Never claim a check you didn't run.
- **Unblock rather than stall.** When a tool or permission blocks you, finish everything else, then say
  exactly what is blocked and what would unblock it. After a squash merge, merge the main branch into the
  working branch rather than rewriting pushed history.

## 8. Gotchas

| Trap | Rule |
|---|---|
| A co-op command listed in one table only (Nestfall needs `GUEST_KINDS` and `KIND_FIELDS`) | Test that every command is registered everywhere it must be. |
| Distance measured as a circle around a square zone | Measure with the zone's own shape (Chebyshev distance for squares). |
| Vitest hides `console.log` from passing tests *(TS/Vite)* | Run a script meant to print with `--silent=false`. |
| A stale `vite preview` on the test port *(TS/Vite)* | Stop it before browser tests; Playwright reuses whatever is listening. |
| `pkill -f "vite preview"` | It can kill your own shell. Find the PID by port (`lsof -ti tcp:4173`) and kill that. |
| 32-bit pathfinding costs | Use `Float64Array`; 32-bit storage blew up the heap. |
| Very long lines in `DECISIONS.md` | Edit with a short script or the Edit tool; piping them through `rev` or `cut` hung the shell. |
| Audio before the first click | Browsers block it; start music and sound after input. |
| A browser test expects an old number or label | `grep -rn` the old value in `e2e/` before running the suite. |

## 9. Legal and business

Learned while setting up Box47 games LLC and preparing Nestfall for Google Play (D-168, D-180, D-201).
None of it is legal or tax advice: the owner confirms it with a Missouri lawyer or accountant. The owner does
these steps themselves (section 7); you prepare the steps and drafts, and keep each game's roadmap up to date
about them.

**Done once for the studio.** A new game reuses these and lists them on its roadmap only as prerequisites:
- Box47 games LLC (Missouri, through a registered agent so the owner's home address stays off the public
  record), its EIN, operating agreement and business bank account. Every game's costs and income go through it.
- The D-U-N-S number and the store developer accounts, in the LLC's name (Google Play as an organization,
  Apple later). One account publishes every game.
- Local licences: Boone County's Merchant's License, Columbia's business license and home occupation form.
- The owner's day job: its outside-work rules cover all studio work (tell the supervisor in writing; check
  for an invention agreement).
- Taxes: Schedule C by default; the app stores collect sales tax on their own sales; ask an accountant about
  direct sales and tips.

**On every game's roadmap:**

| Area | Item |
|---|---|
| Name | Search trademarks and stores for the name before it spreads into the code (section 1, item 11). File the trademark in the LLC's name (classes 9 and 41). |
| Ownership | Domains bought in the LLC's name, or moved into it. The game's copyright belongs to the LLC: a one-page assignment if it was started before the LLC or outside it. |
| Privacy | A privacy page, which stores require even when nothing is collected: what is stored on the device, what is sent off it (error reports, feedback, co-op), where it goes, how long it is kept, that no IP address is stored, and a contact address. Update it in the same pull request as any change to what is sent. |
| Consent | Nothing is sent automatically without the player's yes (Nestfall's error reports ask first, D-173). No analytics without a decision row. |
| Third parties | Avoid calls to other companies' servers: bundle fonts and libraries, so the privacy page stays short. Track every third-party asset and its licence in `docs/CREDITS.md`. |
| AI | Declare AI use on store pages when art or other content was made with AI. |
| Children | Answer the store's target-audience questions. A game aimed at children too falls under family rules and COPPA; collecting no personal data keeps that simple. |
| Selling | Payments inside an app go through the store's billing, tips included: hide links such as Ko-fi in the app (D-201). Terms of use and a refund policy that follow the store's. An age rating (IARC for Google Play, Apple's own questions). Check the store's rules of the day before each submission. |
| Multiplayer | Strangers never play on a home machine: a public server runs in the cloud, apart from the home network. Before rooms open to strangers: a name filter, a way to kick a player, and each player's work kept safe from the others (D-202). |

