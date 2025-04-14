import { iamActionDetails } from '@cloud-copilot/iam-data'
import { expandIamActions, matchesAnyAction } from '@cloud-copilot/iam-expand'
import { beforeEach } from 'node:test'
import { describe, expect, it, vi } from 'vitest'
import {
  ActionAccessLevel,
  consolidateWildcardPatterns,
  countSubstrings,
  findCommonSequences,
  groupActionsByService,
  isAllAccessLevels,
  mapActions,
  reduceAction,
  regexForWildcardAction,
  shrink,
  shrinkIteration,
  shrinkResolvedList,
  splitActionIntoParts,
  wildcardActionMatchesAnyString
} from './shrink.js'
import { validateShrinkResults } from './validate.js'

vi.mock('@cloud-copilot/iam-expand')
vi.mock('@cloud-copilot/iam-data')
vi.mock('./validate.js')

const mockExpandIamActions = vi.mocked(expandIamActions)
const mockValidateShrinkResults = vi.mocked(validateShrinkResults)
const mockIamActionDetails = vi.mocked(iamActionDetails)

beforeEach(() => {
  vi.resetAllMocks()
})

describe('shrink.ts', () => {
  describe('splitActionIntoParts', () => {
    it('should split by capital letters', () => {
      //Given an action with capital letters
      const input = 'CreateAccessPointForObjectLambda'

      //When we split the action into parts
      const result = splitActionIntoParts(input)

      //Then we should get an array of parts
      expect(result).toEqual(['Create', 'Access', 'Point', 'For', 'Object', 'Lambda'])
    })

    it('should split by asterisks', () => {
      //Given an action with asterisks
      const input = '*ObjectTagging*'

      //When we split the action into parts
      const result = splitActionIntoParts(input)

      //Then we should get an array of parts
      expect(result).toEqual(['*', 'Object', 'Tagging', '*'])
    })

    it('should not split on consecutive capital letters', () => {
      //Given an action with only capital letters
      const input = 'GET'

      //When we split the action into parts
      const result = splitActionIntoParts(input)

      //Then we should back the original string
      expect(result).toEqual([input])
    })
  })

  describe('consolidateWildcardPatterns', () => {
    it('should consolidate wildcard patterns', () => {
      //Given wildcard actions
      const actions = ['*Object', 'Object*', '*Object*']

      //When we consolidate the actions
      const result = consolidateWildcardPatterns(actions)

      //Then we should get an array of consolidated actions
      expect(result).toEqual(['*Object*'])
    })

    it('should not over consolidate in the middle', () => {
      //Given the wildcard actions
      const actions = [
        'Delete*Tagging',
        'GetJobTagging',
        'GetObjectTagging',
        'GetObject*Tagging',
        'GetStorage*Tagging',
        'Put*Tagging'
      ]

      //When we consolidate the actions
      const result = consolidateWildcardPatterns(actions)

      //Then we should get an array of consolidated actions
      expect(result.sort()).toEqual(
        [
          'Delete*Tagging',
          'GetJobTagging',
          'GetObject*Tagging',
          'GetStorage*Tagging',
          'Put*Tagging'
        ].sort()
      )
    })

    it('should consolidate multiple patterns', () => {
      //Given a list of wildcard actions
      const actions = [
        's3:List*',
        's3:ListB*',
        's3:ListBu*',
        's3:ListBuc*',
        's3:ListBuck*',
        's3:ListBucke*',
        's3:ListBucket*'
      ]

      //When we consolidate the actions
      const result = consolidateWildcardPatterns(actions)

      //Then we should get an array of consolidated actions
      expect(result.sort()).toEqual(['s3:List*'].sort())
    })
  })

  describe('countSubstrings', () => {
    it('will count strings that appear in the substrings', () => {
      //Given a set of substrings
      const substrings = ['Get', 'Object', 'Tagging', 'Put']
      const actionStrings = ['GetObjectTagging', 'PutObjectTagging']

      //When we count the substrings
      const result = countSubstrings(substrings, actionStrings)

      //Then we should get the count of substrings
      expect(result.size).toEqual(4)
      expect(result.get('Get')).toBe(1)
      expect(result.get('Object')).toBe(2)
      expect(result.get('Tagging')).toBe(2)
      expect(result.get('Put')).toBe(1)
    })

    it('does not count substrings that are not in the action strings', () => {
      //Given a set of substrings
      const substrings = ['Silliness', 'Get']
      const actionStrings = ['GetObjectTagging', 'PutObjectTagging']

      //When we count the substrings
      const result = countSubstrings(substrings, actionStrings)

      //Then we should get the count of substrings
      expect(result.size).toEqual(1)
      expect(result.get('Get')).toBe(1)
    })
  })

  describe('findCommonSequences', () => {
    it('counts up the common sequences', () => {
      //Given a set of actions
      const actions = [
        'GetObjectTagging',
        'PutObjectTagging',
        'GetBucketTagging',
        'GetObjectVersionAcl',
        'Get*'
      ]

      //When we find the common sequences
      const result = findCommonSequences(actions)

      //And sort them
      result.sort((a, b) => {
        return a.sequence.localeCompare(b.sequence)
      })

      //Then we should get the common sequences
      expect(result).toEqual([
        { sequence: '*', frequency: 1, length: 1 },
        { sequence: 'Acl', frequency: 1, length: 3 },
        { sequence: 'Bucket', frequency: 1, length: 6 },
        { sequence: 'Get', frequency: 4, length: 3 },
        { sequence: 'Object', frequency: 3, length: 6 },
        { sequence: 'Put', frequency: 1, length: 3 },
        { sequence: 'Tagging', frequency: 3, length: 7 },
        { sequence: 'Version', frequency: 1, length: 7 }
      ])
    })
  })

  describe('regexForWildcardAction', () => {
    it('should create a regex for a wildcard action', () => {
      //Given a wildcard action
      const action = '*ObjectTagging*'

      //When we create a regex for the action
      const result = regexForWildcardAction(action)

      //Then we should get a regex that matches the action
      expect(result.source).toBe('^.*?ObjectTagging.*?$')
      expect(result.flags).toBe('i')
    })

    it('should collapse consecutive asterisks', () => {
      //Given a wildcard action with consecutive asterisks
      const action = '*Object****Tagging*'

      //When we create a regex for the action
      const result = regexForWildcardAction(action)

      //Then we should get a regex that matches the action
      expect(result.source).toBe('^.*?Object.*?Tagging.*?$')
    })
  })

  describe('wildcardActionMatchesAnyString', () => {
    it('should match a string that matches the wildcard action', () => {
      //Given a wildcard action
      const wildcardAction = '*ObjectTagging*'
      //And a list of strings with one that matches the wildcard action
      const strings = ['GetObjectTagging', 'PutObjectTagging', 'GetObjectVersionAcl']

      //When we match the strings against the action
      const result = wildcardActionMatchesAnyString(wildcardAction, strings)

      //Then we should get a match
      expect(result).toBe(true)
    })

    it('should return false if there are no matches', () => {
      //Given a wildcard action
      const wildcardAction = '*ObjectTagging*'
      //And a list of strings with none that match the wildcard action
      const strings = ['GetObjectVersionAcl', 'PutBucketTagging']

      //When we match the strings against the action
      const result = wildcardActionMatchesAnyString(wildcardAction, strings)

      //Then we should not get a match
      expect(result).toBe(false)
    })

    it('should return false if for an empty list of strings', () => {
      //Given a wildcard action
      const wildcardAction = '*ObjectTagging*'
      //And an empty list of strings
      const strings: string[] = []

      //When we match the strings against the action
      const result = wildcardActionMatchesAnyString(wildcardAction, strings)

      //Then the result should be false
      expect(result).toBe(false)
    })
  })

  const reduceActionCases: {
    action: string
    sequence: string
    undesiredActions: string[]
    expected: string
    name?: string
  }[] = [
    //Sequence at the beginning
    {
      action: 'GetObjectTagging',
      sequence: 'Get',
      undesiredActions: ['GetObjectAcl'],
      expected: 'Get*Tagging'
    },
    {
      action: 'GetObjectTagging',
      sequence: 'Get',
      undesiredActions: ['PutObjectTagging'],
      expected: 'Get*'
    },

    //Sequence in the middle, remove beginning
    {
      action: 'GetObjectTagging',
      sequence: 'Object',
      undesiredActions: ['PutObjectVersion', 'GetObjectVersion'],
      expected: '*ObjectTagging'
    },
    {
      action: 'GetIntelligentTieringConfiguration',
      sequence: 'Tiering',
      undesiredActions: ['GetIntelligentTieringStructure'],
      expected: '*TieringConfiguration'
    },

    //Sequence in the middle, remove end
    {
      action: 'GetObjectTagging',
      sequence: 'Object',
      undesiredActions: ['PutObjectTagging'],
      expected: 'GetObject*'
    },
    {
      action: 'GetObjectTaggingVersion',
      sequence: 'Object',
      undesiredActions: ['PutObjectTagging'],
      expected: 'GetObject*'
    },

    //Sequence in the middle, remove beginning and end
    {
      action: 'GetObjectTagging',
      sequence: 'Object',
      undesiredActions: ['ListBucketVersions'],
      expected: '*Object*'
    },

    //Sequence at the end
    {
      action: 'GetObjectTagging',
      sequence: 'Tagging',
      undesiredActions: ['PutObjectTagging'],
      expected: 'Get*Tagging'
    },
    {
      action: 'GetObjectTagging',
      sequence: 'Tagging',
      undesiredActions: ['PutObjectTagging'],
      expected: 'Get*Tagging'
    },
    {
      action: 'GetObjectTagging',
      sequence: 'Tagging',
      undesiredActions: ['GetObjectAcl'],
      expected: '*Tagging'
    },

    //Action only Has One Part
    { action: 'GET', sequence: 'GET', undesiredActions: ['PUT'], expected: 'GET' }
  ]

  describe('reduceAction', () => {
    for (const { action, sequence, undesiredActions, expected, name } of reduceActionCases) {
      it(name ?? `should reduce ${action} to ${expected}`, () => {
        //When we reduce the action
        const result = reduceAction(action, sequence, undesiredActions)

        //Then we should get the reduced action
        expect(result).toBe(expected)
      })
    }

    it('should replace parts after the sequence if it occurs at the beginning', () => {})
  })

  describe('shrinkIteration', () => {
    it('should shrink the actions, shallow', () => {
      //Given a list of actions
      const actions = [
        'GetObjectTagging',
        'PutObjectTagging',
        'GetBucketTagging',
        'GetObjectVersionAcl'
      ]
      //And a set of undesired actions
      const undesiredActions = ['GetObjectAcl', 'PutObjectTagging']

      //When we shrink the actions
      const result = shrinkIteration(actions, undesiredActions, new Set(), false)

      //Then we should get the reduced actions
      expect(result).toEqual([
        // "*ObjectTagging",
        'PutObjectTagging',
        'Get*VersionAcl',
        'Get*Tagging'
      ])
    })

    it('should shrink the actions, deep', () => {
      //Given a list of actions
      const actions = [
        'GetObjectTagging',
        'PutObjectTagging',
        'GetBucketTagging',
        'GetObjectVersionAcl'
      ]
      //And a set of undesired actions
      const undesiredActions = ['GetObjectAcl', 'PutObjectTagging']

      //When we shrink the actions
      const result = shrinkIteration(actions, undesiredActions, new Set(), true)

      //Then we should get the reduced actions
      expect(result).toEqual(['PutObjectTagging', 'Get*Tagging', '*Version*'])
    })
  })

  describe('shrinkResolvedList', () => {
    it('should return a wildcard if all actions are desired', () => {
      //Given a list of actions
      const actions = [
        'GetObjectTagging',
        'PutObjectTagging',
        'GetBucketTagging',
        'GetObjectVersionAcl'
      ]
      //And an exact same list of possible actions
      const possibleActions = actions.slice(0)

      //When we shrink the actions
      const result = shrinkResolvedList(actions, possibleActions, new Set(), Infinity)

      //Then we should get a wildcard
      expect(result).toEqual(['*'])
    })

    it('should shrink the list with two iterations', () => {
      //Given a list of actions
      const actions = [
        'GetObjectTagging',
        'PutObjectTagging',
        'GetBucketTagging',
        'GetObjectVersionAcl'
      ]
      //And a set of undesired actions
      const possibleActions = [
        'GetObjectTagging',
        'PutObjectTagging',
        'GetBucketTagging',
        'GetObjectVersionAcl',
        'GetObjectAcl',
        'GetObjectVersion'
      ]

      //When we shrink the actions
      const result = shrinkResolvedList(actions, possibleActions, new Set(), 2)

      //Then we should get the reduced actions
      expect(result.sort()).toEqual(['*Tagging', 'Get*VersionAcl'])
    })

    it('should shrink the list of actions aggressively', () => {
      //Given a list of actions
      const actions = [
        'GetObjectTagging',
        'PutObjectTagging',
        'GetBucketTagging',
        'GetObjectVersionAcl'
      ]
      //And a set of undesired actions
      const possibleActions = [
        'GetObjectTagging',
        'PutObjectTagging',
        'GetBucketTagging',
        'GetObjectVersionAcl',
        'GetObjectAcl',
        'GetObjectVersion'
      ]

      //When we shrink the actions
      const result = shrinkResolvedList(actions, possibleActions, new Set(), Infinity)

      //Then we should get the reduced actions
      expect(result.sort()).toEqual(['*Tagging', '*VersionAcl'])
    })
  })

  describe('groupActionsByService', () => {
    it('should group the actions by service', () => {
      //Given a list of actions
      const actions = [
        's3:GetObjectTagging',
        's3:PutObjectTagging',
        's3:GetBucketTagging',
        's3:GetObjectVersionAcl',
        'ec2:GetObjectTagging',
        'ec2:PutObjectTagging',
        'ec2:GetBucketTagging'
      ]

      //When we group the actions by service
      const result = groupActionsByService(actions)

      //Then we should get the actions grouped by service
      expect([...result.keys()]).toEqual(['s3', 'ec2'])

      expect(result.get('s3')).toEqual({
        withService: [
          's3:GetObjectTagging',
          's3:PutObjectTagging',
          's3:GetBucketTagging',
          's3:GetObjectVersionAcl'
        ],
        withoutService: [
          'GetObjectTagging',
          'PutObjectTagging',
          'GetBucketTagging',
          'GetObjectVersionAcl'
        ]
      })

      expect(result.get('ec2')).toEqual({
        withService: ['ec2:GetObjectTagging', 'ec2:PutObjectTagging', 'ec2:GetBucketTagging'],
        withoutService: ['GetObjectTagging', 'PutObjectTagging', 'GetBucketTagging']
      })
    })
  })

  describe('mapActions', () => {
    it('should map the actions with the service', () => {
      //Given a list of actions
      const actions = [
        's3:GetObjectTagging',
        's3:PutObjectTagging',
        's3:GetBucketTagging',
        's3:GetObjectVersionAcl',
        'ec2:GetObjectTagging',
        'ec2:PutObjectTagging',
        'ec2:GetBucketTagging'
      ]

      //When we map the actions to services
      const result = mapActions(actions)

      //Then we should get the actions grouped by service
      expect(result).toEqual([
        'GetObjectTagging',
        'PutObjectTagging',
        'GetBucketTagging',
        'GetObjectVersionAcl',
        'GetObjectTagging',
        'PutObjectTagging',
        'GetBucketTagging'
      ])
    })
  })

  describe('shrink', () => {
    it('should shrink the actions', async () => {
      //Given a list of actions
      const actions = [
        's3:GetObjectTagging',
        's3:PutObjectTagging',
        's3:GetBucketTagging',
        's3:GetObjectVersionAcl'
      ]

      //And a set of available actions
      mockExpandIamActions.mockImplementation(async (actions: string | string[]) => {
        if (actions == 's3:*') {
          return [
            's3:GetObjectTagging',
            's3:PutObjectTagging',
            's3:GetBucketTagging',
            's3:GetObjectVersionAcl',
            's3:GetObjectAcl',
            's3:GetObjectVersion'
          ]
        }

        return [
          's3:GetObjectTagging',
          's3:PutObjectTagging',
          's3:GetBucketTagging',
          's3:GetObjectVersionAcl'
        ]
      })

      //When shrink is called
      const result = await shrink(actions, { levels: [] })

      //Then we should get the reduced actions
      expect(result).toEqual(['s3:Get*VersionAcl', 's3:*Tagging'].sort())
    })

    it('should throw an error if the shrink does not validate', async () => {
      //Given a list of actions
      const actions = [
        's3:GetObjectTagging',
        's3:PutObjectTagging',
        's3:GetBucketTagging',
        's3:GetObjectVersionAcl'
      ]

      //And the validation fails
      mockValidateShrinkResults.mockResolvedValueOnce('Undesired action: s3:DeleteObject')

      //When shrink is called
      const result = shrink(actions, {})

      //Then we should get the reduced actions
      await expect(result).rejects.toThrow(
        /@cloud-copilot\/iam-shrink has failed validation and this is a bug\./
      )
    })

    it('should return an all actions wildcard if one is provided and all accessLevels are reducible', async () => {
      //Given a list of actions that includes a global wildcard
      const actions = ['*', 's3:GetObjectTagging', 's3:PutObjectTagging']

      //When shrink is called
      const result = await shrink(actions, {})

      //Then we should get back the single wildcard
      expect(result).toEqual(['*'])
    })

    it('should return an all actions wildcard if one is provided and all accessLevels are reducible', async () => {
      //Given a list of actions that includes a global wildcard
      const actions = ['*', 's3:GetObjectTagging', 's3:PutObjectTagging']

      mockIamActionDetails.mockImplementation(async (service: string, action: string) => {
        if (action.startsWith('Get')) {
          return { accessLevel: 'Read' }
        }
        return { accessLevel: 'Permissions management' } as any
      })

      //When shrink is called
      const result = await shrink(actions, { levels: ['read'] })

      //Then we should get back the single wildcard
      expect(result).toEqual(['*'])
    })

    it('should return an all actions wildcard if a string of multiple asterisks is included', async () => {
      //Given a list of actions that includes a global wildcard
      const actions = ['***', 's3:GetObjectTagging', 's3:PutObjectTagging']

      //When shrink is called
      const result = await shrink(actions)

      //Then we should get back the single wildcard
      expect(result).toEqual(['*'])
    })

    it('should only reduce actions for the specified access types', async () => {
      //Given a list of actions
      const actions = [
        's3:GetObjectTagging',
        's3:GetObject',
        's3:GetObjectVersionAcl',
        's3:GetObjectVersions',
        's3:PutObjectTagging',
        's3:PutObject',
        's3:PutObjectVersionAcl',
        's3:PutObjectVersions',
        's3:GetBucketTagging',
        's3:GetObjectVersionAcl',
        's3:ListAllMyBuckets',
        's3:ListBucket',
        's3:ListBucketVersions'
      ]

      mockIamActionDetails.mockImplementation(async (service: string, action: string) => {
        if (action.startsWith('Get')) {
          return { accessLevel: 'Read' }
        }
        if (action.startsWith('Put')) {
          return { accessLevel: 'Write' }
        }
        if (action.startsWith('List')) {
          return { accessLevel: 'List' }
        }
        return { accessLevel: 'other' } as any
      })

      //This makes everything in the list above valid
      mockExpandIamActions.mockImplementation(async (actions: string | string[]) => {
        return [actions].flat()
      })

      //When shrink is called with only Read access types
      const result = await shrink(actions, { levels: ['list', 'read'] })

      //Then we should get the reduced actions for Read and List access types
      expect(result).toEqual(
        [
          's3:Get*',
          's3:List*',
          's3:PutObject',
          's3:PutObjectTagging',
          's3:PutObjectVersionAcl',
          's3:PutObjectVersions'
        ].sort()
      )
    })

    it('should leave input wildcards from the original in place', async () => {
      //Given a list of actions with input wildcards
      const actions = [
        's3:GetObjectTagging',
        's3:PutObjectTagging',
        's3:GetBucketTagging',
        's3:GetObjectVersionAcl',
        's3:List*'
      ]

      //and the wildcard matches an action
      vi.mocked(matchesAnyAction).mockResolvedValue(true)

      //When shrink is called
      const result = await shrink(actions, { iterations: 1 })

      //Then we should get the reduced actions with input wildcards in place
      expect(result.sort()).toEqual(['s3:Get*', 's3:List*', 's3:PutObjectTagging'].sort())
    })

    it('should remove input wildcards that match no existing actions', async () => {
      //Given a list of actions with input wildcards that don't match any existing actions
      const actions = [
        's3:GetObjectTagging',
        's3:GetObject',
        's3:GetObjectVersionAcl',
        's3:GetObjectVersions',
        's3:PutObjectTagging',
        's3:PutObject',
        's3:PutObjectVersionAcl',
        's3:PutObjectVersions',
        's3:GetBucketTagging',
        's3:GetObjectVersionAcl',
        's3:ListAllMyBuckets',
        's3:ListBucket',
        's3:ListBucketVersions',
        's3:*NonExistent*'
      ]
      //and the wildcard matches no actions
      vi.mocked(matchesAnyAction).mockResolvedValue(false)
      mockExpandIamActions.mockImplementation(async (actions: string | string[]) => {
        return [actions].flat().filter((action) => action !== 's3:*NonExistent*')
      })

      //When shrink is called
      const result = await shrink(actions, { iterations: 1, levels: ['list', 'read'] })

      //Then we should get the reduced actions with input wildcards removed
      expect(result.sort()).toEqual(
        [
          's3:Get*',
          's3:ListAllMyBuckets',
          's3:ListBucket',
          's3:ListBucketVersions',
          's3:PutObject',
          's3:PutObjectTagging',
          's3:PutObjectVersionAcl',
          's3:PutObjectVersions'
        ].sort()
      )
    })

    it('should remove input wildcards that are redundant', async () => {
      //Given a list of actions with input wildcards
      const actions = [
        's3:GetObjectTagging',
        's3:PutObjectTagging',
        's3:GetBucketTagging',
        's3:GetObjectVersionAcl',
        's3:List*',
        's3:ListB*',
        's3:ListBu*',
        's3:ListBuc*',
        's3:ListBuck*',
        's3:ListBucke*',
        's3:ListBucket*'
      ]

      //and the wildcard matches an action
      vi.mocked(matchesAnyAction).mockResolvedValue(true)

      //When shrink is called
      const result = await shrink(actions, { iterations: 1 })

      //Then we should get the reduced actions with input wildcards in place
      expect(result.sort()).toEqual(['s3:Get*', 's3:List*', 's3:PutObjectTagging'].sort())
    })

    it('should consolidate duplicate wildcards, even if that level is ignored', async () => {
      //Given a list of actions with List wildcards
      const actions = [
        's3:GetObjectTagging',
        's3:PutObjectTagging',
        's3:GetBucketTagging',
        's3:GetObjectVersionAcl',
        's3:List*',
        's3:ListB*',
        's3:ListBu*',
        's3:ListBuc*',
        's3:ListBuck*',
        's3:ListBucke*',
        's3:ListBucket*'
      ]

      //and the wildcards match an action
      vi.mocked(matchesAnyAction).mockResolvedValue(true)
      mockExpandIamActions.mockImplementation(async (implActions: string | string[]) => {
        return [
          's3:GetObjectTagging',
          's3:PutObjectTagging',
          's3:GetBucketTagging',
          's3:GetObjectVersionAcl',
          's3:ListBucket'
        ]
      })
      mockIamActionDetails.mockImplementation(async (service: string, action: string) => {
        if (action.startsWith('Get')) {
          return { accessLevel: 'Read' }
        }
        if (action.startsWith('Put')) {
          return { accessLevel: 'Write' }
        }
        if (action.startsWith('List')) {
          return { accessLevel: 'List' }
        }
        return { accessLevel: 'other' } as any
      })

      //When shrink is called
      const result = await shrink(actions, { iterations: 1, levels: ['write'] })

      //Then we should get the reduced actions with existing input wildcards in place
      expect(result.sort()).toEqual(
        [
          's3:GetBucketTagging',
          's3:GetObjectTagging',
          's3:GetObjectVersionAcl',
          's3:List*',
          's3:Put*'
        ].sort()
      )
    })

    it('should leave input wildcards no matter how ugly', async () => {
      //Given a list of actions with input wildcards
      const actions = [
        's3:GetObjectTagging',
        's3:PutObjectTagging',
        's3:GetBucketTagging',
        's3:GetObjectVersionAcl',
        's3:List*',
        's3:*t*Object*',
        's3:CreateMultiRegionAccessPoint'
      ]

      //and the wildcard matches an action
      vi.mocked(matchesAnyAction).mockResolvedValue(true)

      mockExpandIamActions.mockImplementation(async (implActions: string | string[]) => {
        if (implActions == 's3:*') {
          return [...actions, 's3:CreateAccessGrantsInstance']
        }
        return actions
      })

      //When shrink is called
      const result = await shrink(actions, { iterations: 1 })

      //Then we should get the reduced actions with input wildcards in place
      expect(result.sort()).toEqual(
        ['s3:List*', 's3:*t*Object*', 's3:Create*Point', 's3:GetBucketTagging'].sort()
      )
    })
  })

  describe('isAllAccessLevels', () => {
    it('should return true if all access levels are reducible', async () => {
      //Given a list of all access levels
      const levels = new Set<ActionAccessLevel>(['read', 'write', 'list', 'permissions', 'tagging'])

      //When we check if all access levels are reducible
      const result = isAllAccessLevels(levels)

      //Then we should get true
      expect(result).toBe(true)
    })

    it('should return false if one is missing', async () => {
      //Given a list of all access levels
      const levels = new Set<ActionAccessLevel>(['read', 'write', 'list', 'permissions'])

      //When we check if all access levels are reducible
      const result = isAllAccessLevels(levels)

      //Then we should get true
      expect(result).toBe(false)
    })

    it('should return false if one is missing but a fake one is added', async () => {
      //Given a list of all access levels
      const levels = new Set<ActionAccessLevel>([
        'read',
        'write',
        'list',
        'permissions',
        'fake'
      ] as any)

      //When we check if all access levels are reducible
      const result = isAllAccessLevels(levels)

      //Then we should get true
      expect(result).toBe(false)
    })

    it('should return true all are present but there is an extra value', async () => {
      //Given a list of all access levels
      const levels = new Set<ActionAccessLevel>([
        'read',
        'write',
        'list',
        'permissions',
        'tagging',
        'fake'
      ] as any)

      //When we check if all access levels are reducible
      const result = isAllAccessLevels(levels)

      //Then we should get true
      expect(result).toBe(true)
    })
  })
})
