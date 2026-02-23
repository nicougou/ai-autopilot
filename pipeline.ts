import { join } from "node:path"
import { contextRef, type IssueContext, ensureDir, fileExists, getConfig, git, log, runHook, writeFile } from "./utils.js"
import { stepResearch } from "./steps/001-research.js"
import { stepPlan } from "./steps/002-plan.js"
import { stepPlanAnnotations } from "./steps/003-plan-annotations.js"
import { stepPlanReviewLoop } from "./steps/004-plan-review-loop.js"
import { stepPlanImplementation } from "./steps/005-plan-implementation.js"
import { stepImplement } from "./steps/006-implement.js"
import { stepReview } from "./steps/007-review.js"
import { stepPrDescription } from "./steps/008-pr-description.js"
import { stepCreatePR } from "./steps/009-create-pr.js"
import { stepRemoveLabel } from "./steps/010-remove-label.js"

const STEPS = [
  { name: "research", run: stepResearch },
  { name: "plan", run: stepPlan },
  { name: "plan-annotations", run: stepPlanAnnotations },
  { name: "plan-review-loop", run: stepPlanReviewLoop },
  { name: "plan-implementation", run: stepPlanImplementation },
  { name: "implement", run: stepImplement },
  { name: "review", run: stepReview },
  { name: "pr-description", run: stepPrDescription },
  { name: "create-pr", run: stepCreatePR },
  { name: "remove-label", run: stepRemoveLabel },
] as const

export type StepName = (typeof STEPS)[number]["name"]

export const STEP_NAMES = STEPS.map((s) => s.name)

/**
 * Run the pipeline for a single issue, starting from whatever step is needed.
 * If `untilStep` is provided, stop after that step completes.
 */
export async function runPipeline(ctx: IssueContext, untilStep?: StepName): Promise<void> {
  log(`Pipeline starting for ${contextRef(ctx)}: ${ctx.title}`)
  log(`Task ID: ${ctx.id}`)

  // Checkout the branch first (if it exists) so we see any previously committed artifacts
  try {
    const branches = await git(["branch", "--list", ctx.branch])
    if (branches.includes(ctx.branch.split("/").pop()!)) {
      await git(["checkout", ctx.branch])
    }
  } catch { /* may not exist yet, research step will create it */ }

  // Save initial-ramblings.md for this issue (idempotent — skips if already on branch from prior run)
  ensureDir(ctx.issueDir)
  const ramblingsPath = join(ctx.issueDir, "initial-ramblings.md")
  if (!fileExists(ramblingsPath)) {
    const sourceRef = ctx.number != null ? `${ctx.repo}#${ctx.number}` : `${ctx.repo}:${ctx.id}`
    const content = `# ${ctx.title}\n\n> ${sourceRef}\n\n${ctx.body ?? ""}`
    writeFile(ramblingsPath, content)
    log(`Saved initial-ramblings.md`)
  }

  const { hooks } = getConfig()
  const hookCtx = { issue: contextRef(ctx) }

  for (const step of STEPS) {
    await runHook(hooks.beforeStep?.[step.name], { ...hookCtx, step: step.name })

    const success = await step.run(ctx)

    if (!success) {
      log(`Pipeline stopped at "${step.name}" for ${contextRef(ctx)}`)
      // Return to master so we don't leave the repo on a feature branch
      await git(["checkout", getConfig().mainBranch]).catch(() => {})
      return
    }

    await runHook(hooks.afterStep?.[step.name], { ...hookCtx, step: step.name })

    if (untilStep && step.name === untilStep) {
      log(`Pipeline paused after "${step.name}" (--until ${untilStep})`)
      await git(["checkout", getConfig().mainBranch]).catch(() => {})
      return
    }
  }

  log(`Pipeline complete for ${contextRef(ctx)}`)
  // Return to master
  await git(["checkout", getConfig().mainBranch]).catch(() => {})
}
