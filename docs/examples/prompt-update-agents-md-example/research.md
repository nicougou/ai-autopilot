# Research for "update agents.md"

## Summary

The issue says "update agents.md". The repository is a documentation-only placeholder (`acme/sample-repo`) with no application code. The current `AGENTS.md` is essentially empty-just a heading-because a prior cleanup commit deleted skill documents and stripped `AGENTS.md` to a single line. A sibling branch (`auto-pr/prompt-update-agents-md-example-ref`) shows a completed implementation of this same issue, which serves as a reference for both structure and content.

---

## Relevant files

| File | Description |
|------|-------------|
| `AGENTS.md` | Primary agent instruction file. Currently only contains `# Agents instructions`. Needs to be restored/updated with the full workflow guidance. |
| `CLAUDE.md` | Three-line file that says "Read AGENTS.md before using this file." If `AGENTS.md` structure or title changes this may also need a touch. |
| `WHOAMI.md` | Repo metadata consumed by `repo_lookup` MCP tool. Describes repo as `empty / placeholder`. Any references in `AGENTS.md` must not contradict this. |
| `README.md` | Minimal `# empty` placeholder. Not touched by this task. |
| `.auto-pr/sample-repo/prompt-update-agents-md-a1b2c3d4/initial-ramblings.md` | Issue source text: "update agents.md". |

### Reference material (on sibling branch)

| Resource | Location |
|----------|----------|
| Completed `AGENTS.md` | `git show auto-pr/prompt-update-agents-md-example-ref:AGENTS.md` |
| Reference research | `auto-pr/prompt-update-agents-md-example-ref:.auto-pr/…/research.md` |
| Reference plan | `auto-pr/prompt-update-agents-md-example-ref:.auto-pr/…/plan.md` |

---

## Current state vs. expected state

### Current `AGENTS.md` (after prior cleanup commit)

```
# Agents instructions
```

That is the entire file.

### Prior `AGENTS.md` (before deletion)

Full-length (~86 lines) with:
- `EXTREMELY-IMPORTANT` block mandating skill invocation
- "How to Access Skills" section
- "The Rule" section with a DOT-language flow diagram
- "Red Flags" decision table (12 rows)
- "Skill Priority" section (process-first ordering)
- "Skill Types" section (rigid vs. flexible)
- "User Instructions" section

### Target `AGENTS.md` (reference branch `example-ref`)

Same structure as the prior version but with these specific refinements:

1. **Opening summary line**: "Use when starting any conversation - always invoke the Skill tool first, before any response or action." (vs. previous softer wording)
2. **`EXTREMELY-IMPORTANT` block**: Capitalizes `Skill`, adds "before you do anything else", uses sentence case for body lines.
3. **"The Rule" phrasing**: "Sequence: Invoke relevant or requested skills before any response or action." (vs. "Invoke relevant or requested skills BEFORE any response or action.")
4. **Flow diagram**: Restructured so "Invoke Skill tool first" is the mandatory first node from "User message received", not a branch of a preceding decision diamond:
   - Old: `User message received → Might any skill apply? → Invoke Skill tool`
   - New: `User message received → Invoke Skill tool first (Mandatory first step) → Does any skill apply?`
5. **Red Flags table**: Phrasing shifted from accusatory ("you're rationalizing") to instructional ("signal that you should pause and re-check process first"). Each row entry is slightly reworded for clarity.
6. **Skill Priority**: "use this order" → "evaluate them in this order".
7. **Skill Types**: Rigid entries add "including required checkpoints and sequence"; flexible entry adds "adapt to local conventions as needed"; closing note changed from "The skill itself tells you which" to "The skill heading indicates which strictness applies."
8. **User Instructions**: "Instructions say WHAT, not HOW." → "Follow user requirements as objectives (WHAT), then run the required workflow (HOW)."

---

## Existing patterns

- **Documentation-only repo.** No source code, tests, build steps, or CI. All changes are Markdown edits. Verification is purely editorial.
- **Instruction hierarchy.** `AGENTS.md` is the authoritative doc; `CLAUDE.md` defers to it. Any structural change to `AGENTS.md` may require a corresponding update to `CLAUDE.md`.
- **Assertive imperative tone.** The file uses caps (`MUST`, `EXTREMELY-IMPORTANT`), tables, and dot graph snippets. New content should maintain this style.
- **Process-first ordering.** Skills sections consistently put process skills (brainstorming, debugging) before implementation skills.
- **DOT graph for flow.** The existing convention is a `dot` code fence with a `digraph skill_flow {}` block-not a Mermaid diagram or prose description.

---

## Dependencies

- **`.claude/skills/`**: Skill documents that `AGENTS.md` references. This directory was emptied in a prior cleanup commit. `AGENTS.md` itself doesn't hard-code skill names in the workflow sections (only uses examples like "brainstorming", "debugging"), so the empty skills directory doesn't break the guidance prose. However, if the update references specific skills by name, they would need to exist.
- **`Skill` tool and `TodoWrite` tool**: Referenced in the flow diagram and guidance. These are external to the repo (Claude Code runtime). The file should accurately describe how they work.
- **`repo_lookup` MCP tool**: `WHOAMI.md` feeds this. `AGENTS.md` does not reference `WHOAMI.md` directly, so no cross-dependency conflict expected.

---

## Potential impact areas

- **`CLAUDE.md`**: Currently just redirects to `AGENTS.md`. If the update changes `AGENTS.md`'s title or adds conflicting instructions, `CLAUDE.md` may need a consistency pass. The reference branch does not change `CLAUDE.md`.
- **`WHOAMI.md`**: Describes the repo as an "empty placeholder." `AGENTS.md` is the authoritative guidance doc; these don't contradict each other. No changes expected.
- **Agent behavior in other repos**: `AGENTS.md` in this repo gets loaded when working inside this repo. Since it defines skill invocation behavior, tightening the language here affects how agents work on tasks in this directory. No code impact elsewhere.

---

## Edge cases and constraints

- **No automated tests.** There is no linting, typecheck, or CI. The only verification is a manual read-through of the final document.
- **ASCII-only markdown.** Current file is ASCII except for angle-bracket tags (`<EXTREMELY-IMPORTANT>`). Keep new content ASCII.
- **Table and code block formatting.** Markdown tables and the DOT code fence are relied upon for clarity. Breaking the formatting (e.g., misaligned table pipes, wrong fenced language tag) would degrade usability in CLI contexts.
- **Skill directory is empty.** `AGENTS.md` describes how to invoke skills, but no skill files exist. This is not a bug to fix here-the task is to update the guidance text, not restore skills. The guidance remains valid even with an empty skills directory.
- **Issue description is minimal.** "update agents.md" is the entire spec. The reference branch is the best available signal for intent.

---

## Reference implementation

Branch `auto-pr/prompt-update-agents-md-example-ref` contains a completed version of this exact task. The implementation was done in 6 incremental commits:

| Commit | Change |
|--------|--------|
| `abc1234` | Tighten skill invocation sequencing (opening line, EXTREMELY-IMPORTANT block, The Rule) |
| `bcd2345` | Sync flow diagram with new invocation order |
| `cde3456` | Refine Red Flags, Skill Priority, Skill Types, User Instructions |
| `def4567` | Consistency pass between AGENTS.md and CLAUDE.md |
| `efg5678` | Verify WHOAMI.md alignment |
| `fgh6789` | Three-tier verification |

The final `AGENTS.md` on that branch is the authoritative reference for what this implementation should produce.

---

## Testing / verification approach

Since there are no automated tests:
- **Tier 1**: Markdown structure check (tables render, code fences have correct language tags, no broken links).
- **Tier 2**: Manual read-through from top to bottom-verify rule ordering, example consistency, no contradictions with `CLAUDE.md` or `WHOAMI.md`.
- **Tier 3**: `git diff` walkthrough to confirm only `AGENTS.md` changed (and optionally `CLAUDE.md` if a consistency change is needed).
