# Completed: Update AGENTS.md

## What was done

Replaced the single-line `AGENTS.md` (`# Agents instructions`) with a full skill invocation guidance document applying 8 specific refinements over the prior version.

## Changes

**`AGENTS.md`** - full rewrite from 1 line to 86 lines:

- Opening summary: "always invoke the Skill tool first, before any response or action"
- `<EXTREMELY-IMPORTANT>` block: capitalized `Skill`, "before you do anything else", sentence case (no ALL-CAPS body lines), three imperative statements
- `## How to Access Skills`: Claude Code (`Skill` tool) + other environments
- `## The Rule`: "Sequence: Invoke relevant or requested skills before any response or action." (no ALL-CAPS BEFORE)
- Flow diagram: restructured so `"User message received" -> "Invoke Skill tool first" [label="Mandatory first step"]` is the mandatory first step, then `"Does any skill apply?"` decision diamond
- `## Red Flags`: intro changed from accusatory to instructional ("signal that you should pause and re-check process first"); 12 rows with instructional rewording
- `## Skill Priority`: "evaluate them in this order" phrasing; process skills first, implementation skills second
- `## Skill Types`: Rigid includes "including required checkpoints and sequence"; Flexible includes "adapt to local conventions as needed"; closing: "The skill heading indicates which strictness applies."
- `## User Instructions`: "Follow user requirements as objectives (WHAT), then run the required workflow (HOW)."

## Verification

- **Tier 1**: N/A - documentation-only repo, no build tools
- **Tier 2**: All 8 refinements confirmed present; `CLAUDE.md` unchanged; `WHOAMI.md` compatible
- **Tier 3**: `git diff main...HEAD` shows only `AGENTS.md` + expected `.auto-pr/` plan files changed; `CLAUDE.md`, `WHOAMI.md`, `README.md` untouched
