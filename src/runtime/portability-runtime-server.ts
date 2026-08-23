import { ContractError, ERROR_CODES, createFailureResponse, createSuccessResponse, requireMessageEnvelope, type RequestEnvelope } from '../core/index.ts';
import type { JsonObject } from '../core/types.ts';
import type { PortabilityService } from '../portability/service.ts';
import { PORTABILITY_RUNTIME_OPERATIONS } from '../portability/types.ts';

export type PortabilityServiceProvider=()=>Promise<PortabilityService>;
function request(raw:unknown):RequestEnvelope{const m=requireMessageEnvelope(raw);if(m.kind!=='request'||m.source!=='sidepanel'||m.target!=='background')throw new ContractError(ERROR_CODES.invalidMessage,'portability requests must originate from sidepanel and target background');return m;}
function only(p:JsonObject,allowed:readonly string[]):void{for(const key of Object.keys(p))if(!allowed.includes(key))throw new ContractError(ERROR_CODES.invalidMessage,`unexpected portability payload field: ${key}`);}
export class PortabilityRuntimeServer{
  readonly #service:PortabilityServiceProvider;readonly #changed:(()=>void)|undefined;
  constructor(service:PortabilityServiceProvider,changed?:()=>void){this.#service=service;this.#changed=changed;}
  async handle(raw:unknown):Promise<unknown>{let req:RequestEnvelope|undefined;try{req=request(raw);const p=req.payload;const s=await this.#service();switch(req.operation){
    case PORTABILITY_RUNTIME_OPERATIONS.export: if(req.intent!=='query')throw new ContractError(ERROR_CODES.invalidMessage,'portability.export must be a query');only(p,['kind']);if(p.kind!=='configuration'&&p.kind!=='full_backup')throw new ContractError(ERROR_CODES.invalidMessage,'kind must be configuration|full_backup');return createSuccessResponse(req,await s.export(p.kind));
    case PORTABILITY_RUNTIME_OPERATIONS.preview: if(req.intent!=='query')throw new ContractError(ERROR_CODES.invalidMessage,'portability.preview must be a query');only(p,['envelope','mode']);return createSuccessResponse(req,await s.preview(p.envelope,p.mode));
    case PORTABILITY_RUNTIME_OPERATIONS.apply: if(req.intent!=='command')throw new ContractError(ERROR_CODES.invalidMessage,'portability.apply must be a command');only(p,['envelope','mode','planFingerprint']);{const result=await s.apply(p.envelope,p.mode,p.planFingerprint);this.#changed?.();return createSuccessResponse(req,result);}
    default:throw new ContractError(ERROR_CODES.unsupportedOperation,`Unsupported portability operation: ${req.operation}`);
  }}catch(error){if(req!==undefined)return createFailureResponse(req,error);throw error;}}
}
