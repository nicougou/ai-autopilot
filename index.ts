import { parseArgs } from "node:util"
import { mkdirSync, rmSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { resolveSourceInputs } from "./sources/resolve-inputs.js"
import { runPipeline, STEP_NAMES, type StepName } from "./pipeline.js"
import {
  contextRef,
  AUTO_PR_HOME,
  type AgentRunner,
  getUsageStats,
  git,
  log,
  logError,
  logRunnerModel,
  getRepoRoot,
  withRepoRoot,
  repoShortName,
  initConfig,
  getConfig,
  buildContextFromId,
  type IssueContext,
  type UsageStats,
} from "./utils.js"

const { values } = parseArgs({
  options: {
    source: { type: "string", multiple: true, short: "s" },
    issue: { type: "string", short: "i" },
    id: { type: "string" },
    home: { type: "string" },
    "with-uuid": { type: "boolean" },
    "ask-worktree": { type: "boolean" },
    resume: { type: "boolean" },
    until: { type: "string", short: "u" },
    reset: { type: "string" },
    refresh: { type: "boolean" },
    "review-round": { type: "boolean" },
    "ask-before-implement": { type: "boolean" },
    "pr-creation": { type: "string" },
    runner: { type: "string" },
    model: { type: "string", short: "m" },
    profile: { type: "string", short: "p" },
    repo: { type: "string", short: "r" },
    help: { type: "boolean", short: "h" },
  },
  strict: false,
})

if (values.help) {
  console.log(`
ai-autopilot — Automated issue-to-PR pipeline

Runs a multi-step agent pipeline (research → plan → implement → review)
from explicit source inputs (GitHub issue, markdown file, prompt, Trello URL, Slack URL).

Usage:
  bun run ai-autopilot --source "123" --repo my-repo  Process GitHub issue number
  bun run ai-autopilot --source "https://github.com/owner/repo/issues/123"  Process GitHub issue URL
  bun run ai-autopilot --source "tasks/feature.md"  Process markdown task file (prefix optional)
  bun run ai-autopilot --source "update all docs"  Process direct prompt task (fallback)
  bun run ai-autopilot --source "md:tasks/feature.md"  Explicit markdown source
  bun run ai-autopilot --source "prompt:update all docs"  Explicit prompt source
  bun run ai-autopilot --source "https://trello.com/c/..."  Process Trello card via source command
  bun run ai-autopilot --source "https://workspace.slack.com/archives/..."  Process Slack thread via source command
  bun run ai-autopilot --home ./dist                  Use custom app home (config/templates)
  bun run ai-autopilot --source "md:tasks/feature.md" --with-uuid  Append short UUID to task id
  bun run ai-autopilot --source "md:tasks/feature.md" --resume  Reuse existing source state
  bun run ai-autopilot --ask-worktree                Ask to run each task in a git worktree
  bun run ai-autopilot --source "123" --until plan   Stop after a specific step
  bun run ai-autopilot --reset 42                    Delete local state for an issue (force restart)
  bun run ai-autopilot --reset 42 --repo my-repo     Reset a specific repo's issue
  bun run ai-autopilot --refresh --issue 42          Rebase a stale PR branch onto current main
  bun run ai-autopilot --id md-task-abc123 --repo my-repo --resume  Resume from existing artifact id
  bun run ai-autopilot --review-round --issue 42     Address PR review feedback (GitHub issue)
  bun run ai-autopilot --review-round --id md-task-abc123  Address PR review feedback (by artifact id)
  bun run ai-autopilot --review-round --source "task.md"  Address PR review feedback (re-resolve source)
  bun run ai-autopilot --ask-before-implement         Ask before implementation step
  bun run ai-autopilot --pr-creation never            Override PR creation: always | ask | never
  bun run ai-autopilot --runner claude                Force runner for this run: claude | opencode
  bun run ai-autopilot --model anthropic/sonnet       Force model for this run
  bun run ai-autopilot --profile research             Use a named config profile

Steps: ${STEP_NAMES.join(" → ")}
`)
  process.exit(0)
}

async function syncWithRemote() {
  const cfg = getConfig()
  log("Syncing with remote...")
  await git(["fetch", "--all", "--prune"])

  const preferredBranch = cfg.mainBranch
  let syncBranch = preferredBranch
  const preferredExistsOnRemote = await git(["ls-remote", "--heads", cfg.remote, preferredBranch]).catch(() => "")
  if (!preferredExistsOnRemote && preferredBranch !== "master") {
    const masterExistsOnRemote = await git(["ls-remote", "--heads", cfg.remote, "master"]).catch(() => "")
    if (masterExistsOnRemote) {
      syncBranch = "master"
      cfg.mainBranch = "master"
      log(`Warning: remote branch "${preferredBranch}" not found, falling back to "master".`)
    }
  }

  const branch = await git(["rev-parse", "--abbrev-ref", "HEAD"])
  let canPullBaseBranch = true
  if (branch !== syncBranch) {
    log(`Warning: on branch "${branch}", switching to ${syncBranch}...`)
    try {
      await git(["checkout", syncBranch])
    } catch (checkoutError) {
      const checkoutMsg = String(
        (checkoutError as { stderr?: unknown; shortMessage?: unknown; message?: unknown }).stderr
          ?? (checkoutError as { stderr?: unknown; shortMessage?: unknown; message?: unknown }).shortMessage
          ?? (checkoutError as { stderr?: unknown; shortMessage?: unknown; message?: unknown }).message
          ?? checkoutError,
      )

      try {
        await git(["checkout", "-b", syncBranch, `${cfg.remote}/${syncBranch}`])
      } catch (createError) {
        const createMsg = String(
          (createError as { stderr?: unknown; shortMessage?: unknown; message?: unknown }).stderr
            ?? (createError as { stderr?: unknown; shortMessage?: unknown; message?: unknown }).shortMessage
            ?? (createError as { stderr?: unknown; shortMessage?: unknown; message?: unknown }).message
            ?? createError,
        )
        const alreadyCheckedOutElsewhere = /already checked out/i.test(`${checkoutMsg}\n${createMsg}`)
        const branchAlreadyExists = /branch named .* already exists/i.test(createMsg)

        if (alreadyCheckedOutElsewhere || branchAlreadyExists) {
          canPullBaseBranch = false
          log(`Warning: could not switch to ${syncBranch} in this worktree; skipping base-branch pull.`)
        } else {
          throw createError
        }
      }
    }
  }
  if (!canPullBaseBranch) {
    return
  }

  const status = await git(["status", "--porcelain"])
  if (status.length > 0) {
    log("Warning: working tree has uncommitted changes, stashing...")
    await git(["stash"]).catch(() => {})
  }
  await git(["pull", cfg.remote, syncBranch])
}

async function askYesNo(prompt: string): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return false
  }
  const { createInterface } = await import("node:readline/promises")
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await rl.question(`${prompt} [y/N] `)
    return /^y(es)?$/i.test(answer.trim())
  } finally {
    rl.close()
  }
}

function remapContextRoot(ctx: IssueContext, repoRoot: string): IssueContext {
  return {
    ...ctx,
    issueDir: join(repoRoot, ctx.issueDirRel),
  }
}

async function createWorktreeForContext(ctx: IssueContext): Promise<string> {
  const cfg = getConfig()
  const repoKey = cfg.monorepo.replace(/[^a-zA-Z0-9._-]+/g, "-")
  const worktreesRoot = join(homedir(), ".cache/auto-pr/worktrees", repoKey)
  const worktreePath = join(worktreesRoot, `${ctx.repoShort}-${ctx.id}`)

  mkdirSync(worktreesRoot, { recursive: true })
  await git(["worktree", "remove", "--force", worktreePath]).catch(() => {})
  rmSync(worktreePath, { recursive: true, force: true })
  await git(["worktree", "add", "-d", worktreePath, cfg.mainBranch])

  return worktreePath
}

function formatModelUsageDelta(before: UsageStats, after: UsageStats): string {
  const rows = Object.entries(after.byModel)
    .map(([model, stats]) => {
      const prev = before.byModel[model] ?? { invocations: 0, totalCostUsd: 0, totalTurns: 0 }
      const invocations = stats.invocations - prev.invocations
      const totalCostUsd = stats.totalCostUsd - prev.totalCostUsd
      if (invocations <= 0) return undefined
      return { model, invocations, totalCostUsd }
    })
    .filter((row): row is { model: string; invocations: number; totalCostUsd: number } => Boolean(row))
    .sort((a, b) => b.invocations - a.invocations || b.totalCostUsd - a.totalCostUsd)

  if (rows.length === 0) return ""
  return rows.map((row) => `${row.model} x${row.invocations} ($${row.totalCostUsd.toFixed(4)})`).join(", ")
}

function formatModelUsageTotal(usage: UsageStats): string {
  const rows = Object.entries(usage.byModel)
    .filter(([, stats]) => stats.invocations > 0)
    .sort((a, b) => b[1].invocations - a[1].invocations || b[1].totalCostUsd - a[1].totalCostUsd)

  if (rows.length === 0) return ""
  return rows
    .map(([model, stats]) => `${model} x${stats.invocations} ($${stats.totalCostUsd.toFixed(4)})`)
    .join(", ")
}

async function main() {
  const cfg = await initConfig({
    homeDir: typeof values.home === "string" ? values.home : undefined,
    profile: typeof values.profile === "string" ? values.profile : undefined,
  })
  log(`Config home: ${AUTO_PR_HOME}`)
  if (values["ask-before-implement"]) {
    cfg.askBeforeImplement = true
  }
  if (typeof values["pr-creation"] === "string" && values["pr-creation"].trim()) {
    const mode = values["pr-creation"].trim()
    if (mode !== "always" && mode !== "ask" && mode !== "never") {
      logError(`Invalid --pr-creation "${mode}". Valid values: always, ask, never`)
      process.exit(1)
    }
    cfg.prMode = mode
  }
  if (typeof values.runner === "string" && values.runner.trim()) {
    const forcedRunner = values.runner.trim() as AgentRunner
    if (forcedRunner !== "claude" && forcedRunner !== "opencode") {
      logError(`Invalid --runner "${forcedRunner}". Valid values: claude, opencode`)
      process.exit(1)
    }
    cfg.agentRunner = forcedRunner
  }
  if (typeof values.model === "string" && values.model.trim()) {
    const forcedModel = values.model.trim()
    cfg.models[cfg.agentRunner].default = forcedModel
    cfg.models[cfg.agentRunner].steps = {}
  }
  logRunnerModel(cfg)
  const useWorktree = (values["ask-worktree"] || cfg.askWorktreeStart)
    ? await askYesNo("Create and use git worktree(s) for this run?")
    : false
  if (useWorktree) {
    const repoKey = cfg.monorepo.replace(/[^a-zA-Z0-9._-]+/g, "-")
    log(`Worktree mode enabled (base: ${join(homedir(), ".cache/auto-pr/worktrees", repoKey)})`)
  }

  const defaultRepoShort = cfg.repos[0] ? repoShortName(cfg.repos[0].repo) : undefined

  // Handle --reset (local-only)
  if (values.reset) {
    const issueNum = values.reset
    const repoShort = (values.repo as string | undefined) ?? defaultRepoShort
    if (!repoShort) throw new Error("--reset requires --repo when no repo is configured")
    const issueDir = join(getRepoRoot(), `.auto-pr/${repoShort}/issue-${issueNum}`)
    log(`Resetting state for ${repoShort}/issue-${issueNum}...`)
    rmSync(issueDir, { recursive: true, force: true })
    log(`Cleaned ${issueDir}`)
    return
  }

  // Handle --refresh
  if (values.refresh) {
    const { stepRefresh } = await import("./steps/900-refresh.js")
    const { buildIssueContext, repoShortName: rsn } = await import("./utils.js")
    if (!values.issue) throw new Error("--refresh requires --issue <number>")
    const issueNum = Number(values.issue)
    const repoShort = (values.repo as string | undefined) ?? defaultRepoShort
    if (!repoShort) throw new Error("--refresh requires --repo when no repo is configured")
    const repoConfig = cfg.repos.find((r) => rsn(r.repo) === repoShort)
    if (!repoConfig) throw new Error(`Unknown repo: ${repoShort}`)
    const ctx = buildIssueContext(
      { number: issueNum, title: `Issue #${issueNum}`, body: "" },
      repoConfig.repo,
      repoConfig.path,
    )
    await stepRefresh(ctx)
    return
  }

  // Handle --review-round
  if (values["review-round"]) {
    const { stepReviewRound } = await import("./steps/910-review-round.js")
    const { buildContextFromArtifacts, buildContextFromId } = await import("./utils.js")
    const repoShort = (values.repo as string | undefined) ?? defaultRepoShort
    if (!repoShort) throw new Error("--review-round requires --repo when no repo is configured")

    let ctx: IssueContext
    if (values.issue) {
      // GitHub issue: --review-round --issue 42
      ctx = buildContextFromArtifacts(Number(values.issue), repoShort)
    } else if (typeof values.id === "string" && values.id.trim()) {
      // Direct artifact id: --review-round --id md-task-abc123
      ctx = buildContextFromId(values.id.trim(), repoShort)
    } else {
      // Resolve via --source (re-resolves same id as original run, no new UUID)
      const sources = (Array.isArray(values.source)
        ? values.source
        : (typeof values.source === "string" ? [values.source] : []))
        .filter((v): v is string => typeof v === "string")
      if (sources.length === 0) {
        throw new Error("--review-round requires --issue <number>, --id <artifact-id>, or --source <input>")
      }
      const contexts = await resolveSourceInputs(sources, values.repo as string | undefined, { withUuid: false })
      if (contexts.length === 0) throw new Error("Could not resolve source for review round")
      ctx = buildContextFromId(contexts[0].id, repoShort)
    }

    await stepReviewRound(ctx)
    return
  }

  // Validate --until (CLI flag takes precedence over profile's until)
  const untilRaw = (values.until as string | undefined) ?? cfg.profileUntil
  const untilStep = untilRaw as StepName | undefined
  if (untilStep && !STEP_NAMES.includes(untilStep)) {
    logError(`Invalid step "${untilStep}". Valid steps: ${STEP_NAMES.join(", ")}`)
    process.exit(1)
  }

  const explicitSources = (Array.isArray(values.source)
    ? values.source
    : (typeof values.source === "string" ? [values.source] : []))
    .filter((v): v is string => typeof v === "string")

  if (values.resume && values["with-uuid"]) {
    log("Ignoring --with-uuid because --resume was provided")
  }

  let contexts: IssueContext[]
  let resolvedFromId = false
  if (typeof values.id === "string" && values.id.trim() && explicitSources.length === 0) {
    const repoShort = (values.repo as string | undefined) ?? defaultRepoShort
    if (!repoShort) throw new Error("--id requires --repo when no repo is configured")
    contexts = [buildContextFromId(values.id.trim(), repoShort)]
    resolvedFromId = true
  } else {
    if (explicitSources.length === 0) {
      throw new Error("No source provided. Use --source (or --id with --resume).")
    }
    try {
      contexts = await resolveSourceInputs(
        explicitSources,
        values.repo as string | undefined,
        { withUuid: Boolean(values["with-uuid"]) && !Boolean(values.resume) },
      )
    } catch (e) {
      throw new Error(`Failed to resolve source input: ${e}`)
    }
  }

  if (!values.resume && !resolvedFromId) {
    for (const ctx of contexts) {
      rmSync(ctx.issueDir, { recursive: true, force: true })
      log(`Reset state at ${ctx.issueDirRel} (use --resume to keep it)`)
    }
  }

  await syncWithRemote()

  log(`Processing ${contexts.length} source(s)...\n`)
  for (const ctx of contexts) {
    const usageBefore = getUsageStats()
    try {
      if (useWorktree) {
        const worktreePath = await createWorktreeForContext(ctx)
        const runCtx = remapContextRoot(ctx, worktreePath)
        log(`Using worktree for ${contextRef(ctx)}: ${worktreePath}`)
        await withRepoRoot(worktreePath, () => runPipeline(runCtx, untilStep))
      } else {
        await runPipeline(ctx, untilStep)
      }
      const usageAfter = getUsageStats()
      const issueCost = usageAfter.totalCostUsd - usageBefore.totalCostUsd
      const issueTurns = usageAfter.totalTurns - usageBefore.totalTurns
      const issueInvocations = usageAfter.invocations - usageBefore.invocations
      const modelUsage = formatModelUsageDelta(usageBefore, usageAfter)
      log(
        `Summary for ${contextRef(ctx)} — $${issueCost.toFixed(4)} | ${issueTurns} turns | ${issueInvocations} agent run(s)${modelUsage ? ` | models: ${modelUsage}` : ""}`,
      )
    } catch (e) {
      logError(`Pipeline error for ${contextRef(ctx)}: ${e}`)
    }
  }

  const usage = getUsageStats()
  const modelUsage = formatModelUsageTotal(usage)
  log(
    `Done. Total cost: $${usage.totalCostUsd.toFixed(4)} | ${usage.totalTurns} turns | ${usage.invocations} agent run(s)${modelUsage ? ` | models: ${modelUsage}` : ""}`,
  )
}

main().catch((e) => {
  logError(`Fatal error: ${e}`)
  process.exit(1)
})
