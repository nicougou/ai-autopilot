#!/usr/bin/env bun

/**
 * Slack source resolver for auto-pr.
 *
 * Usage:
 *   slack-source.ts "https://workspace.slack.com/archives/C123/p1700000000000000"
 *
 * Requires: SLACK_USER_TOKEN env var
 *
 * Output JSON contract:
 * {
 *   id: string,
 *   title: string,
 *   body: string,
 *   repo?: string,
 *   scopePath?: string,
 *   number?: number
 * }
 */

const SLACK_API = "https://slack.com/api"

function parseSlackUrl(input: string): { channel: string; ts: string } | undefined {
  const m = input.match(/\/archives\/([A-Z0-9]+)\/p(\d{10})(\d{6})/i)
  if (!m) return undefined
  return { channel: m[1], ts: `${m[2]}.${m[3]}` }
}

async function fetchSlack(method: string, params: Record<string, string>): Promise<any> {
  const url = `${SLACK_API}/${method}?${new URLSearchParams(params)}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.SLACK_USER_TOKEN}` },
  })
  if (!res.ok) throw new Error(`Slack API HTTP ${res.status}`)
  const data = await res.json()
  if (!data.ok) throw new Error(`Slack API error: ${data.error}`)
  return data
}

async function fetchThread(channel: string, ts: string): Promise<any[]> {
  const messages: any[] = []
  let cursor: string | undefined
  do {
    const params: Record<string, string> = { channel, ts, limit: "200" }
    if (cursor) params.cursor = cursor
    const data = await fetchSlack("conversations.replies", params)
    messages.push(...(data.messages || []))
    cursor = data.response_metadata?.next_cursor || undefined
  } while (cursor)
  return messages
}

function formatMessages(messages: any[]): string {
  return messages
    .map((m, i) => {
      const header = i === 0 ? "**[Thread root]**" : `**[Reply ${i}]**`
      const user = m.user ? `user:${m.user}` : "unknown"
      const text = m.text || ""
      const files =
        m.files?.map((f: any) => `  - file: ${f.name} (${f.mimetype})`).join("\n") || ""
      return [header, `from: ${user}`, `ts: ${m.ts}`, text, files].filter(Boolean).join("\n")
    })
    .join("\n\n---\n\n")
}

async function main(): Promise<void> {
  const input = process.argv[2]?.trim()
  if (!input) {
    console.error("Missing Slack thread URL argument")
    process.exit(1)
  }

  const token = process.env.SLACK_USER_TOKEN
  if (!token) {
    console.error("SLACK_USER_TOKEN env var is required")
    process.exit(1)
  }

  const parsed = parseSlackUrl(input)
  if (!parsed) {
    console.error(`Unsupported Slack URL format: ${input}`)
    process.exit(1)
  }

  try {
    const messages = await fetchThread(parsed.channel, parsed.ts)
    const title =
      messages[0]?.text?.split("\n")[0]?.slice(0, 100) ||
      `Slack thread ${parsed.channel} ${parsed.ts}`

    const payload = {
      id: `slack-${parsed.channel}-${parsed.ts.replace(".", "-")}`,
      title,
      body: [
        `Source URL: ${input}`,
        `Channel: ${parsed.channel}`,
        `Thread TS: ${parsed.ts}`,
        `Messages: ${messages.length}`,
        "",
        formatMessages(messages),
      ].join("\n"),
    }

    process.stdout.write(`${JSON.stringify(payload)}\n`)
  } catch (e) {
    console.error(`Slack fetch failed: ${e instanceof Error ? e.message : String(e)}`)
    process.exit(1)
  }
}

main()
