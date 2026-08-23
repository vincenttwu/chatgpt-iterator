export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject { readonly [key: string]: JsonValue | undefined; }

export type RuntimeContext = 'sidepanel' | 'background' | 'content';
export type MessageIntent = 'query' | 'command';
