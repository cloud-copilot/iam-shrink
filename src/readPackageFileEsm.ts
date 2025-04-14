import { readRelativeFile } from '@cloud-copilot/cli'

let levels = 2
//@ts-ignore
if (import.meta.url.includes('src')) {
  levels = 1
}

export async function readPackageFile(pathParts: string[]): Promise<string> {
  //@ts-ignore
  const packageFile = await readRelativeFile(import.meta.url, levels, pathParts)
  return packageFile
}
