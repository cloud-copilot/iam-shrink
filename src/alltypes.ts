import { iamActionDetails, iamActionsForService, iamServiceKeys } from '@cloud-copilot/iam-data'

async function main() {
  const types = new Set<string>()
  const services = await iamServiceKeys()
  for (const service of services) {
    const actions = await iamActionsForService(service)
    for (const action of actions) {
      const details = await iamActionDetails(service, action)
      console.log(`${service}:${action}`, details.accessLevel)
      types.add(details.accessLevel)
    }
  }

  console.log('Access Levels:')
  for (const type of types) {
    console.log(`- ${type}`)
  }
}

main()
  .then(() => {
    console.log('done')
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
