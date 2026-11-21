# Decisions

A short record of each real choice: what was decided, and why. New entries go at the bottom. To reverse a
decision, add a new entry that supersedes the old one; don't edit the old entry. Open questions are in
[OPEN_QUESTIONS.md](OPEN_QUESTIONS.md).

Decisions made before this log started stay where they were written:
[3D_IMPLEMENTATION_PLAN.md → Roadmap Decisions](3D_IMPLEMENTATION_PLAN.md#roadmap-decisions-november-21-2026)
and [PHASE_3_DETAILED_PLAN.md → Decisions](phases/PHASE_3_DETAILED_PLAN.md#decisions) (1–38). D-001 points to them.

| # | Date | Decision | Why | Status |
|---|---|---|---|---|
| D-001 | 2026-11-21 | **Earlier decisions stay in the plans.** The roadmap decisions (finite island, rift tiers, Phase 3 before the companion, the basics track, mobile first-class, multiplayer kept lightly) and Phase 3's Decisions 1–38 are not copied here; this log starts with D-002. | Copying 40-odd decisions would make two versions that drift; the plans link their own. | ✅ |
| D-002 | 2026-11-21 | **The Box47 studio playbook** is in `.claude/skills/studio-playbook/`, an unchanged copy of Nestfall's. Riftholm-only rules go in `CLAUDE.md`, which wins where they differ. | The studio's lessons reach every game, and a shared copy can be refreshed from Nestfall without merging. | ✅ |
| D-003 | 2026-11-21 | **Every merge to `main` is a release:** a new version in `package.json` and a `CHANGELOG.md` entry written for players (`## X.Y.Z · YYYY-MM-DD · Title`, with New and Fixed). Minor for features, patch for fixes and docs. A unit test checks the two versions match. Real choices get a row here. The `ship` skill (`.claude/skills/ship/`) holds the steps. Versions continue from 2.0.0. | The studio's release rule (playbook, section 3), so players and the next agent can see what changed and why. | ✅ |
| D-004 | 2026-11-21 | **A legal and launch track on the roadmap** (`3D_IMPLEMENTATION_PLAN.md`), from the playbook's section 9. The code's MIT licence in a public repository is an open question for the owner. | The studio's per-game checklist, as it stands for Riftholm. | 🚧 |
| D-005 | 2026-11-21 | **All rights reserved to Box47 games LLC, replacing MIT (answers D-004's open question).** `LICENSE` grants no rights to copy, change, share or sell the game; `package.json` says `UNLICENSED`; the README badge follows. Copies of versions before 2026-11-21 stay MIT, which can't be taken back. Third-party components keep their own licences. Still open: signing the copyright assignment to the LLC, which the notice now relies on, and whether to make the repository private. | The owner's choice: a game the studio sells shouldn't be free for anyone to copy and sell. | ✅ |
