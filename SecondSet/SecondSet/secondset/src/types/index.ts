import { UserRole, ChainType, RequestStatus } from '@prisma/client';

export type { UserRole, ChainType, RequestStatus };

export interface CreateOrganizationInput {
  name: string;
}

export interface CreateUserInput {
  email: string;
  name?: string;
  password: string;
  roles: UserRole[];
}

export interface CreatePayeeInput {
  chain: ChainType;
  address: string;
  name: string;
  contactEmail?: string;
  notes?: string;
}

export interface CreateRequestInput {
  vaultId: string;
  payeeId: string;
  amountMinor: string;
  memo?: string;
}