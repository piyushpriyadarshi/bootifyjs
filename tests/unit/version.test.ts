import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { VERSION } from '../../src/version'

describe('VERSION', () => {
  it('stays in sync with package.json', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
    expect(VERSION).toBe(pkg.version)
  })
})
