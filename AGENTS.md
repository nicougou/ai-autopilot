# AGENTS.md — auto-pr Feature Workflow

Agent-specific operating guide for working on feature tasks through `auto-pr`.

## Goal

Take one explicit `--source` input, move it through the pipeline, and produce a clean PR with traceable artifacts.

## Source Input Rules

- Always start from `--source`.
- Supported source forms:
  - GitHub issue number (`"123"`) with `--repo owner/repo` when needed
  - GitHub issue URL
  - Markdown path (`"task.md"` or `"md:task.md"`)
  - Prompt text (`"prompt:..."` or plain fallback text)
  - Trello URL (via configured source command)
  - Slack URL (via configured source command)
- For Trello/Slack/GitHub custom routing, source scripts must output normalized JSON:

```json
{
  "id": "source-task-id",
  "title": "Task title",
  "body": "Full task context",
  "repo": "owner/repo",
  "scopePath": ".",
  "number": 123
}
```

## Pipeline Contract

Steps run in order:
1. `research`
2. `plan`
3. `plan-annotations` (only if `plan-annotations.md` exists)
4. `plan-review-loop`
5. `plan-implementation`
6. `implement`
7. `review`
8. `pr-description` (always runs; writes and prints `pr-description.md`)
9. `create-pr` (conditional on `prMode`)
10. `remove-label` (GitHub issue sources only)

Each step must produce its expected artifact in the task folder under `.auto-pr/...`.

### Special Operations (not in normal pipeline)

- `900-refresh` — Rebase stale PR branch onto main. Invoked via `--refresh --issue N`.
- `910-review-round` — Address PR review feedback, push fixes. Invoked via `--review-round --issue N` or `--review-round --source "task.md"`.

## Hooks

Shell commands triggered by pipeline lifecycle events. Configured in `hooks` config key.

| Hook | Trigger | Use case |
|------|---------|----------|
| `beforeStep.<name>` | Before a pipeline step starts | Logging, notifications |
| `afterStep.<name>` | After a step completes successfully | Run tests, notify |
| `onNeedInput` | Pipeline pauses for human input (`askBeforeImplement`, `prMode=ask`) | macOS notification |

Hooks support `{{step}}` and `{{issue}}` token replacement. Hook failures warn but never stop the pipeline.

Hooks are deep-merged when profiles are applied (per-event, per-step).

## Step Wiring Rules

- When adding/inserting a pipeline step, re-number downstream step files in `steps/` to keep numeric order aligned with execution order.
- Keep `pipeline.ts` imports and `STEPS` order in sync with the file numbering and documented order above.
- If a step uses a prompt template, add/update `PROMPT_TEMPLATES` in `utils.ts` and ensure numbering matches the step (`007-...`, `008-...`, etc.).
- If a step is agent-driven, pass `stepName` to `runAgent` and add model overrides in `config.example.json` under `models.<runner>.steps.<stepName>` when applicable.
- Keep docs/examples aligned after step changes (`AGENTS.md`, `README.md`, and `--help` output).
- After wiring changes, run `bun run ./check-integrity.ts` and fix all reported mismatches before finishing.

## Artifact Expectations

- `initial-ramblings.md` — initial normalized source context
- `research.md` — codebase investigation
- `plan.md` — architecture/decision plan
- `plan-review.md` — latest iterative plan review feedback + verdict
- `plan-review-summary.md` — rounds run and final verdict
- `plan-implementation.md` — ordered checkbox checklist
- `completed-summary.md` — completion signal from implement loop
- `review.md` — PASS/PASS WITH FIXES summary
- `pr-description.md` — AI-written PR body (always generated, printed to console)
- `pr-review-comments.md` — captured PR review comments (input for review-round)
- `review-round-summary.md` — summary of review feedback addressed (review-round output)

Do not treat chat output as artifact output. Required files must exist on disk.

## Implementation Checkpoint

When `--ask-before-implement` is enabled:
- A checkpoint prompt appears before coding.
- If `plan-annotations.md` exists at that moment, annotations are applied before implementation continues.
- Prefer adding `plan-annotations.md` before implementation starts.

## Profiles

Profiles are named config presets selected via `--profile <name>` / `-p <name>`. Each profile is a partial config override that can change runner, models, PR mode, and/or use custom prompt templates.

Merge order: **base config → profile → CLI flags** (CLI always wins).

Key profile fields:
- Any `Config` field (`agentRunner`, `models`, `prMode`, `askBeforeImplement`, etc.)
- `until` — stop pipeline after this step (same as `--until`)
- `promptDir` — directory of prompt template overrides (relative to auto-pr home). Only files present shadow the base `prompt-templates/`; missing templates fall back to defaults.

Models are deep-merged: a profile can override one runner's default without wiping step overrides.

## Model Selection

Model resolution per step:
1. `models.<runner>.steps.<step>`
2. `models.<runner>.default`
3. built-in fallback

Logs show selected model per step and whether it came from `step` or `default`.

## Worktree Mode

- Optional and interactive (`--ask-worktree` or config).
- Worktrees are created under `<worktreeBaseDir>/<repo-key>/...` (default: `~/.cache/auto-pr/worktrees`).
- Use for isolation when main repo is dirty or multiple tasks run.

## Safety and Constraints

- Run inside a git repo only.
- Avoid ad-hoc writes outside repo/worktree and `.auto-pr` artifacts.
- Source command auth is handled by source scripts; `auto-pr` should not require direct tokens.

## Quick Commands

- `apr --source "123" --repo owner/repo`
- `apr --source "task.md" --with-uuid`
- `apr --source "prompt:update AGENTS.md"`
- `apr --source "https://trello.com/c/..."`
- `apr --source "https://workspace.slack.com/archives/..."`
- `apr --source "task.md" --pr-creation never` (generate description, skip PR)
- `apr --source "task.md" --pr-creation ask` (prompt before creating PR)
- `apr --source "123" --profile work` (use named profile)
- `apr --source "task.md" -p research` (profile shorthand)
- `apr --review-round --issue 42` (address PR review feedback for GitHub issue)
- `apr --review-round --id md-task-abc123` (address PR review feedback by artifact id)
- `apr --review-round --source "task.md"` (address PR review feedback, re-resolve source)
