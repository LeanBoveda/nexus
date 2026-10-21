export function randomSecret() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
}

export async function digest(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
}

export async function equalSecret(a: string, b: string) {
  const [left, right] = await Promise.all([digest(a), digest(b)]);
  let different = 0;
  for (let i = 0; i < left.length; i++) different |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return different === 0;
}

async function encryptionKey(secret: string) {
  if (!/^[a-f0-9]{64}$/.test(secret)) throw new Error('Missing email encryption key');
  return crypto.subtle.importKey('raw', Uint8Array.from(secret.match(/../g)!, x => parseInt(x, 16)), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function seal(value: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(secret), new TextEncoder().encode(value)));
  return btoa(String.fromCharCode(...iv, ...data));
}

export async function unseal(value: string, secret: string) {
  const bytes = Uint8Array.from(atob(value), x => x.charCodeAt(0));
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, await encryptionKey(secret), bytes.slice(12)));
}
