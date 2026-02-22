import { join } from "node:path"
import {
  type IssueContext,
  buildTokens,
  commitArtifacts,
  fileExists,
  getConfig,
  git,
  logError,
  logStep,
  PROMPT_TEMPLATES,
  readFile,
  resolveTemplate,
  runAgent,
} from "../utils.js"

/**
 * Step 2 — Research the codebase for the issue.
 * Creates the branch and produces research.md.
 */
export async function stepResearch(ctx: IssueContext): Promise<boolean> {
  const researchPath = join(ctx.issueDir, "research.md")

  if (fileExists(researchPath) && readFile(researchPath).length > 200) {
    logStep("Research", ctx, true)
    return true
  }

  logStep("Research", ctx)

  // Ensure branch exists
  await ensureBranch(ctx.branch)

  // Resolve and run prompt
  const tokens = buildTokens(ctx)
  const prompt = resolveTemplate(PROMPT_TEMPLATES.research, tokens)

  const result = await runAgent({
    prompt,
    stepName: "research",
    permissionMode: "acceptEdits",
    maxTurns: getConfig().maxTurns,
  })

  if (result.is_error) {
    logError(`Research step failed: ${result.result}`)
    return false
  }

  // Validate output
  if (!fileExists(researchPath) || readFile(researchPath).length <= 200) {
    logError("Research step did not produce a valid research.md")
    return false
  }

  await commitArtifacts(ctx, `chore(auto-pr): research for ${ctx.id}`)
  return true
}

async function ensureBranch(branch: string): Promise<void> {
  const { mainBranch, remote } = getConfig()

  // Check if branch already exists
  try {
    const branches = await git(["branch", "--list", branch])
    if (branches.includes(branch)) {
      await git(["checkout", branch])
      return
    }
  } catch { /* ignore */ }

  // Check if remote branch exists
  try {
    await git(["fetch", remote, branch])
    await git(["checkout", branch])
    return
  } catch { /* doesn't exist remotely */ }

  // Create new branch from main
  try {
    await git(["checkout", mainBranch])
    await git(["pull", remote, mainBranch])
    await git(["checkout", "-b", branch])
    return
  } catch {
    // In worktree mode, main may already be checked out elsewhere.
    // Fallback: create the branch from current HEAD.
  }

  await git(["checkout", "-b", branch])
}
