import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import {
  contextRef,
  type IssueContext,
  buildTokens,
  commitArtifacts,
  fileExists,
  fireNeedInputHook,
  getConfig,
  git,
  log,
  logError,
  logStep,
  PROMPT_TEMPLATES,
  resolveTemplate,
  runAgent,
} from "../utils.js";

/**
 * Step 6 — Implement the code changes.
 * Loops Claude with acceptEdits until completed-summary.md is created
 * (meaning all plan-implementation.md checkboxes are checked).
 */
export async function stepImplement(ctx: IssueContext): Promise<boolean> {
  const completedPath = join(ctx.issueDir, "completed-summary.md");
  const cfg = getConfig();
  const maxIterations = cfg.maxImplementIterations;

  if (fileExists(completedPath)) {
    logStep("Implement", ctx, true);
    return true;
  }

  logStep("Implement", ctx);

  if (cfg.askBeforeImplement) {
    await fireNeedInputHook(ctx);
    const confirmed = await askToStartImplementation(ctx);
    if (!confirmed) {
      log("Implementation cancelled by user");
      return false;
    }
  }

  // Make sure we're on the right branch
  await git(["checkout", ctx.branch]);

  for (let i = 1; i <= maxIterations; i++) {
    log(`Implementation iteration ${i}/${maxIterations}`);

    const tokens = buildTokens(ctx);
    const prompt = resolveTemplate(PROMPT_TEMPLATES.implement, tokens);

    const result = await runAgent({
      prompt,
      stepName: "implement",
      permissionMode: "acceptEdits",
      maxTurns: cfg.maxTurns,
    });

    if (result.is_error) {
      logError(`Implement iteration ${i} failed: ${result.result}`);
      return false;
    }

    // Check if Claude created the completion signal
    if (fileExists(completedPath)) {
      log(`Implementation complete after ${i} iteration(s)`);
      await commitArtifacts(ctx, `chore(auto-pr): implementation complete for ${ctx.id}`);
      return true;
    }

    log(`Iteration ${i} finished but completed-summary.md not yet created — tasks remain`);
  }

  logError(`Implementation did not complete after ${maxIterations} iterations`);
  return false;
}

async function askToStartImplementation(ctx: IssueContext): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    log(`Non-interactive shell: cannot ask confirmation before implement for ${contextRef(ctx)}`);
    return false;
  }

  printImplementationTips(ctx);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`Start implementation for ${contextRef(ctx)}? [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

function printImplementationTips(ctx: IssueContext): void {
  const base = ctx.issueDirRel;
  const resumeCmd = `bun run ai-autopilot --resume --id "${ctx.id}" --repo "${ctx.repoShort}"`;
  console.log(`\n  Implementation checkpoint`);
  console.log(`  · Review ${base}/plan-annotations.md before answering`);
  console.log(`  · Answer No → run: ${resumeCmd}`);
  console.log(`  · Start only when plan + checklist look final\n`);
}
