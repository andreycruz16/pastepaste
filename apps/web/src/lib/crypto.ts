export type EncryptedText = {
  ciphertext: string
  iv: string
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function toBase64(value: ArrayBuffer | Uint8Array<ArrayBufferLike>) {
  const bytes = value instanceof ArrayBuffer
    ? new Uint8Array(value)
    : new Uint8Array(value.buffer, value.byteOffset, value.byteLength)

  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
}

export async function deriveRoomKey(roomCode: string, salt: string) {
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(roomCode),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: fromBase64(salt),
      iterations: 120_000,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptText(key: CryptoKey, text: string): Promise<EncryptedText> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(text),
  )

  return { ciphertext: toBase64(ciphertext), iv: toBase64(iv) }
}

export async function decryptText(key: CryptoKey, value: EncryptedText) {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(value.iv) },
    key,
    fromBase64(value.ciphertext),
  )

  return decoder.decode(plaintext)
}
