import { ContractError, ERROR_CODES, createFailureResponse, createSuccessResponse, requireMessageEnvelope } from '../core/index.ts';
import type { ControlPlaneAuthority } from './authority.ts';
import { CONTROL_PLANE_OPERATIONS } from './types.ts';

export class ControlPlaneServer {
  readonly #authority: ControlPlaneAuthority;

  constructor(authority: ControlPlaneAuthority) { this.#authority = authority; }

  async handle(message: unknown): Promise<unknown> {
    let request;
    try {
      const envelope = requireMessageEnvelope(message);
      if (envelope.kind !== 'request') throw new ContractError(ERROR_CODES.invalidMessage, 'background accepts request envelopes only');
      if (envelope.source !== 'sidepanel' || envelope.target !== 'background') {
        throw new ContractError(ERROR_CODES.invalidMessage, 'panel control request has invalid source/target');
      }
      request = envelope;
      if (request.operation !== CONTROL_PLANE_OPERATIONS.hydrate || request.intent !== 'query') {
        throw new ContractError(ERROR_CODES.unsupportedOperation, `Unsupported operation: ${request.operation}`);
      }
      return createSuccessResponse(request, this.#authority.snapshot(request.requestSequence));
    } catch (error) {
      if (request !== undefined) return createFailureResponse(request, error);
      throw error;
    }
  }
}
