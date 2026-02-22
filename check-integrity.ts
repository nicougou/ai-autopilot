#!/usr/bin/env bun

import { readdirSync, readFileSync, existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

type Failure = { area: string; message: string }

const __dirname = dirname(fileURLToPath(import.meta.url))

function read(path: string): string {
  return readFileSync(path, "utf-8")
}

function parsePipeline(pipelineText: string): {
  importsByVar: Map<string, string>
  orderedSteps: Array<{ name: string; runVar: string }>
} {
  const importsByVar = new Map<string, string>()
  for (const m of pipelineText.matchAll(/import\s+\{\s*(\w+)\s*\}\s+from\s+"\.\/steps\/(\d{3}-[^"\n]+)\.js"/g)) {
    importsByVar.set(m[1], `${m[2]}.ts`)
  }

  const orderedSteps: Array<{ name: string; runVar: string }> = []
  for (const m of pipelineText.matchAll(/\{\s*name:\s*"([^"]+)",\s*run:\s*(\w+)\s*\}/g)) {
    orderedSteps.push({ name: m[1], runVar: m[2] })
  }

  return { importsByVar, orderedSteps }
}

function parsePromptTemplates(utilsText: string): Map<string, string> {
  const out = new Map<string, string>()
  const blockMatch = utilsText.match(/export const PROMPT_TEMPLATES = \{([\s\S]*?)\} as const/)
  if (!blockMatch) return out

  for (const m of blockMatch[1].matchAll(/(\w+):\s*"([^"]+)"/g)) {
    out.set(m[1], m[2])
  }
  return out
}

function collectRunAgentStepNames(stepsDir: string): Set<string> {
  const out = new Set<string>()
  for (const file of readdirSync(stepsDir)) {
    if (!file.endsWith(".ts")) continue
    const text = read(join(stepsDir, file))
    for (const m of text.matchAll(/stepName:\s*"(\w+)"/g)) {
      out.add(m[1])
    }
  }
  return out
}

function parseConfig(path: string): any {
  return JSON.parse(read(path))
}

function numericPrefix(fileName: string): number | undefined {
  const m = fileName.match(/^(\d{3})-/)
  return m ? Number(m[1]) : undefined
}

function checkPipelineAndNumbering(pipelinePath: string, failures: Failure[]): void {
  const pipelineText = read(pipelinePath)
  const { importsByVar, orderedSteps } = parsePipeline(pipelineText)

  orderedSteps.forEach((step, idx) => {
    const expected = idx + 1
    const importedFile = importsByVar.get(step.runVar)
    if (!importedFile) {
      failures.push({ area: "pipeline", message: `Missing import for run function '${step.runVar}' (step '${step.name}').` })
      return
    }

    const prefix = numericPrefix(importedFile)
    if (prefix !== expected) {
      failures.push({
        area: "pipeline",
        message: `Step '${step.name}' is position ${expected} but uses file '${importedFile}' (expected prefix ${String(expected).padStart(3, "0")}).`,
      })
    }

    const expectedSlug = step.name
    const actualSlug = importedFile.replace(/^\d{3}-/, "").replace(/\.ts$/, "")
    if (actualSlug !== expectedSlug) {
      failures.push({
        area: "pipeline",
        message: `Step '${step.name}' should map to file slug '${expectedSlug}', found '${actualSlug}'.`,
      })
    }
  })
}

function checkPromptTemplatesAndAgentSteps(utilsPath: string, stepsDir: string, templatesDir: string, pipelinePath: string, failures: Failure[]): void {
  const utilsText = read(utilsPath)
  const templates = parsePromptTemplates(utilsText)
  if (templates.size === 0) {
    failures.push({ area: "prompts", message: "Could not parse PROMPT_TEMPLATES in utils.ts." })
    return
  }

  for (const [key, fileName] of templates.entries()) {
    const full = join(templatesDir, fileName)
    if (!existsSync(full)) {
      failures.push({ area: "prompts", message: `PROMPT_TEMPLATES.${key} points to missing file '${fileName}'.` })
    }
  }

  const stepNames = collectRunAgentStepNames(stepsDir)
  for (const stepName of stepNames) {
    if (!templates.has(stepName)) {
      failures.push({ area: "prompts", message: `runAgent uses stepName '${stepName}' but PROMPT_TEMPLATES has no matching key.` })
    }
  }

  const pipelineText = read(pipelinePath)
  const { importsByVar, orderedSteps } = parsePipeline(pipelineText)
  orderedSteps.forEach((step, idx) => {
    const stepFile = importsByVar.get(step.runVar)
    if (!stepFile) return
    const stepText = read(join(stepsDir, stepFile))
    const match = stepText.match(/stepName:\s*"(\w+)"/)
    if (!match) return
    const stepName = match[1]
    const templateFile = templates.get(stepName)
    if (!templateFile) return

    const prefix = numericPrefix(templateFile)
    const expectedPrefix = idx + 1
    if (prefix !== expectedPrefix) {
      failures.push({
        area: "prompts",
        message: `Pipeline step '${step.name}' uses template '${templateFile}' via stepName '${stepName}', expected prefix ${String(expectedPrefix).padStart(3, "0")}.`,
      })
    }
  })
}

function checkConfigStepKeys(utilsPath: string, configPaths: string[], failures: Failure[]): void {
  const utilsText = read(utilsPath)
  const templates = parsePromptTemplates(utilsText)
  const expectedStepKeys = [...templates.keys()].sort()

  for (const configPath of configPaths) {
    const cfg = parseConfig(configPath)
    const stepsByRunner = cfg?.models
    for (const runner of ["claude", "opencode"] as const) {
      const stepObj = stepsByRunner?.[runner]?.steps ?? {}
      const actualKeys = Object.keys(stepObj).sort()

      for (const key of expectedStepKeys) {
        if (!(key in stepObj)) {
          failures.push({
            area: "config",
            message: `${configPath}: models.${runner}.steps is missing '${key}'.`,
          })
        }
      }

      for (const key of actualKeys) {
        if (!templates.has(key)) {
          failures.push({
            area: "config",
            message: `${configPath}: models.${runner}.steps has unknown key '${key}' (not in PROMPT_TEMPLATES).`,
          })
        }
      }
    }
  }
}

function main(): void {
  const pipelinePath = join(__dirname, "pipeline.ts")
  const utilsPath = join(__dirname, "utils.ts")
  const stepsDir = join(__dirname, "steps")
  const templatesDir = join(__dirname, "prompt-templates")
  const configExamplePath = join(__dirname, "config.example.json")

  const failures: Failure[] = []

  checkPipelineAndNumbering(pipelinePath, failures)
  checkPromptTemplatesAndAgentSteps(utilsPath, stepsDir, templatesDir, pipelinePath, failures)
  checkConfigStepKeys(utilsPath, [configExamplePath], failures)

  if (failures.length === 0) {
    console.log("ai-autopilot integrity check passed")
    return
  }

  console.error(`ai-autopilot integrity check failed (${failures.length})`)
  for (const failure of failures) {
    console.error(`- [${failure.area}] ${failure.message}`)
  }
  process.exit(1)
}

main()
