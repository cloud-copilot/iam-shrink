import { expandIamActions } from "@cloud-copilot/iam-expand";

/**
 * Checks a list of patterns against a list of desired actions to validate:
 * * All desired actions are matched by the patterns
 * * No undesired actions are matched by the patterns
 *
 * @param desiredActions The actions that should be in the list
 * @param patterns The list of patterns that the algorithm has derived
 * @returns the first match error if any, otherwise undefined
 */
export async function validateShrinkResults(desiredActions: string[], patterns: string[]): Promise<string | undefined> {
  const desiredActionSet = new Set(desiredActions);
  const expandedAfterActions = await expandIamActions(patterns, {expandServiceAsterisk: true});
  const expandedAfterActionSet = new Set(expandedAfterActions);
  for(const afterAction of expandedAfterActions) {
    if(!desiredActionSet.has(afterAction)) {
      return `Undesired action: ${afterAction}`;
    }
  }

  for(const desiredAction of desiredActions) {
    if(!expandedAfterActionSet.has(desiredAction)) {
      return `Missing action ${desiredAction}`
    }
  }

  return undefined;
}