## Summary

### Why this change was made

`AGENTS.md` was stripped to a single heading when skill documents were removed, leaving agents with no skill invocation guidance.

### Description

This PR restores `AGENTS.md` with a refined version that makes skill invocation unconditionally the first step in every agent interaction.

- Adds `<EXTREMELY-IMPORTANT>` block requiring skill invocation "before you do anything else"
- Restructures the flow diagram so "Invoke Skill tool first" is the mandatory first step, not a conditional branch
- Rewrites Red Flags section from accusatory tone ("You failed to...") to instructional tone ("These signal you should pause and re-check")
- Adds Skill Priority ordering (process skills first, implementation skills second) and Skill Types definitions (rigid vs. flexible)
- Adds User Instructions section clarifying that user requirements are the WHAT, skill workflows are the HOW

### Blast Radius

- Only `AGENTS.md` changed - no other repo files modified
- Affects all AI agent behavior in this repository by providing skill invocation sequencing rules

### Decisions

- Single atomic commit rather than incremental changes, since the starting point was a blank file with no partial state worth preserving
- Content matches the reference branch (`auto-pr/prompt-update-agents-md-example-ref`) which was the authoritative target for all eight refinements

### Risk Rating

- 1/10 - documentation-only change in a placeholder repo with no CI, no runtime code, and no downstream dependencies

### Verification

- Implementation agent confirmed all 8 refinements present, markdown structure valid, and no unintended changes to `CLAUDE.md`, `WHOAMI.md`, or `README.md`
- Review agent verified plan compliance for each refinement with line references, checked file integrity (trailing newline, no encoding anomalies), validated DOT code fence and table formatting, and confirmed cross-file consistency with `CLAUDE.md`

### Session Notes

- The reference branch was not available as a local ref in this worktree, so exact-match `git diff` could not be run - verification relied on checking all eight documented refinements individually
