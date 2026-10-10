import {
  ExternalActionType,
  ValidatedActionContext,
  ExternalActionStatusCheck,
} from '../external-action-gateway.types';

export interface AdapterExecutionResult {
  success: boolean;
  externalReferenceId?: string;
  provider: string;
  resultPayload?: any;
  errorMessage?: string;
  statusUnknown?: boolean; // When provider reports uncertain state
}

export interface ExternalActionAdapter {
  readonly providerName: string;
  supports(actionType: ExternalActionType): boolean;
  execute(context: ValidatedActionContext): Promise<AdapterExecutionResult>;
  checkStatus?(externalReferenceId: string): Promise<ExternalActionStatusCheck>;
}
