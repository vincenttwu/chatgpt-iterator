import { ContractError, ERROR_CODES, createFailureResponse, createSuccessResponse, requireMessageEnvelope } from '../core/index.ts';
import type { RequestEnvelope } from '../core/envelope.ts';
import type { DiagnosticsService } from '../diagnostics/service.ts';
import { DIAGNOSTICS_RUNTIME_OPERATIONS } from '../diagnostics/types.ts';

export type DiagnosticsServiceProvider = () => Promise<DiagnosticsService>;
function requireRequest(raw: unknown): RequestEnvelope { const message=requireMessageEnvelope(raw); if(message.kind!=='request')throw new ContractError(ERROR_CODES.invalidMessage,'diagnostics runtime accepts requests only'); if(message.target!=='background')throw new ContractError(ERROR_CODES.invalidMessage,'diagnostics request target must be background'); return message; }
export class DiagnosticsRuntimeServer {
  readonly #service:DiagnosticsServiceProvider; constructor(service:DiagnosticsServiceProvider){this.#service=service;}
  async handle(raw:unknown):Promise<unknown>{let request:RequestEnvelope|undefined;try{request=requireRequest(raw);if(request.source!=='sidepanel')throw new ContractError(ERROR_CODES.invalidMessage,'diagnostics query must originate from sidepanel');if(request.operation!==DIAGNOSTICS_RUNTIME_OPERATIONS.get)throw new ContractError(ERROR_CODES.unsupportedOperation,`Unsupported diagnostics operation: ${request.operation}`);if(request.intent!=='query')throw new ContractError(ERROR_CODES.invalidMessage,'diagnostics.get must be a query');return createSuccessResponse(request,await (await this.#service()).snapshot());}catch(error){if(request!==undefined)return createFailureResponse(request,error);throw error;}}
}
