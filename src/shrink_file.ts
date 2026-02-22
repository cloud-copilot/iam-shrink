import { type ShrinkOptions, shrink } from './shrink.js'

/**
 * Takes any JSON document and shrinks any Action or NotAction array of strings in the document.
 * *MODIFIES THE DOCUMENT IN PLACE*
 *
 * @param options the options to use when shrinking the actions
 * @param document the JSON document to expand
 * @param key the key of the current node in the document
 * @returns the original JSON document with any actions expanded in place
 */
export async function shrinkJsonDocument(
  options: Partial<ShrinkOptions>,
  document: any,
  key?: string
): Promise<any> {
  if (key === 'Action' || key === 'NotAction') {
    // if (typeof document === 'string') {
    //   // return shrink([document], options);
    // }
    if (Array.isArray(document) && document.length > 0 && typeof document[0] === 'string') {
      return shrink(document, options)
    }
  }

  if (Array.isArray(document)) {
    const results = []
    for (const item of document) {
      results.push(await shrinkJsonDocument(options, item))
    }
    return results
  }

  if (typeof document === 'object' && document !== null) {
    for (const key of Object.keys(document)) {
      if (key === 'Sid' && typeof document[key] === 'string' && options.removeSids) {
        delete document[key]
      } else {
        document[key] = await shrinkJsonDocument(options, document[key], key)
      }
    }
    return document
  }

  return document
}
