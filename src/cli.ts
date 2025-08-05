#!/usr/bin/env node

import {
  booleanArgument,
  enumArrayArgument,
  numberArgument,
  parseCliArguments
} from '@cloud-copilot/cli'
import { iamDataUpdatedAt, iamDataVersion } from '@cloud-copilot/iam-data'
import {
  convertLevels,
  convertNumberOfIterations,
  getPackageVersion,
  parseStdIn
} from './cli_utils.js'
import { allActionAccessLevels, shrink, ShrinkOptions } from './shrink.js'

const dataPackage = '@cloud-copilot/iam-data'

async function shrinkAndPrint(actions: string[], shrinkOptions: Partial<ShrinkOptions>) {
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

async function run() {
  const cli = await parseCliArguments(
    'iam-shrink',
    {},
    {
      removeSids: booleanArgument({
        description: 'Remove Sid fields from the policy statements',
        character: 's'
      }),
      removeWhitespace: booleanArgument({
        description: 'Remove whitespace from the policy output',
        character: 'w'
      }),
      iterations: numberArgument({
        description:
          'How many iterations of shrinking should be executed, defaults to 2; zero or less means no limit',
        defaultValue: 2
      }),
      levels: enumArrayArgument({
        description: 'The access levels to reduce in the policy, defaults to all levels',
        validValues: allActionAccessLevels,
        defaultValue: []
      }),
      readWaitMs: numberArgument({
        description: 'Milliseconds to wait for the first byte from stdin before timing out'
      }),
      showDataVersion: booleanArgument({
        character: 'd',
        description: 'Print the version of the iam-data package being used and exit'
      })
    },
    {
      operandsName: 'action',
      allowOperandsFromStdin: true,
      version: {
        currentVersion() {
          return getPackageVersion()
        },
        checkForUpdates: '@cloud-copilot/iam-shrink'
      }
    }
  )

  if (cli.args.showDataVersion) {
    const version = await iamDataVersion()
    console.log(`${dataPackage} version: ${version}`)
    console.log(`Data last updated: ${await iamDataUpdatedAt()}`)
    console.log(`Update with either:`)
    console.log(`  npm update ${dataPackage}`)
    console.log(`  npm update -g ${dataPackage}`)
    return
  }

  const actionStrings = cli.operands

  const shrinkArgs = {
    ...cli.args,
    iterations: convertNumberOfIterations(cli.args.iterations),
    levels: convertLevels(cli.args.levels)
  }
  if (shrinkArgs.iterations === undefined) {
    delete shrinkArgs.iterations
  }

  if (actionStrings.length === 0) {
    //If no actions are provided, read from stdin
    const stdInResult = await parseStdIn(shrinkArgs)
    if (stdInResult.object) {
      const spaces = shrinkArgs.removeWhitespace ? 0 : 2
      console.log(JSON.stringify(stdInResult.object, null, spaces))
      return
    } else if (stdInResult.strings) {
      actionStrings.push(...stdInResult.strings)
    }
  }

  if (actionStrings.length > 0) {
    await shrinkAndPrint(actionStrings, shrinkArgs)
    return
  }

  console.log('No actions provided or input from stdin')
  cli.printHelp()
}

run()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .then(() => {})
  .finally(() => {})
