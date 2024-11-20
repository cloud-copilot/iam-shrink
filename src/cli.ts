#!/usr/bin/env node

import { iamDataUpdatedAt, iamDataVersion } from "@cloud-copilot/iam-data"
import { convertOptions, parseStdIn } from "./cli_utils.js"
import { shrink, ShrinkOptions } from "./shrink.js"

const commandName = 'iam-shrink'
const dataPackage = '@cloud-copilot/iam-data'

async function shrinkAandPrint(actions: string[], shrinkOptions: Partial<ShrinkOptions>) {
  try {
    const result = await shrink(actions, shrinkOptions)
    for (const action of result) {
      console.log(action)
    }
  } catch (e: any) {
    console.error(e.message)
    process.exit(1)
  }
}

function printUsage() {
  console.log('No arguments provided or input from stdin')
  console.log('Usage:')
  console.log(`  ${commandName} [options] [action1] [action2] ...`)
  console.log(`  <input from stdout> | ${commandName} [options]`)
  console.log('Shrink ActionOptions:')
  console.log('  --iterations: How many iterations of shrinking should be executed, defaults to 2; zero or less means no limit')
  console.log('                Example: --iterations=5')
  console.log('                Example: --iterations=-1')
  console.log('CLI Behavior Options:')
  console.log('  --show-data-version: Print the version of the iam-data package being used and exit')
  console.log('  --read-wait-ms: Millisenconds to wait for the first byte from stdin before timing out.')
  console.log('                  Example: --read-wait-ms=10_000')
  process.exit(1)
}

const args = process.argv.slice(2); // Ignore the first two elements
const actionStrings: string[] = []
const optionStrings: string[] = []

for (const arg of args) {
  if(arg.startsWith('--')) {
    optionStrings.push(arg)
  } else {
    actionStrings.push(arg)
  }
}

async function run() {
  const options = convertOptions(optionStrings)
  if(options.showDataVersion) {
    const version = await iamDataVersion()
    console.log(`${dataPackage} version: ${version}`)
    console.log(`Data last updated: ${await iamDataUpdatedAt()}`)
    console.log(`Update with either:`)
    console.log(`  npm update ${dataPackage}`)
    console.log(`  npm update -g ${dataPackage}`)
    return
  }

  if(actionStrings.length === 0) {
    //If no actions are provided, read from stdin
    const stdInResult = await parseStdIn(options)
    if(stdInResult.object) {
      console.log(JSON.stringify(stdInResult.object, null, 2))
      return
    } else if (stdInResult.strings) {
      actionStrings.push(...stdInResult.strings)
    }
  }

  if(actionStrings.length > 0) {
    await shrinkAandPrint(actionStrings, options)
    return
  }

  printUsage()

}

run().catch((e) => {
  console.error(e)
  process.exit(1)
}).then(() => {}).finally(() => {})