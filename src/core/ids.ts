export type StableIdKind = 'message' | 'request' | 'event';
export type StableId<K extends StableIdKind = StableIdKind> = string & { readonly __stableIdKind: K };

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createStableId<K extends StableIdKind>(_kind: K): StableId<K> {
  return crypto.randomUUID() as StableId<K>;
}

export function isStableId<K extends StableIdKind>(value: unknown, _kind?: K): value is StableId<K> {
  return typeof value === 'string' && UUID_V4.test(value);
}

export function requireStableId<K extends StableIdKind>(value: unknown, kind: K): StableId<K> {
  if (!isStableId(value, kind)) throw new TypeError(`${kind} id must be a UUID v4`);
  return value;
}
