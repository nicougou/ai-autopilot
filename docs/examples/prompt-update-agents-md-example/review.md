# Review: update agents.md

## Status: PASS

## Issues found

None.

## Verification

### Plan compliance

All eight refinements from the research/plan are present and correct:

1. Opening summary line mentions "invoke the Skill tool first, before any response or action." - `AGENTS.md:3`
2. EXTREMELY-IMPORTANT block uses capitalized `Skill` and includes "before you do anything else" - `AGENTS.md:6`
3. The Rule says "Sequence: Invoke relevant or requested skills before any response or action." (no ALL-CAPS "BEFORE") - `AGENTS.md:23`
4. Flow diagram: `"User message received" -> "Invoke Skill tool first"` with `[label="Mandatory first step"]` - `AGENTS.md:36`
5. Red Flags intro: "signal that you should pause and re-check process first." - `AGENTS.md:49`
6. Skill Priority: "evaluate them in this order." - `AGENTS.md:68`
7. Skill Types: Rigid mentions "including required checkpoints and sequence"; Flexible mentions "adapt to local conventions as needed"; closing: "The skill heading indicates which strictness applies." - `AGENTS.md:78-82`
8. User Instructions: "Follow user requirements as objectives (WHAT), then run the required workflow (HOW)." - `AGENTS.md:86`

### File integrity

- `AGENTS.md` ends with a newline (`0a`).
- `CLAUDE.md`, `WHOAMI.md`, and `README.md` are unchanged (confirmed via `git diff main...HEAD`).
- Only `AGENTS.md` has substantive changes; remaining diffs are `.auto-pr/` plan/research files.

### Markdown structure

- DOT code fence uses ` ```dot ` language tag with valid `digraph skill_flow {}` block.
- `<EXTREMELY-IMPORTANT>` open and close tags are present and matched.
- Red Flags table has aligned pipes and correct header separators (12 rows).
- No encoding or whitespace anomalies.

### Cross-file consistency

- `CLAUDE.md` still reads "Read AGENTS.md before using this file." - no update needed.
- `WHOAMI.md` describes repo as "empty placeholder" - compatible with `AGENTS.md` serving as a guidance document.

## Confidence level

High. This is a documentation-only change with a well-defined reference. All eight refinements are present, formatting is correct, and no other files were modified.

## Notes

- The reference branch (`auto-pr/prompt-update-agents-md-example-ref`) is not available as a local ref in this worktree, so the exact-match `git diff` acceptance criterion from the plan could not be verified directly. However, all eight refinements documented in the research match the implemented content, and the file structure aligns with the prior version described in the research.
- No automated tests, linting, or CI exist in this repo - verification is editorial only, which is appropriate for a documentation-only placeholder repository.
