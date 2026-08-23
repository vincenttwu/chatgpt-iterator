import { ContractError, ERROR_CODES, createFailureResponse, createSuccessResponse, requireMessageEnvelope } from '../core/index.ts';
import type { RequestEnvelope } from '../core/envelope.ts';
import type { SettingsService } from '../settings/service.ts';
import { SETTINGS_RUNTIME_OPERATIONS } from '../settings/types.ts';

export type SettingsServiceProvider = () => Promise<SettingsService>;
export type SettingsChanged = (settings: Awaited<ReturnType<SettingsService['get']>>) => void | Promise<void>;

function requireRequest(raw: unknown): RequestEnvelope { const message=requireMessageEnvelope(raw); if(message.kind!=='request')throw new ContractError(ERROR_CODES.invalidMessage,'settings runtime accepts requests only'); if(message.target!=='background')throw new ContractError(ERROR_CODES.invalidMessage,'settings request target must be background'); return message; }

export class SettingsRuntimeServer {
  readonly #service: SettingsServiceProvider; readonly #changed: SettingsChanged|undefined;
  constructor(service: SettingsServiceProvider, changed?: SettingsChanged){this.#service=service;this.#changed=changed;}
  async handle(raw:unknown):Promise<unknown>{let request:RequestEnvelope|undefined;try{request=requireRequest(raw);if(request.source!=='sidepanel')throw new ContractError(ERROR_CODES.invalidMessage,'settings commands must originate from sidepanel');const service=await this.#service();const payload=request.payload as Record<string,unknown>;switch(request.operation){
    case SETTINGS_RUNTIME_OPERATIONS.get: if(request.intent!=='query')throw new ContractError(ERROR_CODES.invalidMessage,'settings.get must be a query'); return createSuccessResponse(request,await service.get());
    case SETTINGS_RUNTIME_OPERATIONS.update:{if(request.intent!=='command')throw new ContractError(ERROR_CODES.invalidMessage,'settings.update must be a command');const next=await service.update(payload.expectedRevision,payload);await this.#changed?.(next);return createSuccessResponse(request,next);}
    default: throw new ContractError(ERROR_CODES.unsupportedOperation,`Unsupported settings operation: ${request.operation}`);
  }}catch(error){if(request!==undefined)return createFailureResponse(request,error);throw error;}}
}
