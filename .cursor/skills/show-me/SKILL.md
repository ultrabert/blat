---
name: show-me
description: Keep a reviewable TSV decision trail (what, why, evidence, result) for long-running or unattended work. Use for /show-me, /show-me-your-work, autonomous or multi-phase runs, or when a human will review after stepping away.
disable-model-invocation: true
---

# Show me

For work a human reviews after the fact, a decision trail lets them reconstruct what was decided, why, and on what evidence, without rerunning the work or reading the whole transcript. One canonical log. A future agent can find it.

This is the trail format. Playable proof still belongs to `verify-blat`. Do not invent a second log shape.

## The format

A single TSV file, one row per decision. GitHub renders a committed TSV as a table; `column -s$'\t' -t decisions.tsv` renders it in a terminal; a row appends with one command. Cells stay single-line. Evidence is a pointer, not prose.

Copy `references/decision-log-template.tsv` (the header row) to start a clean log, or let `scripts/log.sh` write the header on first use. Columns:

- **ts.** ISO8601 timestamp. The timeline axis.
- **phase.** The phase or workstream (`boot`, `lag`, `verify`, `ship`, …).
- **decision.** What was chosen or done, one line.
- **why.** The reason in plain words. If a principle drove it, say it plainly (`patch ≈ frame is hitch, not Fly ping`), not as a jargon tag.
- **evidence.** A link or path that proves it: commit SHA, `file:line`, `npm test` summary path, doctor log, `/opt/cursor/artifacts/…` screenshot, `curl /api/lag` JSON. Never a paragraph. Never `BLAT_PASSWORD`.
- **result.** The outcome or predicate state: `doctor PASS`, `126/126`, `reverted`, `INCONCLUSIVE`, `open`.

Illustration only — do not copy these rows into a real log:

```
ts	phase	decision	why	evidence	result
2026-09-04T04:20:00Z	boot	bound Vite to IPv4 not just [::1]	doctor was failing 127.0.0.1:5173	vite.config.ts server.host true	doctor PASS
2026-09-04T04:24:00Z	verify	watched /demo instead of trusting tests	npm test does not prove guns fired	/opt/cursor/artifacts/verify_blat_demo_spectator.webp	bots fighting, watching
```

## Logging a row

Write each entry the way you'd tell a teammate what you did. Plain words, concrete actions.

```bash
bash .cursor/skills/show-me/scripts/log.sh decisions.tsv \
  "<phase>" "<decision>" "<why>" "<evidence>" "<result>"
```

The helper stamps `ts`, writes the header on first use, strips stray tabs/newlines, and prefixes any cell starting with `=`, `+`, `-`, or `@` with a single quote so a spreadsheet open does not execute a formula. A bare `printf` appending a row works too, but mind those same bytes.

Default log path: `decisions.tsv` in the work dir. Override with a path (`.audit/<name>.tsv` when several efforts run at once).

Log decision points and checkpoints, not every action: a fork chosen, a verify result, a pivot or revert, a blocker, a gate fixed. For loop runs, one row per iteration. Skip the trivial.

When `verify-blat` ran this turn, log one row whose evidence points at the screenshot / doctor / LAG JSON — do not restate the combat report in the cell.

## Where it lives

By default the log is a working artifact, not committed. Root `decisions.tsv` and `.audit/` are gitignored. Most work does not need a committed trail; the local log still keeps the run honest and can be discarded after.

Commit it only when a reviewer needs the trail to trust the result (long unattended run, multi-phase netcode change, anything where confidence has to be shown rather than assumed). `git add -f decisions.tsv`. A committed log renders as a table in the PR.

Cloud Agent: also copy the log to `/opt/cursor/artifacts/decisions.tsv` so it survives cleanup.

## Rules

- One row is one decision or checkpoint. If it does not fit on one line, the decision is not crisp yet.
- Append-only. A wrong call gets a new row that supersedes it. Never edit or delete history.
- Prefer evidence a reviewer can re-run: `scripts/verify-blat-doctor.sh`, `npm test`, `curl /api/lag`, committed scripts. Hand-wavy "looks fine" is not evidence.
- Do not treat Cloud Agent `patch ~60ms` as Fly lag when `patch ≈ frame`. If that distinction drove a call, say so in **why** and point at the LAG line.

## Audit the log against what happened

At the end of the run, before handing back, check the log told the truth. Walk it against this conversation, the commits, and the evidence files:

- Every row maps to a real action. Cut invented or aspirational entries.
- Each row's evidence resolves and shows what the row claims.
- A fork, pivot, or abandoned approach that shaped the work but is not logged is a gap. Add it.
- Drop padding. If nobody would audit a row, it does not earn its place.

Fix the log, not the story. If the work diverged from what a row claims, the row is wrong.

If this environment exposes this run's transcript under the workspace `agent-transcripts/` path, read that too. Do not glob other people's `~/.cursor/projects/*/`.

## Attention

Before handing back a run that produced a trail, spawn a subagent to read the log plus the evidence pointers. Self-review is not a substitute.

Flag:

- Decisions logged with weak or absent evidence.
- Verification claimed without `verify-blat` proof when the work was playable.
- Choices that look risky in hindsight (scope-creeping, papering over a symptom, shipping on tests alone).
- Gaps a casual skim would miss.

Every reply for a run that produced a trail ends with an **Attention** section. Lead with `reviewed by <model>`, then list each flag pointing at specific rows. "No flags" is valid; omitting the model name is not.

## Reviewing the trail

Read top to bottom, follow the evidence pointers, spot-check. A row whose evidence does not resolve, or whose result is unverified, is the audit catching a gap.

## Composing this skill

Other skills route their audit trail here instead of inventing one. Reference it by name (`show-me`) and let it own the format; do not restate the columns.
