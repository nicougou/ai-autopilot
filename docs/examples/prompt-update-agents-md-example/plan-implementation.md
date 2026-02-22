# Implementation Checklist: Update AGENTS.md

## Context

Replace the single-line `AGENTS.md` (`# Agents instructions`) with the full updated content from the reference branch (`auto-pr/prompt-update-agents-md-example-ref`). No other files change.

---

- [x] **Task 1: Replace AGENTS.md with full updated content**
  - **Files:** `AGENTS.md`
  - **Changes:** Replace the entire file content (currently just `# Agents instructions`) with the complete reference content. The new file contains these sections in order:
    1. `# Agents instructions` heading with summary line: "Use when starting any conversation - always invoke the Skill tool first, before any response or action."
    2. `<EXTREMELY-IMPORTANT>` block with capitalized `Skill`, "before you do anything else" clause, and three imperative sentences.
    3. `## How to Access Skills` - instructions for Claude Code (`Skill` tool) and other environments.
    4. `# Using Skills` with `## The Rule` - sequencing rule with the restructured DOT `digraph skill_flow` where `"User message received"` goes directly to `"Invoke Skill tool first"` (mandatory first step), then to `"Does any skill apply?"` decision diamond.
    5. `## Red Flags` - 12-row table with instructional tone (e.g., "signal that you should pause and re-check process first"), not accusatory.
    6. `## Skill Priority` - "evaluate them in this order" phrasing, process skills first, implementation skills second.
    7. `## Skill Types` - Rigid includes "including required checkpoints and sequence"; Flexible includes "adapt to local conventions as needed"; closing line: "The skill heading indicates which strictness applies."
    8. `## User Instructions` - "Follow user requirements as objectives (WHAT), then run the required workflow (HOW)."
  - **Source:** Copy content exactly from `git show auto-pr/prompt-update-agents-md-example-ref:AGENTS.md`.
  - **Acceptance criteria:**
    - `git diff auto-pr/prompt-update-agents-md-example-ref -- AGENTS.md` returns empty (exact match).
    - File ends with a newline.
    - No other files are modified.

- [x] **Task 2: Three-tier verification**
  - **Files:** None modified - read-only verification.
  - **Checks:**
    - **Tier 1 (lint/typecheck):** N/A - documentation-only repo with no CI, linting, or type checking. Confirm no build tools exist (`package.json`, `tsconfig.json`, etc. should not be present).
    - **Tier 2 (manual smoke check):**
      - Read `AGENTS.md` top-to-bottom and verify:
        - Markdown tables render correctly (aligned pipes, header separators).
        - DOT code fence uses ` ```dot ` language tag and contains valid `digraph skill_flow {}` block.
        - `<EXTREMELY-IMPORTANT>` open and close tags are present and matched.
        - All eight refinements from the research are present:
          1. Opening summary line mentions "invoke the Skill tool first, before any response or action."
          2. EXTREMELY-IMPORTANT block uses capitalized `Skill` and includes "before you do anything else."
          3. The Rule says "Sequence: Invoke relevant or requested skills before any response or action." (no ALL-CAPS "BEFORE").
          4. Flow diagram: `"User message received" -> "Invoke Skill tool first"` with `[label="Mandatory first step"]`.
          5. Red Flags intro: "signal that you should pause and re-check process first."
          6. Skill Priority: "evaluate them in this order."
          7. Skill Types: Rigid mentions "including required checkpoints and sequence"; Flexible mentions "adapt to local conventions as needed"; closing: "The skill heading indicates which strictness applies."
          8. User Instructions: "Follow user requirements as objectives (WHAT), then run the required workflow (HOW)."
      - Verify `CLAUDE.md` still reads "Read AGENTS.md before using this file." - no changes needed.
      - Verify `WHOAMI.md` content does not contradict `AGENTS.md` - it describes the repo as "empty placeholder" which is compatible with the guidance doc.
    - **Tier 3 (`git diff` walkthrough):**
      - Run `git diff main...HEAD` and confirm:
        - Only `AGENTS.md` has substantive changes (plan/research files in `.auto-pr/` are expected).
        - `CLAUDE.md`, `WHOAMI.md`, and `README.md` are unchanged.
        - No unintended whitespace, encoding, or line-ending differences.
