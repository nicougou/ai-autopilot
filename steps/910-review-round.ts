import { join } from "node:path"
import { rmSync } from "node:fs"
import {
  type IssueContext,
  buildTokens,
  commitArtifacts,
  fileExists,
  getConfig,
  ghRaw,
  git,
  log,
  logError,
  logStep,
  PROMPT_TEMPLATES,
  resolveTemplate,
  runAgent,
  writeFile,
} from "../utils.js"

interface PRReview {
  author: { login: string }
  body: string
  state: string
  submittedAt: string
}

interface PRComment {
  author: { login: string }
  body: string
  createdAt: string
}

interface LineComment {
  path: string
  line: number | null
  body: string
  user: { login: string }
  diff_hunk: string
  created_at: string
}

/**
 * Special operation — Address PR review feedback.
 * Fetches review comments from GitHub, runs an agent to fix issues, and pushes.
 */
export async function stepReviewRound(ctx: IssueContext): Promise<boolean> {
  logStep("Review Round", ctx)
  const cfg = getConfig()

  // Ensure branch exists and check it out
  try {
    await git(["checkout", ctx.branch])
  } catch {
    try {
      await git(["fetch", cfg.remote, ctx.branch])
      await git(["checkout", ctx.branch])
    } catch {
      logError(`Branch ${ctx.branch} does not exist locally or remotely.`)
      return false
    }
  }

  // Get PR number for this branch
  const prData = await ghRaw([
    "pr", "view", ctx.branch,
    "--repo", ctx.repo,
    "--json", "number",
  ])

  let prNumber: number
  try {
    prNumber = JSON.parse(prData).number
  } catch {
    logError(`No open PR found for branch ${ctx.branch} in ${ctx.repo}`)
    return false
  }

  log(`Found PR #${prNumber}`)

  // Fetch review data
  const [reviewData, lineCommentsRaw] = await Promise.all([
    ghRaw([
      "pr", "view", ctx.branch,
      "--repo", ctx.repo,
      "--json", "reviews,comments",
    ]),
    ghRaw([
      "api", `repos/${ctx.repo}/pulls/${prNumber}/comments`,
    ]),
  ])

  let reviews: PRReview[] = []
  let comments: PRComment[] = []
  let lineComments: LineComment[] = []

  try {
    const parsed = JSON.parse(reviewData)
    reviews = parsed.reviews ?? []
    comments = parsed.comments ?? []
  } catch {
    log("Warning: could not parse PR reviews/comments")
  }

  try {
    lineComments = JSON.parse(lineCommentsRaw) ?? []
  } catch {
    log("Warning: could not parse line-level review comments")
  }

  const totalComments = reviews.length + comments.length + lineComments.length
  if (totalComments === 0) {
    log("No review comments found — nothing to address")
    await git(["checkout", cfg.mainBranch]).catch(() => {})
    return true
  }

  log(`Found ${reviews.length} review(s), ${lineComments.length} line comment(s), ${comments.length} general comment(s)`)

  // Format comments into markdown
  const commentsContent = formatReviewComments(reviews, lineComments, comments, prNumber, ctx.repo)
  const commentsPath = join(ctx.issueDir, "pr-review-comments.md")
  writeFile(commentsPath, commentsContent)
  await commitArtifacts(ctx, `chore(auto-pr): capture PR review comments for ${ctx.id}`)

  // Run agent to address feedback
  const tokens = buildTokens(ctx)
  const prompt = resolveTemplate(PROMPT_TEMPLATES.reviewRound, tokens)

  const result = await runAgent({
    prompt,
    stepName: "reviewRound",
    permissionMode: "acceptEdits",
    maxTurns: cfg.maxTurns,
  })

  if (result.is_error) {
    logError(`Review round failed: ${result.result}`)
    await git(["checkout", cfg.mainBranch]).catch(() => {})
    return false
  }

  // Verify summary artifact
  const summaryPath = join(ctx.issueDir, "review-round-summary.md")
  if (!fileExists(summaryPath)) {
    logError("Review round did not produce review-round-summary.md")
    await git(["checkout", cfg.mainBranch]).catch(() => {})
    return false
  }

  // Invalidate stale artifacts (review and pr-description are now outdated)
  const reviewPath = join(ctx.issueDir, "review.md")
  const prDescPath = join(ctx.issueDir, "pr-description.md")
  let invalidated = false
  if (fileExists(reviewPath)) {
    rmSync(reviewPath)
    invalidated = true
  }
  if (fileExists(prDescPath)) {
    rmSync(prDescPath)
    invalidated = true
  }
  if (invalidated) {
    log("Invalidated stale review.md and pr-description.md")
  }

  await commitArtifacts(ctx, `chore(auto-pr): review round complete for ${ctx.id}`)

  // Push changes
  await git(["push", "--force-with-lease", "-u", cfg.remote, ctx.branch])
  log(`Pushed updated branch ${ctx.branch}`)

  // Return to main branch
  await git(["checkout", cfg.mainBranch]).catch(() => {})

  return true
}

function formatReviewComments(
  reviews: PRReview[],
  lineComments: LineComment[],
  generalComments: PRComment[],
  prNumber: number,
  repo: string,
): string {
  const sections: string[] = [`# PR Review Comments\n\n> PR #${prNumber} in ${repo}\n`]

  // Reviews with body text (CHANGES_REQUESTED, COMMENTED, etc.)
  const reviewsWithBody = reviews.filter((r) => r.body?.trim())
  if (reviewsWithBody.length > 0) {
    sections.push("## Reviews\n")
    for (const review of reviewsWithBody) {
      sections.push(`### ${review.state} by @${review.author.login} (${review.submittedAt})\n`)
      sections.push(review.body.trim())
      sections.push("")
    }
  }

  // Line-level review comments (most actionable)
  if (lineComments.length > 0) {
    sections.push("## Line Comments\n")
    for (const comment of lineComments) {
      const location = comment.line ? `${comment.path}:${comment.line}` : comment.path
      sections.push(`### ${location} — @${comment.user.login}\n`)
      if (comment.diff_hunk) {
        sections.push("```diff")
        sections.push(comment.diff_hunk)
        sections.push("```\n")
      }
      sections.push(comment.body.trim())
      sections.push("")
    }
  }

  // General PR comments
  if (generalComments.length > 0) {
    sections.push("## General Comments\n")
    for (const comment of generalComments) {
      sections.push(`### @${comment.author.login} (${comment.createdAt})\n`)
      sections.push(comment.body.trim())
      sections.push("")
    }
  }

  return sections.join("\n")
}
