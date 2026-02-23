import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { AsyncLocalStorage } from "node:async_hooks"
import { execa } from "execa"

const __dirname = dirname(fileURLToPath(import.meta.url))
const _repoRootStorage = new AsyncLocalStorage<string>()
let _baseRepoRoot = resolve(process.cwd())
export let AUTO_PR_HOME = join(homedir(), ".config/ai-autopilot")
export let TEMPLATES_DIR = join(AUTO_PR_HOME, "prompt-templates")
let USER_CONFIG_PATH = join(AUTO_PR_HOME, "config.json")
export const PROMPT_TEMPLATES = {
  research: "001-research.md",
  plan: "002-plan.md",
  planAnnotations: "003-plan-annotations.md",
  planReview: "004-plan-review.md",
  planImplementation: "005-plan-implementation.md",
  implement: "006-implement.md",
  review: "007-review.md",
  prDescription: "008-pr-description.md",
  refresh: "900-refresh.md",
  reviewRound: "910-review-round.md",
} as const

export type AgentStepName = keyof typeof PROMPT_TEMPLATES
export type AgentRunner = "claude" | "opencode"

export interface RunnerModelConfig {
  default?: string
  steps?: Partial<Record<AgentStepName, string>>
}

export type ModelsConfig = Record<AgentRunner, RunnerModelConfig>

export function getRepoRoot(): string {
  return _repoRootStorage.getStore() ?? _baseRepoRoot
}

export function withRepoRoot<T>(root: string, fn: () => Promise<T>): Promise<T> {
  return _repoRootStorage.run(resolve(root), fn)
}

export function setAutoPrHome(nextHome: string): void {
  AUTO_PR_HOME = resolve(nextHome)
  TEMPLATES_DIR = join(AUTO_PR_HOME, "prompt-templates")
  USER_CONFIG_PATH = join(AUTO_PR_HOME, "config.json")
}

// ── Config types ──

export interface RepoConfig {
  /** GitHub repo in "owner/name" format */
  repo: string
  /** Path within the repo this maps to (use "." for root) */
  path: string
}

export interface HooksConfig {
  /** Shell commands to run before a step starts. Key is pipeline step name. */
  beforeStep?: Record<string, string>
  /** Shell commands to run after a step completes successfully. Key is pipeline step name. */
  afterStep?: Record<string, string>
  /** Shell command to run when the pipeline needs human input. */
  onNeedInput?: string
}

export interface Config {
  /** Agent runner to use */
  agentRunner?: AgentRunner
  /** PR creation policy */
  prMode?: "always" | "ask" | "never"
  /** Ask before starting implementation step */
  askBeforeImplement?: boolean
  /** Models config keyed by runner */
  models?: Partial<Record<AgentRunner, RunnerModelConfig>>
  /** Ask once at startup whether to run in git worktrees */
  askWorktreeStart?: boolean
  /** Base directory for created git worktrees (absolute or relative to AUTO_PR_HOME) */
  worktreeBaseDir?: string
  /** Whether to run iterative plan review loop before implementation planning */
  planReviewLoopEnabled?: boolean
  /** Max rounds for iterative plan review loop */
  planReviewMaxRounds?: number
  /** Issue label that triggers the pipeline */
  triggerLabel?: string
  /** Optional external commands for source resolution */
  sourceCommands?: Partial<Record<"github" | "trello" | "slack", string>>
  /** Repos to scan for issues — each maps to a path in the codebase */
  repos?: RepoConfig[]
  /** Optional default target repo/path for markdown mode */
  targetRepo?: string
  targetPath?: string
  /** Main branch name — defaults to "master" */
  mainBranch?: string
  /** Git remote name — defaults to "origin" */
  remote?: string
  /** Max implementation loop iterations before giving up */
  maxImplementIterations?: number
  /** Max turns per Claude CLI invocation — omit for unlimited */
  maxTurns?: number
  loopIntervalMinutes?: number
  loopRetryEnabled?: boolean
  retryDelayMs?: number
  maxRetryDelayMs?: number
  /** Lifecycle hooks — shell commands triggered by pipeline events */
  hooks?: HooksConfig
  /** Named profiles — each is a partial config override merged on top of the base */
  profiles?: Record<string, Profile>
}

/** A profile overrides specific config fields. Merged: base → profile → CLI flags. */
export interface Profile extends Omit<Partial<Config>, "profiles"> {
  /** Stop pipeline after this step (same as --until) */
  until?: string
  /** Directory of prompt template overrides (relative to auto-pr home). Falls back to base prompt-templates/ per file. */
  promptDir?: string
}

// ── Resolved config (raw config + defaults + detected values) ──

export interface ResolvedConfig {
  agentRunner: AgentRunner
  prMode: "always" | "ask" | "never"
  askBeforeImplement: boolean
  models: ModelsConfig
  askWorktreeStart: boolean
  worktreeBaseDir: string
  planReviewLoopEnabled: boolean
  planReviewMaxRounds: number
  triggerLabel: string
  sourceCommands: Partial<Record<"github" | "trello" | "slack", string>>
  repos: RepoConfig[]
  mainBranch: string
  remote: string
  monorepo: string
  maxImplementIterations: number
  maxTurns?: number
  loopIntervalMinutes: number
  loopRetryEnabled: boolean
  retryDelayMs: number
  maxRetryDelayMs: number
  hooks: HooksConfig
  /** Pipeline stop point set by profile (overridden by CLI --until) */
  profileUntil?: string
  /** Profile prompt override directory (absolute path). Templates here shadow the defaults. */
  promptDir?: string
}

let _resolved: ResolvedConfig | undefined

type UserConfig = Partial<Config>
const CONFIG_EXAMPLE_FILE = "config.example.json"

function resolveAutoPrHome(preferredHome?: string): string {
  if (preferredHome) return resolve(preferredHome)

  const fromEnv = process.env.AUTO_PR_HOME
  if (fromEnv) return resolve(fromEnv)

  const nearExecutable = join(dirname(process.execPath), "prompt-templates")
  if (existsSync(nearExecutable)) return dirname(process.execPath)

  const nearSource = join(__dirname, "prompt-templates")
  if (existsSync(nearSource)) return __dirname

  const renamedHome = join(homedir(), ".config/ai-autopilot")
  const legacyHome = join(homedir(), ".config/auto-pr")
  if (existsSync(join(renamedHome, "config.json"))) return renamedHome
  if (existsSync(join(legacyHome, "config.json"))) return legacyHome
  return renamedHome
}

function resolveWorktreeBaseDir(baseDir?: string): string {
  if (!baseDir) return join(homedir(), ".cache/auto-pr/worktrees")
  if (baseDir === "~") return homedir()
  if (baseDir.startsWith("~/")) return join(homedir(), baseDir.slice(2))
  return resolve(AUTO_PR_HOME, baseDir)
}

function loadUserConfig(): UserConfig {
  if (!existsSync(USER_CONFIG_PATH)) {
    const examplePath = join(AUTO_PR_HOME, CONFIG_EXAMPLE_FILE)
    const exampleHint = existsSync(examplePath)
      ? `Create it from example: cp "${examplePath}" "${USER_CONFIG_PATH}"`
      : `Create ${USER_CONFIG_PATH} with your runner/models settings.`
    throw new Error(`Missing config file: ${USER_CONFIG_PATH}. ${exampleHint}`)
  }
  try {
    return JSON.parse(readFileSync(USER_CONFIG_PATH, "utf-8")) as UserConfig
  } catch (error) {
    throw new Error(`Failed to parse ${USER_CONFIG_PATH}: ${error}`)
  }
}

function parseGitHubRepoFromRemote(remoteUrl: string): string | undefined {
  const trimmed = remoteUrl.trim()
  const sshMatch = trimmed.match(/^git@github\.com:(.+?)\.git$/)
  if (sshMatch) return sshMatch[1]

  const httpsMatch = trimmed.match(/^https:\/\/github\.com\/(.+?)(?:\.git)?$/)
  if (httpsMatch) return httpsMatch[1]

  return undefined
}

async function detectMonorepo(fallbackRepo?: string): Promise<string> {
  try {
    const ghRepo = await exec("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"])
    if (ghRepo) return ghRepo
  } catch {
    // Fallback to git remote parsing
  }

  try {
    const remoteUrl = await exec("git", ["config", "--get", "remote.origin.url"])
    const parsed = parseGitHubRepoFromRemote(remoteUrl)
    if (parsed) return parsed
  } catch {
    // ignore
  }

  return fallbackRepo ?? "local/unknown"
}

async function detectRepoRoot(): Promise<string> {
  const { stdout, exitCode } = await execa("git", ["rev-parse", "--show-toplevel"], {
    cwd: process.cwd(),
    reject: false,
  })
  if (exitCode === 0 && stdout.trim()) {
    return stdout.trim()
  }
  throw new Error("ai-autopilot must be run inside a git repository")
}

function resolveModels(models?: Partial<Record<AgentRunner, RunnerModelConfig>>): ModelsConfig {
  const fallback: ModelsConfig = {
    claude: { default: "sonnet", steps: {} },
    opencode: { default: "opencode/kimi-k2.5", steps: {} },
  }

  return {
    claude: {
      default: models?.claude?.default ?? fallback.claude.default,
      steps: { ...fallback.claude.steps, ...(models?.claude?.steps ?? {}) },
    },
    opencode: {
      default: models?.opencode?.default ?? fallback.opencode.default,
      steps: { ...fallback.opencode.steps, ...(models?.opencode?.steps ?? {}) },
    },
  }
}

/** Deep-merge models: profile values override base per-runner, per-step. */
function mergeModels(
  base?: Partial<Record<AgentRunner, RunnerModelConfig>>,
  override?: Partial<Record<AgentRunner, RunnerModelConfig>>,
): Partial<Record<AgentRunner, RunnerModelConfig>> | undefined {
  if (!override) return base
  if (!base) return override
  const result = { ...base } as Record<string, RunnerModelConfig>
  for (const [runner, cfg] of Object.entries(override)) {
    const prev = result[runner] ?? {}
    result[runner] = {
      default: cfg.default ?? prev.default,
      steps: { ...prev.steps, ...cfg.steps },
    }
  }
  return result as Partial<Record<AgentRunner, RunnerModelConfig>>
}

/** Deep-merge hooks: profile values override base per-event, per-step. */
function mergeHooks(base?: HooksConfig, override?: HooksConfig): HooksConfig | undefined {
  if (!override) return base
  if (!base) return override
  return {
    beforeStep: { ...base.beforeStep, ...override.beforeStep },
    afterStep: { ...base.afterStep, ...override.afterStep },
    onNeedInput: override.onNeedInput ?? base.onNeedInput,
  }
}

/** Apply a profile's overrides on top of a base config (excluding nested models/hooks which are deep-merged). */
function applyProfile(base: Config, profile: Profile): Config & { _profileUntil?: string; _promptDir?: string } {
  const { models: profileModels, hooks: profileHooks, until, promptDir, profiles: _, ...profileRest } = profile
  return {
    ...base,
    ...profileRest,
    models: mergeModels(base.models, profileModels),
    hooks: mergeHooks(base.hooks, profileHooks),
    _profileUntil: until,
    _promptDir: promptDir,
  } as Config & { _profileUntil?: string; _promptDir?: string }
}

/** Initialize the resolved config. Detects the current repo and applies defaults. Call once at startup. */
export async function initConfig(opts?: { homeDir?: string; profile?: string }): Promise<ResolvedConfig> {
  setAutoPrHome(resolveAutoPrHome(opts?.homeDir))
  _baseRepoRoot = resolve(await detectRepoRoot())

  const userConfig = loadUserConfig()
  let merged: Config & { _profileUntil?: string; _promptDir?: string } = userConfig

  if (opts?.profile) {
    const profiles = userConfig.profiles ?? {}
    const selected = profiles[opts.profile]
    if (!selected) {
      const available = Object.keys(profiles)
      throw new Error(
        `Unknown profile "${opts.profile}".${available.length ? ` Available: ${available.join(", ")}` : " No profiles defined in config."}`,
      )
    }
    log(`Profile: ${opts.profile}`)
    merged = applyProfile(userConfig, selected)
  }

  const monorepo = await detectMonorepo(merged.targetRepo)
  log(`Detected repo: ${monorepo}`)

  const repos = merged.repos && merged.repos.length > 0
    ? merged.repos
    : merged.targetRepo
      ? [{ repo: merged.targetRepo, path: merged.targetPath ?? "." }]
      : [{ repo: monorepo, path: "." }]

  _resolved = {
    agentRunner: merged.agentRunner ?? "claude",
    prMode: merged.prMode ?? "always",
    askBeforeImplement: merged.askBeforeImplement ?? false,
    models: resolveModels(merged.models),
    askWorktreeStart: merged.askWorktreeStart ?? false,
    worktreeBaseDir: resolveWorktreeBaseDir(merged.worktreeBaseDir),
    planReviewLoopEnabled: merged.planReviewLoopEnabled ?? true,
    planReviewMaxRounds: Math.max(1, merged.planReviewMaxRounds ?? 3),
    triggerLabel: merged.triggerLabel ?? "ai-autopilot",
    sourceCommands: merged.sourceCommands ?? {},
    repos,
    mainBranch: merged.mainBranch ?? "main",
    remote: merged.remote ?? "origin",
    monorepo,
    maxImplementIterations: merged.maxImplementIterations ?? 100,
    maxTurns: merged.maxTurns,
    loopIntervalMinutes: merged.loopIntervalMinutes ?? 30,
    loopRetryEnabled: merged.loopRetryEnabled ?? false,
    retryDelayMs: merged.retryDelayMs ?? 30_000,
    maxRetryDelayMs: merged.maxRetryDelayMs ?? 300_000,
    hooks: merged.hooks ?? {},
    profileUntil: merged._profileUntil,
    promptDir: merged._promptDir ? resolve(AUTO_PR_HOME, merged._promptDir) : undefined,
  }

  return _resolved
}

export function logRunnerModel(cfg = getConfig()): void {
  const runner = cfg.agentRunner
  const runnerStepOverrides = cfg.models[runner].steps ?? {}
  const overrideCount = Object.keys(runnerStepOverrides).length
  const activeModel = resolveModelForStep(undefined, cfg)
  const suffix = overrideCount > 0 ? ` | Step overrides: ${overrideCount}` : ""
  log(`Runner: ${runner} | Model: ${activeModel ?? "default"}${suffix}`)
}

export function resolveModelSelectionForStep(stepName: AgentStepName, cfg = getConfig()): {
  model: string | undefined
  source: "step" | "default"
} {
  const runner = cfg.agentRunner
  const stepModel = cfg.models[runner].steps?.[stepName]
  if (stepModel) {
    return { model: stepModel, source: "step" }
  }
  return { model: cfg.models[runner].default, source: "default" }
}

export function resolveModelForStep(stepName?: AgentStepName, cfg = getConfig()): string | undefined {
  const runner = cfg.agentRunner
  const runnerModels = cfg.models[runner]

  if (stepName) {
    const runnerStepModel = runnerModels.steps?.[stepName]
    if (runnerStepModel) return runnerStepModel
  }

  return runnerModels.default
}

/** Get the resolved config. Throws if initConfig() hasn't been called. */
export function getConfig(): ResolvedConfig {
  if (!_resolved) throw new Error("Config not initialized. Call initConfig() first.")
  return _resolved
}

// ── Shell helpers ──

/** Run a command and return stdout. Throws on non-zero exit. */
async function exec(cmd: string, args: string[]): Promise<string> {
  const { stdout } = await execa(cmd, args, { cwd: getRepoRoot() })
  return stdout.trim()
}

/** Run a command, return stdout even on non-zero exit */
async function execSafe(cmd: string, args: string[]): Promise<string> {
  const { stdout } = await execa(cmd, args, { cwd: getRepoRoot(), reject: false })
  return (stdout ?? "").trim()
}

/** Run gh CLI and return parsed JSON */
export async function gh<T = unknown>(args: string[]): Promise<T> {
  const out = await exec("gh", args)
  return JSON.parse(out) as T
}

/** Run gh CLI and return raw stdout (doesn't throw on failure) */
export async function ghRaw(args: string[]): Promise<string> {
  return execSafe("gh", args)
}

/** Run git and return stdout */
export async function git(args: string[]): Promise<string> {
  return exec("git", args)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ── Hooks ──

/** Run a shell hook command. Replaces {{step}} and {{issue}} tokens. Warns on failure, never throws. */
export async function runHook(hookCmd: string | undefined, context?: { step?: string; issue?: string }): Promise<void> {
  if (!hookCmd) return
  try {
    let cmd = hookCmd
    if (context?.step) cmd = cmd.replaceAll("{{step}}", context.step)
    if (context?.issue) cmd = cmd.replaceAll("{{issue}}", context.issue)

    await execa("sh", ["-c", cmd], {
      cwd: getRepoRoot(),
      stdin: "ignore",
      stdout: "inherit",
      stderr: "inherit",
      timeout: 30_000,
    })
  } catch (e) {
    logWarn(`Hook failed: ${hookCmd} — ${e}`)
  }
}

/** Fire the onNeedInput hook (e.g., macOS notification). */
export async function fireNeedInputHook(ctx: IssueContext): Promise<void> {
  const cfg = getConfig()
  await runHook(cfg.hooks.onNeedInput, { issue: contextRef(ctx) })
}

async function withHeartbeat<T>(label: string, run: () => Promise<T>): Promise<T> {
  const startedAt = Date.now()
  const intervalMs = 30_000
  const timer = setInterval(() => {
    const elapsedSec = Math.floor((Date.now() - startedAt) / 1000)
    log(`${label} still running... ${elapsedSec}s elapsed`)
  }, intervalMs)
  if (typeof (timer as { unref?: () => void }).unref === "function") {
    ;(timer as { unref: () => void }).unref()
  }

  try {
    return await run()
  } finally {
    clearInterval(timer)
  }
}

// ── Claude CLI ──

export interface ClaudeResult {
  result: string
  is_error: boolean
  total_cost_usd: number
  num_turns: number
}

export type AgentResult = ClaudeResult

export interface UsageStats {
  totalCostUsd: number
  totalTurns: number
  invocations: number
  byModel: Record<string, { invocations: number; totalCostUsd: number; totalTurns: number }>
}

const usageStats: UsageStats = {
  totalCostUsd: 0,
  totalTurns: 0,
  invocations: 0,
  byModel: {},
}

export function getUsageStats(): UsageStats {
  return {
    totalCostUsd: usageStats.totalCostUsd,
    totalTurns: usageStats.totalTurns,
    invocations: usageStats.invocations,
    byModel: Object.fromEntries(
      Object.entries(usageStats.byModel).map(([model, stats]) => [model, { ...stats }]),
    ),
  }
}

function trackUsage(result: ClaudeResult, model: string): void {
  usageStats.totalCostUsd += result.total_cost_usd
  usageStats.totalTurns += result.num_turns
  usageStats.invocations += 1

  const current = usageStats.byModel[model] ?? { invocations: 0, totalCostUsd: 0, totalTurns: 0 }
  current.invocations += 1
  current.totalCostUsd += result.total_cost_usd
  current.totalTurns += result.num_turns
  usageStats.byModel[model] = current
}

/**
 * Run claude in print mode. Collects JSON output and returns parsed result.
 */
export async function runAgent(opts: {
  prompt: string
  stepName?: AgentStepName
  permissionMode: "plan" | "acceptEdits"
  maxTurns?: number
  retry?: boolean
}): Promise<ClaudeResult> {
  const cfg = getConfig()
  if (cfg.agentRunner === "opencode") {
    return runOpenCode(opts)
  }
  return runClaude(opts)
}

async function runClaude(opts: {
  prompt: string
  stepName?: AgentStepName
  permissionMode: "plan" | "acceptEdits"
  maxTurns?: number
  retry?: boolean
}): Promise<ClaudeResult> {
  const cfg = getConfig()
  const selection = opts.stepName
    ? resolveModelSelectionForStep(opts.stepName, cfg)
    : { model: resolveModelForStep(undefined, cfg), source: "default" as const }
  const model = selection.model
  const activeModel = model ?? "default"
  log(`Step ${opts.stepName ?? "unknown"} — model: ${activeModel} (${selection.source})`)
  const args = [
    "-p",
    "--output-format", "json",
    ...(model ? ["--model", model] : []),
    "--permission-mode", opts.permissionMode,
    ...(opts.maxTurns ? ["--max-turns", String(opts.maxTurns)] : []),
    opts.prompt,
  ]

  let retryDelay = cfg.retryDelayMs

  while (true) {
    try {
      const { stdout } = await withHeartbeat(
        `Step ${opts.stepName ?? "unknown"}`,
        () => execa("claude", args, {
          cwd: getRepoRoot(),
          stdin: "ignore",
          stderr: "inherit",
        }),
      )

      try {
        const result = JSON.parse(stdout) as ClaudeResult
        log(`Done — $${result.total_cost_usd.toFixed(4)} | ${result.num_turns} turns`)
        if (result.result) {
          logAgentOutput(result.result)
        }
        trackUsage(result, activeModel)
        return result
      } catch {
        log("Done — failed to parse Claude output")
        if (stdout.trim()) {
          logAgentOutput(stdout.trim())
        }
        const fallback = { result: stdout.trim(), is_error: false, total_cost_usd: 0, num_turns: 0 }
        trackUsage(fallback, activeModel)
        return fallback
      }
    } catch (e) {
      const shouldRetry = opts.retry ?? cfg.loopRetryEnabled ?? false
      if (!shouldRetry) throw e

      log(`Claude process error: ${e}`)
      log(`Retrying in ${retryDelay / 1000}s...`)
      await sleep(retryDelay)
      retryDelay = Math.min(retryDelay * 2, cfg.maxRetryDelayMs)
    }
  }
}

async function runOpenCode(opts: {
  prompt: string
  stepName?: AgentStepName
  permissionMode: "plan" | "acceptEdits"
  maxTurns?: number
  retry?: boolean
}): Promise<ClaudeResult> {
  const cfg = getConfig()
  const selection = opts.stepName
    ? resolveModelSelectionForStep(opts.stepName, cfg)
    : { model: resolveModelForStep(undefined, cfg), source: "default" as const }
  const model = selection.model
  const activeModel = model ?? "default"
  log(`Step ${opts.stepName ?? "unknown"} — model: ${activeModel} (${selection.source})`)
  const args = [
    "run",
    "--format", "json",
    ...(model ? ["--model", model] : []),
    opts.prompt,
  ]

  let retryDelay = cfg.retryDelayMs

  while (true) {
    try {
      const { stdout } = await withHeartbeat(
        `Step ${opts.stepName ?? "unknown"}`,
        () => execa("opencode", args, {
          cwd: getRepoRoot(),
          stdin: "ignore",
          stderr: "inherit",
        }),
      )

      const lines = stdout.split("\n").map((line) => line.trim()).filter(Boolean)
      let text = ""
      let totalCost = 0
      let turns = 0

      for (const line of lines) {
        try {
          const event = JSON.parse(line) as {
            type?: string
            part?: { text?: string; cost?: number }
          }
          if (event.type === "text" && event.part?.text) {
            text += event.part.text
          }
          if (event.type === "step_finish") {
            turns += 1
            if (typeof event.part?.cost === "number") {
              totalCost += event.part.cost
            }
          }
        } catch {
          // ignore malformed lines
        }
      }

      log(`Done — $${totalCost.toFixed(4)} | ${turns} turns`)
      if (text.trim()) {
        logAgentOutput(text.trim())
      }

      const result = {
        result: text.trim(),
        is_error: false,
        total_cost_usd: totalCost,
        num_turns: turns,
      }
      trackUsage(result, activeModel)
      return result
    } catch (e) {
      const shouldRetry = opts.retry ?? cfg.loopRetryEnabled ?? false
      if (!shouldRetry) throw e

      log(`OpenCode process error: ${e}`)
      log(`Retrying in ${retryDelay / 1000}s...`)
      await sleep(retryDelay)
      retryDelay = Math.min(retryDelay * 2, cfg.maxRetryDelayMs)
    }
  }
}

// ── Template resolution ──

export interface TokenValues {
  SCOPE_PATH: string
  ISSUE_DIR: string
  MAIN_BRANCH: string
}

/**
 * Load a prompt template and replace {{TOKENS}}.
 * If a profile promptDir is set, templates there shadow the defaults.
 */
export function resolveTemplate(templateName: string, tokens: TokenValues): string {
  const cfg = _resolved
  const profilePath = cfg?.promptDir ? join(cfg.promptDir, templateName) : undefined
  const templatePath = profilePath && existsSync(profilePath) ? profilePath : join(TEMPLATES_DIR, templateName)
  let template = readFileSync(templatePath, "utf-8")

  for (const [key, value] of Object.entries(tokens)) {
    template = template.split(`{{${key}}}`).join(value)
  }

  return template
}

// ── File helpers ──

export function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

export function fileExists(path: string): boolean {
  return existsSync(path)
}

export function readFile(path: string): string {
  return readFileSync(path, "utf-8")
}

export function writeFile(path: string, content: string): void {
  ensureDir(dirname(path))
  writeFileSync(path, content, "utf-8")
}

// ── Git helpers ──

/** Stage and commit .auto-pr artifacts for the current issue. No-op if nothing to commit. */
export async function commitArtifacts(ctx: IssueContext, message: string): Promise<void> {
  await git(["add", ctx.issueDirRel])
  const staged = await execSafe("git", ["diff", "--cached", "--name-only"])
  if (staged.length > 0) {
    await git(["commit", "-m", message])
  }
}

// ── Issue context ──

export interface IssueContext {
  id: string
  sourceType: "github-issue" | "markdown"
  number?: number
  title: string
  body: string
  repo: string        // e.g. "owner/my-repo"
  repoShort: string   // e.g. "my-repo"
  scopePath: string   // e.g. "apps/my-app" or "."
  issueDir: string    // absolute path to .auto-pr/{repoShort}/{id}
  issueDirRel: string // relative path from monorepo root
  branch: string      // e.g. "auto-pr/issue-42"
}

export function repoShortName(repo: string): string {
  return repo.split("/").pop()!
}

export function buildIssueContext(issue: { number: number; title: string; body: string }, repo: string, scopePath: string): IssueContext {
  const id = `issue-${issue.number}`
  const repoShort = repoShortName(repo)
  const issueDirRel = `.auto-pr/${repoShort}/${id}`
  return {
    id,
    sourceType: "github-issue",
    number: issue.number,
    title: issue.title,
    body: issue.body,
    repo,
    repoShort,
    scopePath,
    issueDir: join(getRepoRoot(), issueDirRel),
    issueDirRel,
    branch: `auto-pr/${id}`,
  }
}

export function buildMarkdownContext(input: {
  id: string
  title: string
  body: string
  repo: string
  scopePath: string
  number?: number
}): IssueContext {
  const safeId = input.id.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "task"
  const repoShort = repoShortName(input.repo)
  const issueDirRel = `.auto-pr/${repoShort}/${safeId}`

  return {
    id: safeId,
    sourceType: "markdown",
    number: input.number,
    title: input.title,
    body: input.body,
    repo: input.repo,
    repoShort,
    scopePath: input.scopePath,
    issueDir: join(getRepoRoot(), issueDirRel),
    issueDirRel,
    branch: `auto-pr/${safeId}`,
  }
}

export function contextRef(ctx: IssueContext): string {
  if (ctx.number != null) {
    return `${ctx.repo}#${ctx.number}`
  }
  return `${ctx.repo}:${ctx.id}`
}

export function buildTokens(ctx: IssueContext): TokenValues {
  return {
    SCOPE_PATH: ctx.scopePath,
    ISSUE_DIR: ctx.issueDirRel,
    MAIN_BRANCH: getConfig().mainBranch,
  }
}

// ─── Terminal output ─────────────────────────────────────────────────────────
const _tty = process.stdout.isTTY && !process.env.NO_COLOR
const c = {
  reset:  _tty ? "\x1b[0m"  : "",
  bold:   _tty ? "\x1b[1m"  : "",
  dim:    _tty ? "\x1b[2m"  : "",
  red:    _tty ? "\x1b[31m" : "",
  yellow: _tty ? "\x1b[33m" : "",
  cyan:   _tty ? "\x1b[36m" : "",
}

export function log(msg: string): void {
  console.log(`  ${c.dim}›${c.reset} ${msg}`)
}

export function logError(msg: string): void {
  console.error(`  ${c.red}✖${c.reset} ${msg}`)
}

export function logWarn(msg: string): void {
  console.log(`  ${c.yellow}⚠${c.reset} ${msg}`)
}

export function logStep(step: string, ctx: IssueContext, skipped = false): void {
  const taskId = `${c.bold}${c.cyan}${ctx.id}${c.reset}`
  const meta = `${c.dim}·${c.reset} task ${taskId}  ${c.dim}·  ${contextRef(ctx)}  ·  ${ctx.title}${c.reset}`
  if (skipped) {
    console.log(`\n  ${c.dim}◌ ${step}  ·  task ${ctx.id}  ·  ${contextRef(ctx)}  ·  ${ctx.title}  [skip]${c.reset}`)
    return
  }
  console.log(`\n  ${c.bold}${c.cyan}●${c.reset} ${c.bold}${step}${c.reset}  ${meta}`)
  console.log(`  ${c.dim}${"─".repeat(56)}${c.reset}`)
}

export function logAgentOutput(text: string): void {
  const label = "agent output"
  const fill = "─".repeat(56 - label.length - 4)
  console.log(`\n  ${c.dim}── ${label} ${fill}${c.reset}`)
  console.log(text.trim())
  console.log(`  ${c.dim}${"─".repeat(56)}${c.reset}\n`)
}

export function buildContextFromArtifacts(issueNumber: number, repoShort: string): IssueContext {
  return buildContextFromId(`issue-${issueNumber}`, repoShort)
}

/** Build an IssueContext from an existing artifact directory by id (e.g., "issue-42", "md-task-abc123"). */
export function buildContextFromId(id: string, repoShort: string): IssueContext {
  const repoConfig = getConfig().repos.find((r) => repoShortName(r.repo) === repoShort)
  if (!repoConfig) {
    throw new Error(`Unknown repo: ${repoShort}`)
  }

  const candidateIssueDirsRel = [
    `.auto-pr/${id}`,
    `.auto-pr/${repoShort}/${id}`,
  ]

  let issueDirRel: string | undefined
  let ramblingsPath: string | undefined
  for (const candidateRel of candidateIssueDirsRel) {
    const candidateRamblingsPath = join(getRepoRoot(), candidateRel, "initial-ramblings.md")
    if (existsSync(candidateRamblingsPath)) {
      issueDirRel = candidateRel
      ramblingsPath = candidateRamblingsPath
      break
    }
  }

  if (!issueDirRel || !ramblingsPath) {
    throw new Error(`No artifacts found at ${candidateIssueDirsRel.join(" or ")}. Run the pipeline first.`)
  }

  const content = readFileSync(ramblingsPath, "utf-8")
  const titleMatch = content.match(/^# (.+)$/m)
  const title = titleMatch ? titleMatch[1] : id

  const lines = content.split("\n")
  let blankCount = 0
  let bodyStartIndex = 0
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "") {
      blankCount++
      if (blankCount === 2) {
        bodyStartIndex = i + 1
        break
      }
    }
  }
  const body = lines.slice(bodyStartIndex).join("\n").trim()

  // Detect if this is a GitHub issue source (id starts with "issue-")
  const issueMatch = id.match(/^issue-(\d+)$/)
  const base = issueMatch
    ? buildIssueContext({ number: Number(issueMatch[1]), title, body }, repoConfig.repo, repoConfig.path)
    : buildMarkdownContext({ id, title, body, repo: repoConfig.repo, scopePath: repoConfig.path })

  return {
    ...base,
    issueDirRel,
    issueDir: join(getRepoRoot(), issueDirRel),
  }
}
