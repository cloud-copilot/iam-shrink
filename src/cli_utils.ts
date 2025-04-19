import { readStdin } from '@cloud-copilot/cli'
import { readPackageFile } from './readPackageFile.js'
import { ActionAccessLevel, allActionAccessLevels, ShrinkOptions } from './shrink.js'
import { shrinkJsonDocument } from './shrink_file.js'

interface CliOptions extends ShrinkOptions {
  showDataVersion: boolean
  readWaitMs: number
}

export function convertNumberOfIterations(iterations: number | undefined): number | undefined {
  if (iterations != undefined && iterations <= 0) {
    return Infinity
  } else {
    return iterations
  }
}

export function convertLevels(levels: ActionAccessLevel[]): ActionAccessLevel[] {
  if (levels === undefined || levels.length === 0) {
    levels = allActionAccessLevels
  }

  return levels
}

const actionPattern = /\:?([a-zA-Z0-9-]+:[a-zA-Z0-9*]+)/g
export function extractActionsFromLineOfInput(line: string): string[] {
  const matches = line.matchAll(actionPattern)

  return Array.from(matches)
    .filter((match) => !match[0].startsWith('arn:') && !match[0].startsWith(':'))
    .map((match) => match[1])
}

/**
 * Parse the actions from stdin
 *
 * @returns an array of strings from stdin
 */
export async function parseStdIn(
  options: Partial<CliOptions>
): Promise<{ strings?: string[]; object?: any }> {
  const data = await readStdin(options.readWaitMs)
  if (data.length === 0) {
    return {}
  }

  try {
    const object = await shrinkJsonDocument(options, JSON.parse(data))
    return { object }
  } catch (err: any) {}

  const lines = data.split('\n')
  const actions = lines.flatMap((line) => extractActionsFromLineOfInput(line))
  return { strings: actions }
}

/**
 * Get the package version of iam-shrink being used
 *
 * @returns the package version
 */
export async function getPackageVersion(): Promise<string> {
  const packageData = await readPackageFile(['package.json'])
  const packageInfo = JSON.parse(packageData)
  return packageInfo.version
}
