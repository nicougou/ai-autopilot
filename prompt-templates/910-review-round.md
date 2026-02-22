You are addressing PR review feedback for an automated implementation.

## Context

Read these files to understand the task and what reviewers are asking:
- Original issue/task: @{{ISSUE_DIR}}/initial-ramblings.md
- Implementation plan: @{{ISSUE_DIR}}/plan-implementation.md
- Completion summary: @{{ISSUE_DIR}}/completed-summary.md
- **Review comments to address**: @{{ISSUE_DIR}}/pr-review-comments.md

Also run:
- `git diff {{MAIN_BRANCH}}...HEAD` — to see current changes
- `git log {{MAIN_BRANCH}}..HEAD --oneline` — to see commit history

## Your task

1. Read all review comments carefully
2. For each actionable comment:
   - Understand what the reviewer is asking for
   - Make the requested change (edit files directly)
   - If a comment is unclear or conflicts with the plan, use your best judgment and note it in the summary
3. Run the project's linter/typecheck if applicable (detect from lockfile: `bun.lock` → bun, `pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn, else npm)
4. Commit your fixes: `fix(scope): address PR review feedback`

The code for this project lives primarily at `{{SCOPE_PATH}}/`.

**CRITICAL RULES:**
- Address ALL actionable review comments. Do not skip any.
- Do NOT expand beyond what reviewers asked for — no unrequested refactors or features.
- Do NOT modify pipeline artifacts (plan.md, research.md, etc.) unless a reviewer specifically asks.
- Do NOT push to remote — the pipeline handles that.
- Do not ask follow-up questions in chat/output. Use best judgment and write the summary file.

Write your summary to @{{ISSUE_DIR}}/review-round-summary.md with:
- **Status**: ADDRESSED or PARTIALLY-ADDRESSED
- **Comments addressed** — for each reviewer comment, what you changed and why
- **Comments not addressed** (if any) — what you skipped and why (e.g., unclear, out of scope, disagree with rationale)
- **Files changed** — list of files modified in this round
- **Notes** — anything the reviewer should re-check
