const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface AesEncryptedPayload {
  __encrypted__: true;
  v: 1;
  alg: 'AES-GCM';
  iv: string; // base64
  salt: string; // base64
  ciphertext: string; // base64
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const passBytes = encoder.encode(password);
  const baseKey = await crypto.subtle.importKey(
    'raw',
    passBytes,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  const saltBuffer = salt.buffer as ArrayBuffer;

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export function isAesEncryptedPayload(value: any): value is AesEncryptedPayload {
  return (
    !!value &&
    value.__encrypted__ === true &&
    value.v === 1 &&
    value.alg === 'AES-GCM' &&
    typeof value.iv === 'string' &&
    typeof value.salt === 'string' &&
    typeof value.ciphertext === 'string'
  );
}

export async function encryptStringWithPassword(plaintext: string, password: string): Promise<AesEncryptedPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const key = await deriveKey(password, salt);
  const data = encoder.encode(plaintext);

  const cipherBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    data
  );

  return {
    __encrypted__: true,
    v: 1,
    alg: 'AES-GCM',
    iv: toBase64(iv.buffer),
    salt: toBase64(salt.buffer),
    ciphertext: toBase64(cipherBuffer),
  };
}

export async function decryptStringWithPassword(payload: AesEncryptedPayload, password: string): Promise<string> {
  const saltBytes = new Uint8Array(fromBase64(payload.salt));
  const ivBytes = new Uint8Array(fromBase64(payload.iv));
  const cipherBytes = new Uint8Array(fromBase64(payload.ciphertext));

  const key = await deriveKey(password, saltBytes);

  const plainBuffer = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: ivBytes,
    },
    key,
    cipherBytes
  );

  return decoder.decode(plainBuffer);
}
