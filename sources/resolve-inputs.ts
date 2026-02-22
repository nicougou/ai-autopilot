import { basename, isAbsolute, resolve } from "node:path"
import { existsSync, readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { homedir } from "node:os"
import { execa } from "execa"
import {
  type IssueContext,
  buildIssueContext,
  buildMarkdownContext,
  getConfig,
  gh,
  logWarn,
  repoShortName,
  AUTO_PR_HOME,
} from "../utils.js"

interface GhIssue {
  number: number
  title: string
  body: string
  labels: { name: string }[]
}

/**
 * Fetch a single issue by number directly (no label filter).
 * Used when --issue N is specified — the user knows what they want.
 */
export async function fetchIssue(issueNumber: number, repoShort?: string): Promise<IssueContext | undefined> {
  const cfg = getConfig()

  const repos = repoShort
    ? cfg.repos.filter((r) => r.repo === repoShort || repoShortName(r.repo) === repoShort)
    : cfg.repos

  for (const repoConfig of repos) {
    try {
      const issue = await gh<GhIssue>([
        "issue", "view", String(issueNumber),
        "--repo", repoConfig.repo,
        "--json", "number,title,body,labels",
      ])
      return buildIssueContext(issue, repoConfig.repo, repoConfig.path)
    } catch {
      // Issue not found in this repo, try next
    }
  }

  if (repos.length === 0 && repoShort?.includes("/")) {
    try {
      const issue = await gh<GhIssue>([
        "issue", "view", String(issueNumber),
        "--repo", repoShort,
        "--json", "number,title,body,labels",
      ])
      return buildIssueContext(issue, repoShort, ".")
    } catch {
      // ignore
    }
  }

  return undefined
}

function parseFrontmatter(markdown: string): Record<string, string> {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?/)
  if (!match) return {}

  const frontmatter = match[1]
  const values: Record<string, string> = {}
  for (const line of frontmatter.split("\n")) {
    const idx = line.indexOf(":")
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim().toLowerCase()
    const raw = line.slice(idx + 1).trim()
    values[key] = raw.replace(/^"|"$/g, "").replace(/^'|'$/g, "")
  }
  return values
}

function parseMarkdownTitle(markdown: string, fallback: string): string {
  const lines = markdown.split("\n")
  for (const line of lines) {
    const match = line.match(/^#\s+(.+)$/)
    if (match) return match[1].trim()
  }
  return fallback
}

function shortUuid(): string {
  return randomUUID().split("-")[0]
}

export function fetchMarkdownTask(
  markdownPath: string,
  repoShort?: string,
  opts?: { withUuid?: boolean },
): IssueContext {
  const cfg = getConfig()
  const raw = readFileSync(markdownPath, "utf-8")
  const frontmatter = parseFrontmatter(raw)

  const resolvedRepo = frontmatter.repo
    ?? (repoShort
      ? cfg.repos.find((r) => repoShortName(r.repo) === repoShort)?.repo
      : cfg.repos[0]?.repo)

  if (!resolvedRepo) {
    throw new Error("Could not resolve target repo for markdown task")
  }

  const scopePath = frontmatter.scope
    ?? frontmatter.path
    ?? cfg.repos.find((r) => r.repo === resolvedRepo)?.path
    ?? "."

  const fallbackId = basename(markdownPath).replace(/\.md$/i, "")
  const baseId = frontmatter.id ?? `md-${fallbackId}`
  const id = opts?.withUuid && !frontmatter.id ? `${baseId}-${shortUuid()}` : baseId
  const title = frontmatter.title ?? parseMarkdownTitle(raw, fallbackId)

  const issueNumberRaw = frontmatter.issue ?? frontmatter.issuenumber ?? frontmatter.number
  const issueNumber = issueNumberRaw != null && issueNumberRaw !== ""
    ? Number(issueNumberRaw)
    : undefined

  return buildMarkdownContext({
    id,
    title,
    body: raw,
    repo: resolvedRepo,
    scopePath,
    number: Number.isFinite(issueNumber) ? issueNumber : undefined,
  })
}

export function fetchPromptTask(
  prompt: string,
  repoShort?: string,
  opts?: { withUuid?: boolean },
): IssueContext {
  const cfg = getConfig()

  const resolvedRepo = repoShort
    ? cfg.repos.find((r) => repoShortName(r.repo) === repoShort)?.repo
    : cfg.repos[0]?.repo

  if (!resolvedRepo) {
    throw new Error("Could not resolve target repo for prompt task")
  }

  const scopePath = cfg.repos.find((r) => r.repo === resolvedRepo)?.path ?? "."
  const titleSeed = prompt.split("\n").find((line) => line.trim().length > 0)?.trim() ?? "prompt task"
  const title = titleSeed.length > 80 ? `${titleSeed.slice(0, 77)}...` : titleSeed

  const baseId = `prompt-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "task"}`
  const id = opts?.withUuid ? `${baseId}-${shortUuid()}` : baseId

  return buildMarkdownContext({
    id,
    title,
    body: prompt,
    repo: resolvedRepo,
    scopePath,
  })
}

interface ExternalSourcePayload {
  id?: string
  title: string
  body: string
  repo?: string
  scopePath?: string
  number?: number
}

function resolveRepoAndScope(repoShort?: string, overrideRepo?: string, overrideScopePath?: string): { repo: string; scopePath: string } {
  const cfg = getConfig()

  const repo = overrideRepo
    ?? (repoShort
      ? cfg.repos.find((r) => r.repo === repoShort || repoShortName(r.repo) === repoShort)?.repo
      : cfg.repos[0]?.repo)

  if (!repo) {
    throw new Error("Could not resolve target repo")
  }

  const scopePath = overrideScopePath
    ?? cfg.repos.find((r) => r.repo === repo)?.path
    ?? "."

  return { repo, scopePath }
}

async function resolveViaExternalCommand(kind: "github" | "trello" | "slack", input: string, repoShort?: string, opts?: { withUuid?: boolean }): Promise<IssueContext | undefined> {
  const cmd = getConfig().sourceCommands[kind]
  if (!cmd) return undefined

  let resolvedCmd = cmd.startsWith("~/") ? `${homedir()}/${cmd.slice(2)}` : cmd
  if (!isAbsolute(resolvedCmd) && (resolvedCmd.includes("/") || resolvedCmd.endsWith(".ts") || resolvedCmd.endsWith(".js"))) {
    resolvedCmd = resolve(AUTO_PR_HOME, resolvedCmd)
  }

  let stdout: string
  try {
    ({ stdout } = await execa(resolvedCmd, [input], { cwd: process.cwd() }))
  } catch (error) {
    const looksLikeJsOrTsScript = /\.(?:[mc]?js|tsx?)$/i.test(resolvedCmd)
    const code = typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : ""

    if (looksLikeJsOrTsScript && code === "EACCES") {
      ({ stdout } = await execa("bun", [resolvedCmd, input], { cwd: process.cwd() }))
    } else {
      throw error
    }
  }

  const payload = JSON.parse(stdout) as ExternalSourcePayload
  const { repo, scopePath } = resolveRepoAndScope(repoShort, payload.repo, payload.scopePath)

  const baseId = payload.id ?? `${kind}-${payload.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "task"}`
  const id = opts?.withUuid ? `${baseId}-${shortUuid()}` : baseId

  return buildMarkdownContext({
    id,
    title: payload.title,
    body: payload.body,
    repo,
    scopePath,
    number: payload.number,
  })
}

function parseGitHubIssueUrl(input: string): { repo: string; issueNumber: number } | undefined {
  const match = input.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+)\/issues\/(\d+)(?:\?.*)?$/i)
  if (!match) return undefined
  return { repo: match[1], issueNumber: Number(match[2]) }
}

function isSlackThreadUrl(input: string): boolean {
  return /^https?:\/\/.+\.slack\.com\/archives\/[A-Z0-9]+\/p\d+/i.test(input)
}

function isTrelloCardUrl(input: string): boolean {
  return /^https?:\/\/(www\.)?trello\.com\/c\//i.test(input)
}

export async function resolveSourceInput(
  input: string,
  repoShort?: string,
  opts?: { withUuid?: boolean },
): Promise<IssueContext> {
  const trimmed = input.trim()
  if (!trimmed) throw new Error("Empty source input")

  if (trimmed.startsWith("md:")) {
    return fetchMarkdownTask(trimmed.slice("md:".length).trim(), repoShort, opts)
  }

  if (trimmed.startsWith("prompt:")) {
    return fetchPromptTask(trimmed.slice("prompt:".length).trim(), repoShort, opts)
  }

  if (existsSync(trimmed) && trimmed.toLowerCase().endsWith(".md")) {
    return fetchMarkdownTask(trimmed, repoShort, opts)
  }

  if (/^\d+$/.test(trimmed)) {
    const issue = await fetchIssue(Number(trimmed), repoShort)
    if (!issue) throw new Error(`GitHub issue #${trimmed} not found`) 
    return issue
  }

  const ghUrl = parseGitHubIssueUrl(trimmed)
  if (ghUrl) {
    const viaScript = await resolveViaExternalCommand("github", trimmed, repoShort, opts)
    if (viaScript) return viaScript

    const issue = await gh<GhIssue>([
      "issue", "view", String(ghUrl.issueNumber),
      "--repo", ghUrl.repo,
      "--json", "number,title,body,labels",
    ])
    const { scopePath } = resolveRepoAndScope(repoShort, ghUrl.repo)
    return buildIssueContext(issue, ghUrl.repo, scopePath)
  }

  if (isTrelloCardUrl(trimmed)) {
    const viaScript = await resolveViaExternalCommand("trello", trimmed, repoShort, opts)
    if (!viaScript) {
      throw new Error("Trello source not configured. Set sourceCommands.trello in config.json.")
    }
    return viaScript
  }

  if (isSlackThreadUrl(trimmed)) {
    const viaScript = await resolveViaExternalCommand("slack", trimmed, repoShort, opts)
    if (!viaScript) {
      throw new Error("Slack source not configured. Set sourceCommands.slack in config.json.")
    }
    return viaScript
  }

  // Unrecognized URLs should fail explicitly rather than silently becoming a prompt.
  if (/^https?:\/\//i.test(trimmed)) {
    throw new Error(
      `Unrecognized URL: "${trimmed}". Supported: GitHub issue URLs, Trello card URLs, Slack thread URLs.`,
    )
  }

  // Plain text falls through to prompt — warn so the user knows.
  const preview = trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed
  logWarn(`No source type matched — treating as prompt: "${preview}"`)
  return fetchPromptTask(trimmed, repoShort, opts)
}

export async function resolveSourceInputs(
  inputs: string[],
  repoShort?: string,
  opts?: { withUuid?: boolean },
): Promise<IssueContext[]> {
  const contexts: IssueContext[] = []
  for (const input of inputs) {
    contexts.push(await resolveSourceInput(input, repoShort, opts))
  }
  return contexts
}
