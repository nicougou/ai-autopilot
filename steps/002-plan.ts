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
 * Step 3 — Create the high-level plan.
 * Produces plan.md.
 */
export async function stepPlan(ctx: IssueContext): Promise<boolean> {
  const planPath = join(ctx.issueDir, "plan.md")

  if (fileExists(planPath)) {
    logStep("Plan", ctx, true)
    return true
  }

  logStep("Plan", ctx)

  const tokens = buildTokens(ctx)
  const prompt = resolveTemplate(PROMPT_TEMPLATES.plan, tokens)

  const result = await runAgent({
    prompt,
    stepName: "plan",
    permissionMode: "acceptEdits",
    maxTurns: getConfig().maxTurns,
  })

  if (result.is_error) {
    logError(`Plan step failed: ${result.result}`)
    return false
  }

  if (!fileExists(planPath)) {
    logError("Plan step did not produce plan.md")
    return false
  }

  await commitArtifacts(ctx, `chore(auto-pr): plan for ${ctx.id}`)
  return true
}
