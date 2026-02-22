# Plan: Update AGENTS.md

## 1. Summary

`AGENTS.md` was stripped to a single heading (`# Agents instructions`) in a prior cleanup commit when skill documents were removed. The task is to restore and refine its full content. The reference branch (`auto-pr/prompt-update-agents-md-example-ref`) contains a completed version that tightens the skill-invocation sequencing, restructures the flow diagram to make invocation unconditionally first, and shifts the Red Flags tone from accusatory to instructional. This plan produces that same result.

## 2. Approach

Replace the single-line `AGENTS.md` with the full updated content in one commit. The content matches the reference branch's final `AGENTS.md` exactly - all eight refinements identified in research (opening line, EXTREMELY-IMPORTANT block, The Rule phrasing, flow diagram restructure, Red Flags tone, Skill Priority wording, Skill Types detail, User Instructions rewrite). No other files change - `CLAUDE.md` and `WHOAMI.md` are already consistent.

## 3. Architectural decisions

| Decision | Rationale |
|----------|-----------|
| Single commit, not incremental | The prior version was fully deleted. There's no partial state worth preserving, and the reference content is a known-good target. One atomic commit is cleaner for review. |
| Match reference branch exactly | The reference branch (`example-ref`) is the authoritative target per research. Deviating would require justification that doesn't exist. |
| No changes to `CLAUDE.md` | Reference branch leaves `CLAUDE.md` unchanged. Current `CLAUDE.md` already redirects to `AGENTS.md` - no title or structural conflict. |
| No changes to `WHOAMI.md` | `AGENTS.md` doesn't reference `WHOAMI.md` and the content doesn't contradict it. |

## 4. Key code snippets

The critical structural change is the flow diagram. Old version branched on a decision diamond first:

```dot
"User message received" -> "Might any skill apply?";
"Might any skill apply?" -> "Invoke Skill tool" [label="yes, even 1%"];
```

New version makes invocation the mandatory first step:

```dot
"User message received" -> "Invoke Skill tool first" [label="Mandatory first step"];
"Invoke Skill tool first" -> "Does any skill apply?";
```

The EXTREMELY-IMPORTANT block capitalizes `Skill` and adds the "before you do anything else" clause:

```markdown
<EXTREMELY-IMPORTANT>
If you think there is even a 1% chance a Skill might apply to what you are doing,
you ABSOLUTELY MUST invoke it before you do anything else.

IF a Skill applies to your task, you do not have a choice. You MUST use it.
```

The opening summary line becomes explicit about sequencing:

```markdown
Use when starting any conversation - always invoke the Skill tool first,
before any response or action.
```

## 5. Scope boundaries

- **In scope**: Replace `AGENTS.md` content with the reference branch version.
- **Out of scope**: Restoring `.claude/skills/` contents (deleted in prior cleanup - separate concern). Adding new sections beyond what the reference provides. Modifying `CLAUDE.md`, `WHOAMI.md`, or `README.md`.

## 6. Risks

| Risk | Mitigation |
|------|------------|
| Markdown formatting breaks in CLI rendering | Verify table alignment and code fence language tags manually post-write. |
| Content drift from reference | Diff the final file against `git show auto-pr/prompt-update-agents-md-example-ref:AGENTS.md` to confirm exact match. |
| Skills directory is empty | Not a problem - `AGENTS.md` describes the invocation *process*, not specific skills. The guidance remains valid regardless of directory contents. |

## 7. Alternative approaches

| Approach | How it works | Why not chosen |
|----------|-------------|----------------|
| Restore prior version verbatim | `git show <prior-commit>:AGENTS.md` - use the pre-deletion content as-is. | Misses the eight refinements (tighter sequencing, restructured diagram, instructional tone). The reference branch exists specifically because the old version needed these improvements. |
| Incremental commits mirroring reference | Six separate commits matching the reference branch's commit history. | Adds complexity for no benefit - the starting point is a blank file, not the prior version. Incremental commits make sense for reviewable diffs against existing content, not for restoring from scratch. |
| Cherry-pick reference branch | `git cherry-pick` the commits from `example-ref`. | Those commits were made against the prior version, not a blank file. Cherry-picking would likely conflict and require manual resolution anyway. |

## 8. Verification

**Tier 1 (lint/typecheck):** N/A - documentation-only repo with no CI, linting, or type checking.

**Tier 2 (manual smoke):**
- Confirm markdown renders correctly: tables align, code fences use correct language tags (`dot`), `<EXTREMELY-IMPORTANT>` tags are intact.
- Read through the full document top-to-bottom for coherence.
- Diff against reference: `git diff auto-pr/prompt-update-agents-md-example-ref -- AGENTS.md` should show no differences.

**Tier 3 (staged diff walkthrough):**
- `git diff HEAD -- AGENTS.md` - confirm only `AGENTS.md` changed.
- `git diff HEAD -- CLAUDE.md WHOAMI.md README.md` - confirm no unintended changes to other files.
