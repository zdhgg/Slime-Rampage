import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
export const SESSION_COOKIE = 'slime_session'

export function normalizeUsername(value) {
  return String(value || '').trim().normalize('NFKC').toLocaleLowerCase('en-US')
}

export function validateCredentials(username, password) {
  const normalized = normalizeUsername(username)
  if (!/^[\p{L}\p{N}_-]{3,20}$/u.test(normalized)) {
    return { error: '账号名需为 3-20 位文字、数字、下划线或连字符' }
  }
  if (typeof password !== 'string' || password.length < 6 || password.length > 72) {
    return { error: '密码需为 6-72 个字符' }
  }
  return { username: normalized, displayName: String(username).trim().normalize('NFKC') }
}

export async function hashPassword(password, saltHex = randomBytes(16).toString('hex')) {
  const derived = await scrypt(password, Buffer.from(saltHex, 'hex'), 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  })
  return { salt: saltHex, hash: Buffer.from(derived).toString('hex') }
}

export async function verifyPassword(password, saltHex, expectedHex) {
  const { hash } = await hashPassword(password, saltHex)
  const actual = Buffer.from(hash, 'hex')
  const expected = Buffer.from(expectedHex, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function createSessionToken() {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token) {
  return createHash('sha256').update(String(token || '')).digest('hex')
}

export function parseCookies(header = '') {
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=')
        if (index < 0) return [part, '']
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))]
      })
  )
}

export function sessionCookie(token, maxAgeSeconds, secure = false) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}
