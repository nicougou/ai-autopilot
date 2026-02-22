import { join } from "node:path"
import {
  type IssueContext,
  buildTokens,
  commitArtifacts,
  fileExists,
  getConfig,
  logError,
  logStep,
  PROMPT_TEMPLATES,
  resolveTemplate,
  runAgent,
} from "../utils.js"

/**
 * Step 6 — Self-review the implementation.
 * Checks for common mistakes and produces review.md.
 */
export async function stepReview(ctx: IssueContext): Promise<boolean> {
  const reviewPath = join(ctx.issueDir, "review.md")

  if (fileExists(reviewPath)) {
    logStep("Review", ctx, true)
    return true
  }

  logStep("Review", ctx)

  const tokens = buildTokens(ctx)
  const prompt = resolveTemplate(PROMPT_TEMPLATES.review, tokens)

  const result = await runAgent({
    prompt,
    stepName: "review",
    permissionMode: "acceptEdits",
    maxTurns: getConfig().maxTurns,
  })

  if (result.is_error) {
    logError(`Review step failed: ${result.result}`)
    return false
  }

  if (!fileExists(reviewPath)) {
    logError("Review step did not produce review.md")
    return false
  }

  await commitArtifacts(ctx, `chore(auto-pr): review for ${ctx.id}`)
  return true
}
