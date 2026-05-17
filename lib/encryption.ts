import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY = process.env.FLOOR_PRICE_KEY!

function getKey(): Buffer {
  if (!KEY || KEY.length !== 64) {
    throw new Error('FLOOR_PRICE_KEY must be a 64-character hex string')
  }
  return Buffer.from(KEY, 'hex')
}

export function encryptFloorPrice(price: number): string {
  const key = getKey()
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const plaintext = String(price)
  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const tag = cipher.getAuthTag().toString('hex')
  return `${iv.toString('hex')}:${tag}:${encrypted}`
}

export function decryptFloorPrice(enc: string): number {
  const key = getKey()
  const parts = enc.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted floor price format')
  const [ivHex, tagHex, encHex] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  let decrypted = decipher.update(encHex, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return parseFloat(decrypted)
}
