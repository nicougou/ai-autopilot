# ai-autopilot

## What it is

`ai-autopilot` is a CLI that turns one explicit task input into a full issue-to-PR workflow.

You give it a source (issue, markdown task, prompt, Trello URL, Slack URL), and it runs a structured pipeline with artifacts at every step.

## What it does

Pipeline:

`research -> plan -> plan-annotations (optional) -> plan-implementation -> implement -> review -> pr-description -> create-pr (optional) -> remove-label (GitHub issue only)`

Core capabilities:

- Accepts multiple source types: GitHub issue number/URL, markdown file, direct prompt, Trello URL, Slack URL.
- Writes traceable artifacts under `.auto-pr/<repo-short>/<task-id>/`.
- Supports runner selection (`claude` / `opencode`) plus per-step model overrides.
- Supports lifecycle hooks (`beforeStep`, `afterStep`, `onNeedInput`) for notifications/automation.
- Supports profiles (`--profile`) and one-off overrides (`--runner`, `--model`, `--pr-creation`, `--until`).
- Supports resume by source or exact task id (`--resume --id ...`) which is helpful for UUID runs.

Artifacts created per run:

- `initial-ramblings.md`
- `research.md`
- `plan.md`
- `plan-implementation.md`
- `completed-summary.md`
- `review.md`
- `pr-description.md`

Review-round flow also uses:

- `pr-review-comments.md`
- `review-round-summary.md`

## Examples

### Most common commands

```bash
# Prompt input
bun run ai-autopilot --source "update AGENTS.md"

# GitHub issue number
bun run ai-autopilot --source "123" --repo owner/repo

# Markdown task
bun run ai-autopilot --source "md:tasks/new-feature.md"

# Trello card URL (requires sourceCommands.trello)
bun run ai-autopilot --source "https://trello.com/c/abc12345"

# Slack thread URL (requires sourceCommands.slack)
bun run ai-autopilot --source "https://workspace.slack.com/archives/C12345678/p1732456789012345"

# Pause after plan
bun run ai-autopilot --source "md:tasks/new-feature.md" --until plan

# Resume exact UUID run by task id
bun run ai-autopilot --resume --id "prompt-update-agents-md-a1b2c3d4" --repo sample-repo

# Force runner for one run
bun run ai-autopilot --source "md:tasks/new-feature.md" --runner claude
```

### End-to-end run output

Start the run, resolve the source, prepare a worktree, and create a task id. Next step is Research.

Example artifact: [`initial-ramblings.md`](docs/examples/prompt-update-agents-md-example/initial-ramblings.md)

```text
$ apr --with-uuid --source "update AGENTS.md" --runner claude
  › Detected repo: acme/sample-repo
  › Config home: /home/you/tools/ai-autopilot
  › Runner: claude | Model: sonnet | Step overrides: 9
Create and use git worktree(s) for this run? [y/N] y
  › Worktree mode enabled (base: /home/you/.cache/ai-autopilot/worktrees/acme-sample-repo)
  ⚠ No source type matched — treating as prompt: "update AGENTS.md"
  › Reset state at .auto-pr/sample-repo/prompt-update-agents-md-a1b2c3d4 (use --resume to keep it)
  › Syncing with remote...
  › Processing 1 source(s)...

  › Using worktree for acme/sample-repo:prompt-update-agents-md-a1b2c3d4: /home/you/.cache/ai-autopilot/worktrees/acme-sample-repo/sample-repo-prompt-update-agents-md-a1b2c3d4
  › Pipeline starting for acme/sample-repo:prompt-update-agents-md-a1b2c3d4: update AGENTS.md
  › Task ID: prompt-update-agents-md-a1b2c3d4
  › Saved initial-ramblings.md
```

Research gathers context and writes `research.md`. Next step is Plan.

Example artifact: [`research.md`](docs/examples/prompt-update-agents-md-example/research.md)

```text
  ● Research  · task prompt-update-agents-md-a1b2c3d4 ...
  › Step research — model: sonnet (step)
  › Done — $0.7654 | 13 turns

  ── agent output ────────────────────────────────────────
Research complete. Written to `.auto-pr/sample-repo/prompt-update-agents-md-a1b2c3d4/research.md`.

Key findings:
- The issue is a documentation restore-and-refine task
- Reference implementation exists on a sibling branch
- Scope is docs-only; verification is editorial
- Only `AGENTS.md` needs substantive changes
  ────────────────────────────────────────────────────────
```

Plan decides approach and scope. Next step is Plan-Implementation.

Example artifact: [`plan.md`](docs/examples/prompt-update-agents-md-example/plan.md)

```text
  ● Plan  · task prompt-update-agents-md-a1b2c3d4 ...
  › Step plan — model: opus (step)
  › Done — $0.3754 | 8 turns

  ── agent output ────────────────────────────────────────
Plan written to `.auto-pr/sample-repo/prompt-update-agents-md-a1b2c3d4/plan.md`.

Plan summary:
- Single atomic replacement of `AGENTS.md`
- Mandatory-first-step flow diagram and wording refinements
- No changes required in `CLAUDE.md` / `WHOAMI.md`
  ────────────────────────────────────────────────────────
```

Plan-Implementation turns the plan into a checklist. Next step is Implement.

Example artifact: [`plan-implementation.md`](docs/examples/prompt-update-agents-md-example/plan-implementation.md)

```text
  ● Plan-Implementation  · task prompt-update-agents-md-a1b2c3d4 ...
  › Step planImplementation — model: opus (step)
  › Done — $0.2468 | 6 turns

  ── agent output ────────────────────────────────────────
Written `.auto-pr/sample-repo/prompt-update-agents-md-a1b2c3d4/plan-implementation.md` with two tasks:

1. Replace `AGENTS.md` with all documented refinements.
2. Run three-tier verification (manual checks + diff walkthrough).
  ────────────────────────────────────────────────────────
```

Implement applies changes; checkpoint gives the exact resume command if you answer No. Next step is Review.

Example artifact: [`completed-summary.md`](docs/examples/prompt-update-agents-md-example/completed-summary.md)

```text
  ● Implement  · task prompt-update-agents-md-a1b2c3d4 ...
  Implementation checkpoint
  · Review .auto-pr/sample-repo/prompt-update-agents-md-a1b2c3d4/plan-annotations.md before answering
  · Answer No -> run: bun run ai-autopilot --resume --id "prompt-update-agents-md-a1b2c3d4" --repo "sample-repo"
  · Start only when plan + checklist look final

Start implementation for acme/sample-repo:prompt-update-agents-md-a1b2c3d4? [y/N] y
  › Implementation iteration 1/100
  › Step implement — model: sonnet (step)
  › Done — $0.9230 | 26 turns

  ── agent output ────────────────────────────────────────
All tasks complete:
- Replaced `AGENTS.md` with the full guidance document
- Applied the planned eight refinements
- Completed three-tier verification
  ────────────────────────────────────────────────────────

  › Implementation complete after 1 iteration(s)
```

Review validates plan compliance and output quality. Next step is PR Description.

Example artifact: [`review.md`](docs/examples/prompt-update-agents-md-example/review.md)

```text
  ● Review  · task prompt-update-agents-md-a1b2c3d4 ...
  › Step review — model: opus (step)
  › Done — $0.3636 | 13 turns

  ── agent output ────────────────────────────────────────
Review written to `.auto-pr/sample-repo/prompt-update-agents-md-a1b2c3d4/review.md`.

Status: PASS — no issues found. Planned refinements are present and no unrelated files changed.
  ────────────────────────────────────────────────────────
```

PR Description writes `pr-description.md`. Next step is optional Create PR.

Example artifact: [`pr-description.md`](docs/examples/prompt-update-agents-md-example/pr-description.md)

```text
  ● PR Description  · task prompt-update-agents-md-a1b2c3d4 ...
  › Step prDescription — model: opus (step)
  › Done — $0.1816 | 4 turns

  ── agent output ────────────────────────────────────────
PR description written to `.auto-pr/sample-repo/prompt-update-agents-md-a1b2c3d4/pr-description.md`.

## Summary

### Why this change was made

`AGENTS.md` was stripped to a single heading when skill docs were removed.

### Description

This PR restores `AGENTS.md` and makes skill invocation unconditionally first.
  ────────────────────────────────────────────────────────
```

Create PR is optional (`ask` mode shown). Then the run prints a final summary.

```text
Create PR for acme/sample-repo:prompt-update-agents-md-a1b2c3d4? [y/N] n
  › PR creation declined

  ◌ Remove Label  ·  task prompt-update-agents-md-a1b2c3d4 ... [skip]
  › Pipeline complete for acme/sample-repo:prompt-update-agents-md-a1b2c3d4
  › Summary for acme/sample-repo:prompt-update-agents-md-a1b2c3d4 — $2.8557 | 70 turns | 6 agent run(s)
```

Full artifact examples:

- [Artifact examples index](docs/examples/README.md)
- [Full sample task folder](docs/examples/prompt-update-agents-md-example/)

## Installation and setup

### Prerequisites

- `bun`
- `git`
- `gh` (for GitHub issue/PR operations)
- `opencode` or `claude` CLI (depends on runner)

### Quick setup

```bash
bun install
cp ./config.example.json ./config.json
```

### Runtime home resolution

`ai-autopilot` loads config/templates/sources from `AUTO_PR_HOME` using this order:

1. `--home <dir>`
2. `AUTO_PR_HOME=<dir>`
3. Directory next to packaged binary (if it has `prompt-templates/`)
4. Source directory (dev mode)
5. `~/.config/ai-autopilot` (falls back to `~/.config/auto-pr` if present)

## How to use

### Optional shell alias

```bash
alias ai-autopilot='bun run /absolute/path/to/ai-autopilot/index.ts'
```

### Basic command

```bash
bun run ai-autopilot --source "<task-input>" [--repo owner/repo]
```

### Supported source inputs

- `--source "123"` (GitHub issue number)
- `--source "https://github.com/owner/repo/issues/123"`
- `--source "md:tasks/feature.md"` or `--source "tasks/feature.md"`
- `--source "prompt:update onboarding docs"` or plain text
- `--source "https://trello.com/c/..."` (via `sourceCommands.trello`)
- `--source "https://workspace.slack.com/archives/..."` (via `sourceCommands.slack`)

## Runners and models

Runner selection:

- `--runner claude`
- `--runner opencode`

Config example:

```json
{
  "agentRunner": "opencode",
  "models": {
    "opencode": {
      "default": "openai/gpt-5.1-codex",
      "steps": {
        "plan": "openai/gpt-5.3-codex",
        "implement": "openai/gpt-5.3-codex-spark"
      }
    }
  }
}
```

## Sources, hooks, and custom config

### Source commands (Trello/Slack/custom)

Relative `sourceCommands` paths resolve from `AUTO_PR_HOME`.

A source command must print normalized JSON:

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

### Hooks (with notification example)

Hook points:

- `hooks.beforeStep.<step>`
- `hooks.afterStep.<step>`
- `hooks.onNeedInput`

Template variables: `{{step}}`, `{{issue}}`

```json
{
  "hooks": {
    "onNeedInput": "osascript -e 'display notification \"ai-autopilot needs your input\" with title \"ai-autopilot\" sound name \"Glass\"'",
    "afterStep": {
      "review": "osascript -e 'display notification \"Review complete for {{issue}}\" with title \"ai-autopilot\"'"
    }
  }
}
```

Hook failures are warnings only; they do not stop the pipeline.

### Profiles and overrides

Merge order:

`base config -> profile -> CLI flags`

Example:

```json
{
  "profiles": {
    "work": {
      "agentRunner": "claude",
      "until": "plan",
      "promptDir": "prompts/work"
    }
  }
}
```

## Special operations

```bash
# Rebase stale PR branch for issue
bun run ai-autopilot --refresh --issue 42 --repo owner/repo

# Address PR review feedback
bun run ai-autopilot --review-round --issue 42 --repo owner/repo
```

## Standalone binary

```bash
# Build
bash ./build-standalone.sh

# Optional output directory
bash ./build-standalone.sh ./dist/ai-autopilot

# Run packaged binary
cp ./dist/ai-autopilot/config.example.json ./dist/ai-autopilot/config.json
AUTO_PR_HOME="./dist/ai-autopilot" "./dist/ai-autopilot/ai-autopilot" --help
```

## Development helpers

```bash
bun run ./check-integrity.ts
bun run ai-autopilot --help
```

## Repository layout

- `index.ts`: CLI entrypoint and argument handling
- `pipeline.ts`: pipeline step orchestration
- `steps/`: pipeline step implementations
- `prompt-templates/`: prompt files for agent-driven steps
- `sources/`: source input resolvers and adapters
- `utils.ts`: config loading, runner execution, hooks, helper utilities
- `check-integrity.ts`: checks step/template/config consistency

## Credits

- [How I use Claude Code](https://boristane.com/blog/how-i-use-claude-code/) — initial idea
- [franciscohermida/auto-pr](https://github.com/franciscohermida/auto-pr) — initial project that implemented the idea
