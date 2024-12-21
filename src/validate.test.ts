import { expandIamActions } from '@cloud-copilot/iam-expand'
import { describe, expect, it, vi } from 'vitest'
import { validateShrinkResults } from './validate.js'
vi.mock('@cloud-copilot/iam-expand')

const mockExpandIamActions = vi.mocked(expandIamActions)

describe('validate', () => {
  it('should return nothing if the actions are valid', async () => {
    // Given a list of desired actions
    const desiredActions = ['s3:GetObject', 's3:PutObject', 's3:DeleteObject']
    // And a list of patterns
    const patterns = ['s3:*Object']
    // And the patterns include an undesired action
    mockExpandIamActions.mockResolvedValue(['s3:GetObject', 's3:PutObject', 's3:DeleteObject'])

    // When the patterns are validated
    const result = await validateShrinkResults(desiredActions, patterns)

    // Then the validation should fail
    expect(result).toBeUndefined()
  })

  it('should find an undesired action', async () => {
    // Given a list of desired actions
    const desiredActions = ['s3:GetObject', 's3:PutObject']
    // And a list of patterns
    const patterns = ['s3:*Object']
    // And the patterns include an undesired action
    mockExpandIamActions.mockResolvedValue(['s3:GetObject', 's3:PutObject', 's3:DeleteObject'])

    // When the patterns are validated
    const result = await validateShrinkResults(desiredActions, patterns)

    // Then the validation should fail
    expect(result).toEqual('Undesired action: s3:DeleteObject')
  })

  it('should find a missing action', async () => {
    // Given a list of desired actions
    const desiredActions = ['s3:GetObject', 's3:PutObject']
    // And a list of patterns
    const patterns = ['s3:Get*']
    // And the patterns are missing an action
    mockExpandIamActions.mockResolvedValue(['s3:GetObject'])

    // When the patterns are validated
    const result = await validateShrinkResults(desiredActions, patterns)

    // Then the validation should fail
    expect(result).toEqual('Missing action s3:PutObject')
  })
})
