export type {
  LoginInput,
  RegisterInput,
  Verify2FAInput,
} from '../schemas/auth.schema';

export type {
  CreateAgencyInput,
  UpdateAgencyInput,
} from '../schemas/agency.schema';

export type {
  CreateClientInput,
  UpdateClientInput,
} from '../schemas/client.schema';

export type {
  CreateParcelInput,
  UpdateParcelInput,
} from '../schemas/parcel.schema';

export type {
  CreateContainerInput,
  UpdateContainerInput,
  LoadParcelInput,
  LoadParcelsInput,
} from '../schemas/container.schema';

export type {
  RecordPaymentInput,
  VoidPaymentInput,
} from '../schemas/payment.schema';

export type {
  CreateDisbursementInput,
  VoidDisbursementInput,
} from '../schemas/disbursement.schema';

export type {
  CreateFundTransferInput,
  ConfirmFundTransferInput,
  VoidFundTransferInput,
} from '../schemas/fund-transfer.schema';

export type {
  CreateHeadOfficeDisbursementInput,
  VoidHeadOfficeDisbursementInput,
  PayEmployeeFromHeadOfficeInput,
} from '../schemas/head-office.schema';

export type {
  PaginationInput,
  IdParam,
  DateRangeInput,
  PaginatedResponse,
} from '../schemas/common.schema';

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: Record<string, string[]>;
}

// JWT Payload
export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  agencyIds: string[];
  // Phase 0.2 : isolation multi-tenant. Toutes les requetes filtrent par cet ID.
  organizationId: string;
  // Phase 1 RH/ABAC : permissions effectives (poste + overrides). Vide pour
  // SUPER_ADMIN (qui contourne le check). Les middlewares utilisent
  // requirePermission() pour valider.
  permissions?: string[];
  // Étape 7 ABAC : version des permissions au moment de l'emission du token.
  // Le middleware rejette le token si la valeur DB a change (-> 401 -> refresh).
  pv?: number;
  iat?: number;
  exp?: number;
}

// Étape 3 ABAC : reference masquee retournee par le backend quand le caller
// n'a pas la permission requise (redact: 'ref'). Le front utilise isMasked()
// pour afficher "Acces restreint" via le composant MaskedValue.
export interface MaskedRef {
  id?: string | null;
  masked: true;
}

export function isMasked(value: unknown): value is MaskedRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as MaskedRef).masked === true
  );
}

// Socket events
export interface SocketEvents {
  'parcel:statusChanged': { parcelId: string; oldStatus: string; newStatus: string };
  'container:statusChanged': { containerId: string; oldStatus: string; newStatus: string };
  'notification:new': { id: string; title: string; message: string; type: string };
  'chat:message': { conversationId: string; message: string; senderId: string; senderType: string };
  'cashRegister:updated': { agencyId: string; balance: string };
  'dashboard:metrics': Record<string, unknown>;
}
