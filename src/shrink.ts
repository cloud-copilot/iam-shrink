import { expandIamActions } from '@cloud-copilot/iam-expand'
import { ShrinkValidationError } from './errors.js'
import { validateShrinkResults } from './validate.js'

export interface ShrinkOptions {
  iterations: number
}

const defaultOptions: ShrinkOptions = {
  iterations: 2
}

/**
 * Shrink the list of desired patterns minus the excluded patterns to the smallest list of patterns
 * that still includes the actions you want and only the actions you want.
 *
 * This will create a Target Set of actions that match the patterns in {@link desiredPatterns}, and do
 * not match any pattern in {@link excludedPatterns}.
 *
 * It will then derive the list of wildcard patterns that match the Target Set and no other actions.
 *
 * @param desiredPatterns the list of patterns you want to include, e.g. ['s3:Get*', 's3:PutObject', 's3:*Tag*']
 * @param iterations the number of iterations to run the shrink operations
 * @returns the smallest list of patterns that will match only the actions specified by desiredPatterns and not match any of the excludedPatterns or any actions not specified by desiredPatterns.
 */
export async function shrink(
  desiredPatterns: string[],
  shrinkOptions?: Partial<ShrinkOptions>
): Promise<string[]> {
  //Check for an all actions wildcard
  const wildCard = desiredPatterns.find((pattern) => collapseAsterisks(pattern) === '*')
  if (wildCard) {
    return ['*']
  }

  const options = { ...defaultOptions, ...shrinkOptions }
  const targetActions = await expandIamActions(desiredPatterns)
  const expandedActionsByService = groupActionsByService(targetActions)
  const services = Array.from(expandedActionsByService.keys()).sort()

  const reducedActions: string[] = []
  for (const service of services) {
    const desiredActions = expandedActionsByService.get(service)!
    const possibleActions = mapActions(await expandIamActions(`${service}:*`))
    const reducedServiceActions = shrinkResolvedList(
      desiredActions.withoutService,
      possibleActions,
      options.iterations
    )

    //Validation
    const reducedServiceActionsWithService = reducedServiceActions.map(
      (action) => `${service}:${action}`
    )
    const invalidMatch = await validateShrinkResults(
      desiredActions.withService,
      reducedServiceActionsWithService
    )
    if (invalidMatch) {
      throw new ShrinkValidationError(desiredPatterns, invalidMatch)
    }
    reducedActions.push(...reducedServiceActionsWithService)
  }

  return reducedActions
}

/**
 * Map an array of service:action strings to just the action
 *
 * @param actions the array of service:action strings such as ['s3:GetObject', 'ec2:DescribeInstances']
 * @returns an array of just the action strings such as ['GetObject', 'DescribeInstances']
 */
export function mapActions(actions: string[]): string[] {
  return actions.map((action) => action.split(':')[1])
}

/**
 * Groups an array of service:action strings by service
 *
 * Returns a map of service to an object with two arrays: withService and withoutService
 * * withService contains the full service:action strings
 * * withoutService contains just the action strings
 *
 * @param actions the array of service:action strings such as ['s3:GetObject', 'ec2:DescribeInstances']
 * @returns a map of service to an object with two arrays: withService and withoutService
 */
export function groupActionsByService(
  actions: string[]
): Map<string, { withService: string[]; withoutService: string[] }> {
  const serviceMap = new Map<string, { withService: string[]; withoutService: string[] }>()
  actions.forEach((actionString) => {
    const [service, action] = actionString.split(':')
    if (!serviceMap.has(service)) {
      serviceMap.set(service, { withService: [], withoutService: [] })
    }
    serviceMap.get(service)!.withService.push(actionString)
    serviceMap.get(service)!.withoutService.push(action)
  })
  return serviceMap
}

/**
 * Shrink a list of desired actions to the smallest number of patterns that match the desired actions
 * from the possible actions and no other actions.
 *
 * @param desiredActions the list of actions you want to include
 * @param possibleActions the list of actions that are possible
 * @param iterations the number of iterations to run the shrink operations
 * @returns the smallest list of patterns that when compared to possibleActions will match only the desiredActions and no others
 */
export function shrinkResolvedList(
  desiredActions: string[],
  possibleActions: string[],
  iterations: number
): string[] {
  const desiredActionSet = new Set(desiredActions)
  const undesiredActions = possibleActions.filter((action) => !desiredActionSet.has(action))

  if (undesiredActions.length === 0) {
    // If there are no undesired actions, that means we want all actions
    return ['*']
  }

  // Iteratively shrink based on the most commmon sequence until we can't shrink anymore
  let previousActionListLength = desiredActions.length
  let actionList = desiredActions.slice()

  do {
    previousActionListLength = actionList.length
    actionList = shrinkIteration(actionList, undesiredActions, false)
    iterations = iterations - 1
    if (iterations <= 0) {
      return actionList
    }
  } while (actionList.length < previousActionListLength)

  // Iteratively shrink based on all common sequences until we can't shrink anymore
  do {
    previousActionListLength = actionList.length
    actionList = shrinkIteration(actionList, undesiredActions, true)
    iterations = iterations - 1
    if (iterations <= 0) {
      return actionList
    }
  } while (actionList.length < previousActionListLength)

  return actionList
}

/**
 * Shrink the list of desired actions for while excluding the undesired actions
 *
 * @param desiredActions the list of actions you want to include, can be a mix of full actions and wildcards
 * @param undesiredActions the list of actions you want to exclude no matter what
 * @param deep if true, will shrink based on all common sequences, otherwise will only shrink based on the most common sequence
 * @returns the smallest list of actions that will match only the desiredActions and not match any of the undesiredActions or any actions not specified by desiredActions.
 */
export function shrinkIteration(
  desiredActions: string[],
  undesiredActions: string[],
  deep: boolean
): string[] {
  // Find all common words in the strings in the desiredActions array
  const commonSequences = findCommonSequences(desiredActions).filter(
    (sequence) => sequence.sequence != '*'
  )
  commonSequences.sort((a, b) => {
    return b.frequency - a.frequency
  })

  const sequencesToProcess = deep ? commonSequences : commonSequences.slice(0, 1)

  // Reduce the actions based on the common sequences
  let reducedActions = desiredActions
  for (const sequence of sequencesToProcess) {
    const reducedIteration = Array.from(
      new Set(
        reducedActions.map((action) => reduceAction(action, sequence.sequence, undesiredActions))
      )
    )
    reducedActions = consolidateWildcardPatterns(reducedIteration)
  }

  return reducedActions
}

/**
 * Reduces a singele action into a smaller number of parts by replace one part at a time with an asterisk
 * and validating that there are no undesired actions that match the new action
 *
 * @param desiredAction the action to reduce
 * @param sequence the sequence to reduce the action by
 * @param undesiredActions the list of actions that should not match the reduced action
 * @returns the reduced action with as many parts replaced with asterisks as possible while still matching the desired actions and not matching any of the undesired actions
 */
export function reduceAction(
  desiredAction: string,
  sequence: string,
  undesiredActions: string[]
): string {
  const testArray = splitActionIntoParts(desiredAction)
  if (testArray.length === 1) {
    return desiredAction
  }
  const indexOfSequence = testArray.indexOf(sequence)
  let shorterValue = desiredAction

  if (indexOfSequence === 0) {
    const tempArray = testArray.slice()
    //Iterate though ever following element and see if replacing the sequence with the first common sequence results in a failure
    for (let i = 1; i < testArray.length; i++) {
      tempArray[i] = '*'
      const tempString = collapseAsterisks(tempArray.join(''))
      const problemMatch = wildcardActionMatchesAnyString(tempString, undesiredActions)
      if (problemMatch) {
        // Stopping here seems to work the best
        break
      }
      shorterValue = tempString
    }

    //its at the beginning
  } else if (indexOfSequence === testArray.length - 1) {
    //its at the end
    const tempArray = testArray.slice()
    //Iterate through the array backwards and see if replace the items with * results in a failure
    for (let i = testArray.length - 2; i >= 0; i--) {
      tempArray[i] = '*'
      const tempString = collapseAsterisks(tempArray.join(''))
      const problemMatch = wildcardActionMatchesAnyString(tempString, undesiredActions)
      if (problemMatch) {
        // Stopping here seems to work the best
        break
      }

      shorterValue = tempString
    }
  } else if (indexOfSequence > 0) {
    //its in the middle
    const tempArray = testArray.slice()
    //Iterate forward through the array and see if replacing the items with * results in a failure
    for (let i = indexOfSequence + 1; i < testArray.length; i++) {
      tempArray[i] = '*'
      const tempString = collapseAsterisks(tempArray.join(''))
      const problemMatch = wildcardActionMatchesAnyString(tempString, undesiredActions)
      if (problemMatch) {
        //This replacement cased a prolem match, so revert it before going backwards in the strings
        tempArray[i] = testArray[i]
        // Stopping here seems to work the best
        break
      }
      shorterValue = tempString
    }
    //Iterate through the array backwards and see if replace the items with * results in a failure
    for (let i = indexOfSequence - 1; i >= 0; i--) {
      tempArray[i] = '*'
      const tempString = collapseAsterisks(tempArray.join(''))
      const problemMatch = wildcardActionMatchesAnyString(tempString, undesiredActions)
      if (problemMatch) {
        // Stopping here seems to work the best
        break
      }
      shorterValue = tempString
    }
  }

  return shorterValue
}

/**
 * Consolidate multile consecutive asterisks into a single asterisk
 *
 * @param wildcardAction the action to collapse
 * @returns the action with consecutive asterisks collapsed into a single asterisk
 */
export function collapseAsterisks(wildcardAction: string): string {
  return wildcardAction.replace(/\*+/g, '*')
}

/**
 * Convert a wildcard action into a regular expression
 *
 * @param wildcardAction the wildcard action to convert
 * @returns a regular expression that will match the wildcard action
 */
export function regexForWildcardAction(wildcardAction: string): RegExp {
  wildcardAction = collapseAsterisks(wildcardAction)
  const pattern = '^' + wildcardAction.replace(/\*/g, '.*?') + '$'
  return new RegExp(pattern, 'i')
}

/**
 * Checks to see if a wildcard action matches any of the strings in a list
 *
 * @param wildcardAction the wildcard action to check
 * @param strings the list of strings to check against
 * @returns true if the wildcard action matches any of the strings
 */
export function wildcardActionMatchesAnyString(wildcardAction: string, strings: string[]): boolean {
  const regex = regexForWildcardAction(wildcardAction)
  for (const string of strings) {
    if (regex.test(string)) {
      return true
    }
  }
  return false
}

/**
 * Split an IAM Action into parts based on capital letters and asterisks
 * For a new part to start there must be a transition from a lowercase letter to an uppercase letter or an asterisk
 * For example :
 * * "CreateAccessPointForObjectLambda" would be split into ["Create", "Access", "Point", "For", "Object", "Lambda"]
 * * "*ObjectTagging*" would be split into ["*", "Object", "Tagging", "*"]
 *
 * @param input the IAM Action to split
 * @returns the parts of the IAM Action
 */
export function splitActionIntoParts(input: string): string[] {
  // Split the string using a regex that finds transitions from lower to upper case or asterisks
  // and keeps sequences of uppercase letters together
  // return input.split(/(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/);
  return input.split(/(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|(?=[*])|(?<=[*])/)
}

/**
 * Given a list of strings and a list of strings those parts are in, count the number of times each part appears in the strings
 *
 * @param substrings the sub strings to count
 * @param actions the list of strings to count the substrings in
 * @returns Returns a map of the substring to the number of times it appears in the actions
 */
export function countSubstrings(substrings: string[], actions: string[]): Map<string, number> {
  const substringCount = new Map<string, number>()
  substrings.forEach((substring) => {
    let count = 0
    actions.forEach((action) => {
      if (action.includes(substring)) {
        count++
      }
    })
    if (count > 0) {
      substringCount.set(substring, count)
    }
  })
  return substringCount
}

/**
 * Finds all the the common sequences in a list of actions strings and counts their frequency and length.
 *
 * @param actions the list of actions to find common sequences in
 * @returns an array of objects with the sequence, frequency, and length of the common sequences
 */
export function findCommonSequences(
  actions: string[]
): { sequence: string; frequency: number; length: number }[] {
  const allSubstrings = new Set<string>()
  actions.forEach((action) => {
    splitActionIntoParts(action).forEach((substring) => allSubstrings.add(substring))
  })

  const substringCount = countSubstrings(Array.from(allSubstrings), actions)

  const result: any[] = []
  substringCount.forEach((frequency, sequence) => {
    result.push({ sequence, frequency, length: sequence.length })
  })

  return result
}

/**
 * Consolidates overlapping wildcards into their most general form
 *
 * For example:
 *   ['*Object', 'Object*', '*Object*'] will be consolidated into ['*Object*']
 *   ['Get*', '*Get*'] will be consolidated into ['*Get*']
 *
 * @param patterns the list of patterns to consolidate
 * @returns the consolidated list of patterns
 */
export function consolidateWildcardPatterns(patterns: string[]): string[] {
  // Sort patterns to handle simpler cases first
  patterns.sort((a, b) => b.length - a.length)

  let consolidatedPatterns: string[] = []
  for (const pattern of patterns) {
    //If it's already covered, skip it
    const coveredByExistingPattern = consolidatedPatterns.some((consolidated) =>
      matchesPattern(consolidated, pattern)
    )
    if (coveredByExistingPattern) {
      continue
    }

    //If it subsumes any existing patterns, remove them
    consolidatedPatterns = consolidatedPatterns.filter(
      (consolidated) => !matchesPattern(pattern, consolidated)
    )

    consolidatedPatterns.push(pattern)
  }
  return consolidatedPatterns
}

/**
 * Checks a specific string against a general pattern
 * @param general the general pattern, e.g. 's3:Get*'
 * @param specific the specific string, e.g. 's3:GetObject'
 * @returns true if the specific string matches the general pattern
 */
function matchesPattern(general: string, specific: string): boolean {
  const regex = new RegExp('^' + general.replace(/\*/g, '.*') + '$')
  return regex.test(specific)
}
