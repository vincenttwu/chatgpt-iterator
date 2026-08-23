import { ContractError, ERROR_CODES, createRequest, requireMessageEnvelope } from '../core/index.ts';
import type { JsonObject, MessageIntent } from '../core/types.ts';
import { PORTABILITY_RUNTIME_OPERATIONS, PORTABLE_FORMAT_VERSION, PORTABLE_PRODUCT, PORTABLE_SCHEMA_VERSION, type ImportApplyResult, type ImportMode, type ImportPreview, type PortableEnvelope, type PortableKind } from '../portability/types.ts';
import { requirePortableEnvelope } from '../portability/model.ts';

export interface PortabilityRuntimeLike { sendMessage(message: unknown): Promise<unknown>; }
function preview(value:unknown):ImportPreview{if(value===null||Array.isArray(value)||typeof value!=='object'||(value as Record<string,unknown>).schemaVersion!==PORTABLE_SCHEMA_VERSION)throw new ContractError(ERROR_CODES.invalidMessage,'invalid import preview');return value as ImportPreview;}
function applied(value:unknown):ImportApplyResult{if(value===null||Array.isArray(value)||typeof value!=='object'||(value as Record<string,unknown>).schemaVersion!==PORTABLE_SCHEMA_VERSION)throw new ContractError(ERROR_CODES.invalidMessage,'invalid import result');return value as ImportApplyResult;}
export function parsePortableJson(text:string,maxBytes=5_000_000):PortableEnvelope{if(new TextEncoder().encode(text).byteLength>maxBytes)throw new ContractError(ERROR_CODES.invalidMessage,'portable file exceeds 5 MB');let raw:unknown;try{raw=JSON.parse(text);}catch{throw new ContractError(ERROR_CODES.invalidMessage,'portable file is not valid JSON');}return requirePortableEnvelope(raw);}
export function portableFilename(envelope:PortableEnvelope):string{const stamp=envelope.exportedAt.replace(/[:.]/g,'-');return `chatgpt-iterator-${envelope.kind}-${stamp}.json`;}
export class SidePanelPortabilityClient{
  readonly #runtime:PortabilityRuntimeLike;#seq=0;constructor(runtime:PortabilityRuntimeLike){this.#runtime=runtime;}
  async #request(intent:MessageIntent,operation:string,payload:JsonObject):Promise<unknown>{const req=createRequest({requestSequence:++this.#seq,intent,source:'sidepanel',target:'background',operation,payload});const res=requireMessageEnvelope(await this.#runtime.sendMessage(req));if(res.kind!=='response'||res.requestId!==req.requestId||res.requestSequence!==req.requestSequence||res.operation!==operation)throw new ContractError(ERROR_CODES.invalidMessage,'portability response correlation failed');if(!res.outcome.ok)throw new ContractError(res.outcome.error.code,res.outcome.error.message,res.outcome.error.details);return res.outcome.value;}
  async export(kind:PortableKind):Promise<PortableEnvelope>{return requirePortableEnvelope(await this.#request('query',PORTABILITY_RUNTIME_OPERATIONS.export,{kind}));}
  async preview(envelope:PortableEnvelope,mode:ImportMode):Promise<ImportPreview>{return preview(await this.#request('query',PORTABILITY_RUNTIME_OPERATIONS.preview,{envelope,mode}));}
  async apply(envelope:PortableEnvelope,mode:ImportMode,planFingerprint:string):Promise<ImportApplyResult>{return applied(await this.#request('command',PORTABILITY_RUNTIME_OPERATIONS.apply,{envelope,mode,planFingerprint}));}
}
export const PORTABLE_FILE_CONTRACT=Object.freeze({product:PORTABLE_PRODUCT,formatVersion:PORTABLE_FORMAT_VERSION,maxBytes:5_000_000});
