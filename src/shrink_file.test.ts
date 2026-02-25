import { beforeEach } from 'node:test'
import { describe, expect, it, vi } from 'vitest'
import { shrink } from './shrink.js'
import { shrinkJsonDocument } from './shrink_file.js'

vi.mock('./shrink.js')

// const mockShrink =

beforeEach(() => {
  vi.resetAllMocks()
})

describe('shrinkJsonDocument', () => {
  it('shrinks an array of Action', async () => {
    //Given a JSON document with an array of actions
    const document = {
      Action: ['s3:GetObject', 's3:PutObject']
    }
    //And a new array of actions is returned
    vi.mocked(shrink).mockResolvedValue(['s3:*'])

    //When shrinkJsonDocument is called
    const result = await shrinkJsonDocument({}, document)

    expect(result).toEqual({
      Action: ['s3:*']
    })
  })

  it('shrinks an array of NotAction nested in the document', async () => {
    //Given an object with an array of NotAction nested in the document
    const document = {
      statements: [
        {
          Resource: 'arn:aws:s3:::my_bucket',
          NotAction: ['s3:GetObject', 's3:PutObject']
        }
      ]
    }
    //And a new array of actions is returned
    vi.mocked(shrink).mockResolvedValue(['s3:*'])

    //When shrinkJsonDocument is called
    const result = await shrinkJsonDocument({}, document)

    //Then the NotAction array is replaced with the new array
    expect(result).toEqual({
      statements: [
        {
          Resource: 'arn:aws:s3:::my_bucket',
          NotAction: ['s3:*']
        }
      ]
    })
  })

  it('does not shrink an array of Action if it is a single string', async () => {
    //Given a JSON document with a string for Action
    const document = {
      Action: 's3:GetObject'
    }

    //When shrinkJsonDocument is called
    const result = await shrinkJsonDocument({}, document)

    //Then the document is returned unchanged
    expect(result).toEqual({
      Action: 's3:GetObject'
    })
  })

  it('Should remove SIDs when requested', async () => {
    //Given a JSON document with SIDs
    const document = {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'AllowS3Read',
          Action: ['s3:GetObject'],
          Resource: 'arn:aws:s3:::my_bucket'
        }
      ]
    }

    //And a new array of actions is returned
    vi.mocked(shrink).mockResolvedValue(['s3:*'])

    //When shrinkJsonDocument is called with removeSids option
    const result = await shrinkJsonDocument({ removeSids: true }, document)

    //Then the SIDs are removed from the document
    expect(result).toEqual({
      Version: '2012-10-17',
      Statement: [
        {
          Action: ['s3:*'],
          Resource: 'arn:aws:s3:::my_bucket'
        }
      ]
    })
  })

  it('should leave sids in place when removeSids is false', async () => {
    //Given a JSON document with SIDs
    const document = {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'AllowS3Read',
          Action: ['s3:GetObject'],
          Resource: 'arn:aws:s3:::my_bucket'
        }
      ]
    }

    //And a new array of actions is returned
    vi.mocked(shrink).mockResolvedValue(['s3:*'])

    //When shrinkJsonDocument is called without removeSids option
    const result = await shrinkJsonDocument({}, document)

    //Then the SIDs are left in place
    expect(result).toEqual({
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'AllowS3Read',
          Action: ['s3:*'],
          Resource: 'arn:aws:s3:::my_bucket'
        }
      ]
    })
  })
})
