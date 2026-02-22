You are writing a pull request description for an automated implementation.

Read the pipeline artifacts to understand what was built:
- Original issue/task: @{{ISSUE_DIR}}/initial-ramblings.md
- High-level plan: @{{ISSUE_DIR}}/plan.md
- What was implemented: @{{ISSUE_DIR}}/completed-summary.md
- Review findings: @{{ISSUE_DIR}}/review.md (may not exist — skip if missing)

Also run:
- `git diff {{MAIN_BRANCH}}...HEAD --stat` — to see which files changed
- `git log {{MAIN_BRANCH}}..HEAD --oneline` — to see the commit history

**CRITICAL RULES:**
- Do NOT modify any source files. Your ONLY deliverable is writing @{{ISSUE_DIR}}/pr-description.md.
- Do not ask follow-up questions. Write the file directly.

Write @{{ISSUE_DIR}}/pr-description.md with this structure:

## Summary

### Why this change was made

<One sentence explaining the problem this PR solves or the feature it adds>

### Description

<One plain-language sentence about what changed>

- <Meaningful change #1>
- <Meaningful change #2>
- <Meaningful change #3 — add more if needed, omit if not>

### Blast Radius

- <What areas of the codebase are affected>
- <Who or what is impacted>

### Decisions

- <Key technical choice made and why — reference plan.md>

### Risk Rating

- <X/10 — one-line rationale>

### Verification

- <What the implementation agent validated>
- <What the review agent checked — or "Review step was skipped" if review.md is missing>

### Session Notes

- <Anything a reviewer should pay attention to>
- <Follow-up items surfaced during implementation or review — omit section if none>

## Tone rules

- Natural phrasing: "This PR adds...", "This PR fixes...", "You can now..."
- Specific, not vague ("removes the N+1 query on user load" beats "improves performance")
- Active voice, short sentences
- Avoid: "Implemented", "Utilized", "Leverages", "This PR aims to"
