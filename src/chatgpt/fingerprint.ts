export const ASSISTANT_FINGERPRINT_PREFIX = 'af2:' as const;

function hex32(value: number): string { return (value >>> 0).toString(16).padStart(8, '0'); }

function hash128(value: string): string {
  let h1 = 0xdeadbeef ^ value.length;
  let h2 = 0x41c6ce57 ^ value.length;
  let h3 = 0xc0decafe ^ value.length;
  let h4 = 0x9e3779b9 ^ value.length;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
    h3 = Math.imul(h3 ^ code, 2246822519);
    h4 = Math.imul(h4 ^ code, 3266489917);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h3 ^ (h3 >>> 13), 3266489909);
  h3 = Math.imul(h3 ^ (h3 >>> 16), 2246822507) ^ Math.imul(h4 ^ (h4 >>> 13), 3266489909);
  h4 = Math.imul(h4 ^ (h4 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${hex32(h1)}${hex32(h2)}${hex32(h3)}${hex32(h4)}`;
}

export function isAssistantFingerprint(value: unknown): value is string {
  return typeof value === 'string' && /^af2:[0-9a-f]{32}$/.test(value);
}

export function assistantFingerprintFromLegacySignature(value: string): string {
  if (isAssistantFingerprint(value)) return value;
  return `${ASSISTANT_FINGERPRINT_PREFIX}${hash128(value)}`;
}

export function createAssistantFingerprint(messageCount: number, normalizedLatestText: string): string {
  const legacyCanonical = messageCount === 0 ? '0:' : `${messageCount}:${normalizedLatestText.length}:${normalizedLatestText.slice(-240)}`;
  return assistantFingerprintFromLegacySignature(legacyCanonical);
}
