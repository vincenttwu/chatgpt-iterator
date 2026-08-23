import { ContractError, ERROR_CODES, createFailureResponse, createSuccessResponse, requireMessageEnvelope } from '../core/index.ts';
import type { RequestEnvelope } from '../core/envelope.ts';
import type { RunHistoryService } from '../history/service.ts';
import { HISTORY_RUNTIME_OPERATIONS } from '../history/types.ts';
import type { SettingsService } from '../settings/service.ts';

export type HistoryServiceProvider = () => Promise<RunHistoryService>;
export type HistorySettingsProvider = () => Promise<SettingsService>;

function requireRequest(raw: unknown): RequestEnvelope { const message=requireMessageEnvelope(raw); if(message.kind!=='request')throw new ContractError(ERROR_CODES.invalidMessage,'history runtime accepts requests only'); if(message.target!=='background')throw new ContractError(ERROR_CODES.invalidMessage,'history request target must be background'); return message; }

export class HistoryRuntimeServer {
  readonly #history:HistoryServiceProvider;readonly #settings:HistorySettingsProvider;readonly #changed:(()=>void)|undefined;
  constructor(history:HistoryServiceProvider,settings:HistorySettingsProvider,changed?:()=>void){this.#history=history;this.#settings=settings;this.#changed=changed;}
  async handle(raw:unknown):Promise<unknown>{let request:RequestEnvelope|undefined;try{request=requireRequest(raw);if(request.source!=='sidepanel')throw new ContractError(ERROR_CODES.invalidMessage,'history commands must originate from sidepanel');switch(request.operation){
    case HISTORY_RUNTIME_OPERATIONS.list:{if(request.intent!=='query')throw new ContractError(ERROR_CODES.invalidMessage,'history.list must be a query');const settings=await (await this.#settings()).get();return createSuccessResponse(request,await (await this.#history()).list(settings.historyLimit));}
    case HISTORY_RUNTIME_OPERATIONS.clear:{if(request.intent!=='command')throw new ContractError(ERROR_CODES.invalidMessage,'history.clear must be a command');const result=await (await this.#history()).clear();this.#changed?.();return createSuccessResponse(request,result);}
    default:throw new ContractError(ERROR_CODES.unsupportedOperation,`Unsupported history operation: ${request.operation}`);
  }}catch(error){if(request!==undefined)return createFailureResponse(request,error);throw error;}}
}
