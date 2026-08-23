import type { JsonObject, JsonValue } from './types.ts';

export class JsonContractError extends TypeError {}

export function assertJsonSafe(value: unknown, path = '$'): asserts value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new JsonContractError(`${path} must be a finite JSON number`);
    return;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) assertJsonSafe(value[index], `${path}[${index}]`);
    return;
  }
  if (typeof value !== 'object') throw new JsonContractError(`${path} is not JSON-safe`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new JsonContractError(`${path} must be a plain JSON object`);
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (child === undefined) throw new JsonContractError(`${path}.${key} must not be undefined`);
    assertJsonSafe(child, `${path}.${key}`);
  }
}

export function cloneJsonValue<T extends JsonValue>(value: T): T {
  assertJsonSafe(value);
  return structuredClone(value);
}

export function freezeJsonValue<T extends JsonValue>(value: T): T {
  assertJsonSafe(value);
  if (Array.isArray(value)) {
    for (const child of value) freezeJsonValue(child);
  } else if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value as JsonObject)) {
      if (child !== undefined) freezeJsonValue(child);
    }
  }
  return Object.freeze(value);
}
