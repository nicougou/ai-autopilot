import { join } from "node:path"
import {
  type IssueContext,
  buildTokens,
  commitArtifacts,
  fileExists,
  getConfig,
  log,
  logError,
  logStep,
  PROMPT_TEMPLATES,
  readFile,
  resolveTemplate,
  runAgent,
  writeFile,
} from "../utils.js"

function parseVerdict(review: string): "APPROVED" | "REVISE" | undefined {
  const match = review.match(/^VERDICT:\s*(APPROVED|REVISE)\b/im)
  if (!match) return undefined
  return match[1].toUpperCase() as "APPROVED" | "REVISE"
}

function buildRevisionPrompt(ctx: IssueContext, round: number): string {
  return [
    "You are a senior developer revising a plan based on reviewer feedback.",
    "",
    `Read the current plan in @${ctx.issueDirRel}/plan.md and the latest review in @${ctx.issueDirRel}/plan-review.md.`,
    `Also read @${ctx.issueDirRel}/initial-ramblings.md and @${ctx.issueDirRel}/research.md.`,
    "",
    "CRITICAL RULES:",
    "- Do NOT implement the issue. Do not modify any project source files.",
    `- Your ONLY deliverable is updating @${ctx.issueDirRel}/plan.md.`,
    "- Address all actionable review feedback while keeping the plan concise.",
    "- Keep the plan structure intact unless the review requires structural changes.",
    "- Do not ask follow-up questions. Apply best judgment and update the plan directly.",
    "",
    `This is revision round ${round}.`,
  ].join("\n")
}

export async function stepPlanReviewLoop(ctx: IssueContext): Promise<boolean> {
  const cfg = getConfig()
  if (!cfg.planReviewLoopEnabled) {
    logStep("Plan-Review-Loop", ctx, true)
    return true
  }

  const planPath = join(ctx.issueDir, "plan.md")
  const reviewPath = join(ctx.issueDir, "plan-review.md")
  const summaryPath = join(ctx.issueDir, "plan-review-summary.md")

  if (fileExists(summaryPath)) {
    const existingSummary = readFile(summaryPath)
    if (/Final verdict:\s*APPROVED/i.test(existingSummary)) {
      logStep("Plan-Review-Loop", ctx, true)
      return true
    }
  }

  if (!fileExists(planPath)) {
    logError("Plan-Review-Loop requires plan.md")
    return false
  }

  logStep("Plan-Review-Loop", ctx)

  let approved = false
  let roundsRun = 0
  for (let round = 1; round <= cfg.planReviewMaxRounds; round++) {
    roundsRun = round
    log(`Plan review round ${round}/${cfg.planReviewMaxRounds}`)

    const tokens = buildTokens(ctx)
    const reviewerPrompt = `${resolveTemplate(PROMPT_TEMPLATES.planReview, tokens)}\n\nRound: ${round}.`
    const reviewResult = await runAgent({
      prompt: reviewerPrompt,
      stepName: "planReview",
      permissionMode: "acceptEdits",
      maxTurns: cfg.maxTurns,
    })

    if (reviewResult.is_error) {
      logError(`Plan-Review-Loop reviewer failed: ${reviewResult.result}`)
      return false
    }

    if (!fileExists(reviewPath)) {
      logError("Plan-Review-Loop reviewer did not produce plan-review.md")
      return false
    }

    const reviewContent = readFile(reviewPath)
    const roundReviewPath = join(ctx.issueDir, `plan-review-round-${round}.md`)
    writeFile(roundReviewPath, reviewContent)

    const verdict = parseVerdict(reviewContent)
    if (!verdict) {
      logError(`Plan-Review-Loop round ${round} missing verdict. Expected 'VERDICT: APPROVED' or 'VERDICT: REVISE'.`)
      return false
    }

    if (verdict === "APPROVED") {
      approved = true
      break
    }

    if (round === cfg.planReviewMaxRounds) {
      break
    }

    const revisionResult = await runAgent({
      prompt: buildRevisionPrompt(ctx, round),
      stepName: "plan",
      permissionMode: "acceptEdits",
      maxTurns: cfg.maxTurns,
    })

    if (revisionResult.is_error) {
      logError(`Plan-Review-Loop revision failed: ${revisionResult.result}`)
      return false
    }

    if (!fileExists(planPath)) {
      logError("Plan-Review-Loop revision did not preserve plan.md")
      return false
    }
  }

  writeFile(
    summaryPath,
    [
      "# Plan review summary",
      "",
      `- Rounds run: ${roundsRun}`,
      `- Final verdict: ${approved ? "APPROVED" : "REVISE"}`,
      `- Max rounds: ${cfg.planReviewMaxRounds}`,
      "",
      "Artifacts:",
      `- Latest review: ${ctx.issueDirRel}/plan-review.md`,
      ...Array.from({ length: roundsRun }, (_, i) => `- Round ${i + 1}: ${ctx.issueDirRel}/plan-review-round-${i + 1}.md`),
    ].join("\n"),
  )

  if (!approved) {
    logError(`Plan-Review-Loop reached max rounds (${cfg.planReviewMaxRounds}) without approval`)
    return false
  }

  await commitArtifacts(ctx, `chore(auto-pr): plan review loop for ${ctx.id}`)
  return true
}
