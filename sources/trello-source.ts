#!/usr/bin/env bun

/**
 * Trello source resolver for auto-pr.
 *
 * Usage:
 *   trello-source.ts "https://trello.com/c/abc123/my-card"
 *
 * Requires: TRELLO_API_KEY and TRELLO_TOKEN env vars
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

const BASE_URL = "https://api.trello.com/1"

function parseCardId(input: string): string | undefined {
  const m = input.match(/trello\.com\/c\/([a-zA-Z0-9]+)/)
  return m ? m[1] : undefined
}

async function fetchTrello(endpoint: string): Promise<any> {
  const auth = `key=${process.env.TRELLO_API_KEY}&token=${process.env.TRELLO_TOKEN}`
  const sep = endpoint.includes("?") ? "&" : "?"
  const res = await fetch(`${BASE_URL}${endpoint}${sep}${auth}`)
  if (!res.ok) throw new Error(`Trello API ${res.status}: ${await res.text()}`)
  return res.json()
}

function formatBody(card: any, comments: any[], creator: any, members: any[]): string {
  const lines: string[] = []

  if (card.desc) {
    lines.push("## Description", card.desc, "")
  }

  if (card.checklists?.length) {
    lines.push("## Checklists")
    for (const cl of card.checklists) {
      lines.push(`### ${cl.name}`)
      for (const item of cl.checkItems) {
        const done = item.state === "complete" ? "[x]" : "[ ]"
        lines.push(`- ${done} ${item.name}`)
      }
      lines.push("")
    }
  }

  if (members?.length) {
    const names = members.map((m: any) => m.fullName || m.username).join(", ")
    lines.push(`## Assignees`, names, "")
  }

  if (creator) {
    lines.push(`## Created by`, creator.fullName || creator.username, "")
  }

  if (comments?.length) {
    lines.push("## Comments")
    for (const c of comments) {
      const author = c.memberCreator?.fullName || c.memberCreator?.username || "unknown"
      lines.push(`**${author}** (${c.date}):`, c.data?.text || "", "")
    }
  }

  return lines.join("\n").trim()
}

async function main(): Promise<void> {
  const input = process.argv[2]?.trim()
  if (!input) {
    console.error("Missing Trello card URL argument")
    process.exit(1)
  }

  if (!process.env.TRELLO_API_KEY || !process.env.TRELLO_TOKEN) {
    console.error("TRELLO_API_KEY and TRELLO_TOKEN env vars are required")
    process.exit(1)
  }

  const cardId = parseCardId(input)
  if (!cardId) {
    console.error(`Unsupported Trello URL format: ${input}`)
    process.exit(1)
  }

  try {
    const [card, comments, creatorActions, members] = await Promise.all([
      fetchTrello(`/cards/${cardId}?checklists=all`),
      fetchTrello(`/cards/${cardId}/actions?filter=commentCard`),
      fetchTrello(`/cards/${cardId}/actions?filter=createCard`),
      fetchTrello(`/cards/${cardId}/members`),
    ])

    const creator = creatorActions[0]?.memberCreator || null

    const payload = {
      id: `trello-${cardId}`,
      title: card.name,
      body: [
        `Source URL: ${input}`,
        `Card ID: ${cardId}`,
        `Board: ${card.idBoard}`,
        `List: ${card.idList}`,
        `URL: ${card.url}`,
        "",
        formatBody(card, comments, creator, members),
      ].join("\n"),
    }

    process.stdout.write(`${JSON.stringify(payload)}\n`)
  } catch (e) {
    console.error(`Trello fetch failed: ${e instanceof Error ? e.message : String(e)}`)
    process.exit(1)
  }
}

main()
