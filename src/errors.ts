const bugBaseUrl = 'https://github.com/cloud-copilot/iam-shrink/issues/new'

/**
 * The title of the bug report
 * @param errorMatch The undesired match
 * @returns the title of the bug report
 */
function bugTitle(errorMatch: string) {
  return `Bug: ShrinkValidationError. ${errorMatch}`;
}

/**
 * The body of the bug report
 *
 * @param errorMatch The undesired match
 * @param desiredPatterns The desired patterns
 * @param excludedPatterns The excluded patterns
 * @returns the body of the bug report
 */
function bugBody(errorMatch: string, desiredPatterns: string[]) {
  return `${errorMatch} while shrinking patterns ${JSON.stringify(desiredPatterns)}`;
}

/**
 * Get the full url of the full bug report
 *
 * @param desiredPatterns The desired patterns
 * @param excludedPatterns The excluded patterns
 * @param errorMatch The undesired match that caused the bug
 * @returns the full url to create a new bug report
 */
function bugUrl(desiredPatterns: string[], errorMatch: string) {
  return `${bugBaseUrl}?labels=bug&title=${encodeURIComponent(bugTitle(errorMatch))}&body=${encodeURIComponent(bugBody(errorMatch, desiredPatterns))}`;
}

export class ShrinkValidationError extends Error {
  /**
   * Capture a validation error from a shrink operation
   *
   * @param desiredPatterns the patterns the user wanted to shrink
   * @param excludedPatterns the patterns the user wanted to exclude
   * @param errorMatch the undesired match that triggered the bug
   */
  constructor(public readonly desiredPatterns: string[], public readonly errorMatch: string) {
    super([
      `@cloud-copilot/iam-shrink has failed validation and this is a bug.`,
      `Please file a bug at ${bugUrl(desiredPatterns, errorMatch)}`,
    ].join("\n"));
    this.name = "ShrinkValidationError"; // Set the name of the error
  }
}

