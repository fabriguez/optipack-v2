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
  iat?: number;
  exp?: number;
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
