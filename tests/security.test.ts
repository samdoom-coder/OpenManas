import { describe, it, expect } from 'vitest'
import { sanitizeFilename, validateFileInput, MAX_BLOCK_CONTENT, MAX_COMMENT_CONTENT } from '../server/security'

describe('sanitizeFilename', () => {
  it('strips directories and path traversal', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd')
    expect(sanitizeFilename('C:\\temp\\evil.exe')).toBe('evil.exe')
    expect(sanitizeFilename('/abs/path/doc.pdf')).toBe('doc.pdf')
  })
  it('rejects empty / dot names', () => {
    expect(sanitizeFilename('')).toBe('')
    expect(sanitizeFilename('..')).toBe('')
    expect(sanitizeFilename('.')).toBe('')
    expect(sanitizeFilename(null)).toBe('')
  })
  it('trims and caps length', () => {
    expect(sanitizeFilename('  photo.png  ')).toBe('photo.png')
    expect(sanitizeFilename('a'.repeat(500)).length).toBeLessThanOrEqual(255)
  })
})

describe('validateFileInput', () => {
  it('accepts a normal file', () => {
    expect(validateFileInput({ filename: 'photo.png', mimeType: 'image/png', size: 1024 })).toBeNull()
  })
  it('defaults missing mime/size', () => {
    expect(validateFileInput({ filename: 'notes.txt' })).toBeNull()
  })
  it('requires a filename', () => {
    expect(validateFileInput({})).toMatch(/filename/)
    expect(validateFileInput({ filename: '  ' })).toMatch(/filename/)
  })
  it('rejects oversized files', () => {
    expect(validateFileInput({ filename: 'big.zip', size: Number.MAX_SAFE_INTEGER })).toMatch(/too large/)
  })
  it('rejects negative / non-integer sizes', () => {
    expect(validateFileInput({ filename: 'a.bin', size: -1 })).toMatch(/size/)
    expect(validateFileInput({ filename: 'a.bin', size: 1.5 })).toMatch(/size/)
  })
  it('blocks scriptable mime types', () => {
    expect(validateFileInput({ filename: 'x.html', mimeType: 'text/html' })).toMatch(/not allowed/)
    expect(validateFileInput({ filename: 'x.js', mimeType: 'application/javascript' })).toMatch(/not allowed/)
  })
  it('rejects malformed mime types', () => {
    expect(validateFileInput({ filename: 'x', mimeType: 'not-a-mime' })).toMatch(/mimeType/)
  })
})

describe('input caps', () => {
  it('caps are positive sane bounds', () => {
    expect(MAX_BLOCK_CONTENT).toBeGreaterThan(10_000)
    expect(MAX_COMMENT_CONTENT).toBeGreaterThan(1_000)
  })
})
