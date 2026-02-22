import { join } from "node:path"
import {
  type IssueContext,
  buildTokens,
  commitArtifacts,
  fileExists,
  getConfig,
  logAgentOutput,
  logError,
  logStep,
  PROMPT_TEMPLATES,
  readFile,
  resolveTemplate,
  runAgent,
} from "../utils.js"

/**
 * Step 7 — Generate and print PR description.
 * Always runs to keep pr-description.md in sync with current HEAD.
 */
export async function stepPrDescription(ctx: IssueContext): Promise<boolean> {
  const descPath = join(ctx.issueDir, "pr-description.md")

  logStep("PR Description", ctx)

  const tokens = buildTokens(ctx)
  const prompt = resolveTemplate(PROMPT_TEMPLATES.prDescription, tokens)

  const result = await runAgent({
    prompt,
    stepName: "prDescription",
    permissionMode: "acceptEdits",
    maxTurns: getConfig().maxTurns,
  })

  if (result.is_error) {
    logError(`PR description step failed: ${result.result}`)
    return false
  }

  if (!fileExists(descPath)) {
    logError("PR description step did not produce pr-description.md")
    return false
  }

  const prBody = readFile(descPath)
  logAgentOutput(prBody)
  await commitArtifacts(ctx, `chore(auto-pr): pr description for ${ctx.id}`)
  return true
}
