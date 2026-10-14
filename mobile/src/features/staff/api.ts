// Espace « Administration » : types et appels de l'API réservée à l'équipe (/api/backoffice/).
import { apiRequest } from '@/services/api';
import type {
  ChecklistItem,
  DocumentSide,
  IdentityChecklistItem,
  IdentityStatus,
  Paginated,
  ShipmentEvent,
  ShipmentStatus,
  Vehicle,
  VerificationStatus,
} from '@/types/api';

export type Dashboard = {
  drivers_pending: number;
  identities_pending: number;
  documents_pending: number;
  reports_open: number;
  shipments_disputed: number;
  users_total: number;
  drivers_total: number;
  clients_total: number;
  new_users_7d: number;
  cargos_published: number;
  shipments_active: number;
  shipments_completed: number;
};

export type Decision = { status: 'verified' | 'rejected'; reason?: string };

export type AdminDriver = {
  id: string;
  name: string;
  phone: string;
  avatar: string | null;
  company_name: string;
  verification_status: VerificationStatus;
  progress: { verified: number; pending: number; total: number };
  created_at: string;
};

export type AdminDriverDocument = {
  id: string;
  doc_type: string;
  doc_type_label: string;
  side: DocumentSide;
  vehicle_label: string;
  document_number: string;
  holder_name: string;
  issuer: string;
  expires_on: string | null;
  covers_goods: boolean | null;
  data_source: string;
  status: VerificationStatus;
  review_note: string;
  is_expired: boolean;
  file_url: string;
  created_at: string;
};

export type AdminDriverDetail = AdminDriver & {
  user_id: string;
  email: string;
  phone_verified: boolean;
  is_active: boolean;
  rejection_reason: string;
  vehicles: Vehicle[];
  documents: AdminDriverDocument[];
  checklist: ChecklistItem[];
  events: { id: string; status: VerificationStatus; reason: string; decided_by: string; document: string; created_at: string }[];
};

export type AdminIdentity = {
  id: string;
  name: string;
  phone: string;
  avatar: string | null;
  account_type: 'individual' | 'company';
  cin_number: string;
  company_name: string;
  ice: string;
  verification_status: VerificationStatus;
  status: IdentityStatus;
  created_at: string;
};

export type AdminClientDocument = {
  id: string;
  doc_type: string;
  doc_type_label: string;
  side: DocumentSide;
  status: VerificationStatus;
  review_note: string;
  file_url: string;
  created_at: string;
};

export type AdminIdentityDetail = AdminIdentity & {
  user_id: string;
  email: string;
  is_active: boolean;
  rejection_reason: string;
  documents: AdminClientDocument[];
  checklist: IdentityChecklistItem[];
};

export type AdminUser = {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  avatar: string | null;
  role: 'client' | 'driver' | 'staff';
  verification: string;
  driver_id: string | null;
  identity_id: string | null;
  phone_verified: boolean;
  is_active: boolean;
  is_staff: boolean;
  date_joined: string;
};

export type AdminCargo = {
  id: string;
  title: string;
  client: string;
  origin: string;
  destination: string;
  loading_date: string;
  weight_kg: string;
  proposed_price: string | null;
  declared_value: string | null;
  status: string;
  status_label: string;
  offers_count: number;
  shipment_id: string | null;
  created_at: string;
};

export type AdminShipment = {
  id: string;
  title: string;
  origin: string;
  destination: string;
  client: string;
  driver: string;
  status: ShipmentStatus;
  status_label: string;
  agreed_price: string;
  currency: string;
  confirmed_at: string;
};

export type AdminShipmentDetail = AdminShipment & {
  client_phone: string;
  driver_phone: string;
  vehicle: Vehicle | null;
  origin_address: string;
  destination_address: string;
  declared_value: string | null;
  recipient_name: string;
  recipient_phone: string;
  events: ShipmentEvent[];
};

export type ReportStatus = 'open' | 'in_review' | 'resolved' | 'dismissed';

export type AdminReport = {
  id: string;
  reason: string;
  reason_label: string;
  description: string;
  status: ReportStatus;
  status_label: string;
  admin_note: string;
  reporter: string;
  reporter_phone: string;
  reported_user: string;
  cargo: string | null;
  cargo_title: string;
  shipment: string | null;
  created_at: string;
};

type ListQuery = { status?: string; search?: string; role?: string; page?: number };

const B = '/backoffice';

export const adminApi = {
  dashboard: () => apiRequest<Dashboard>(`${B}/dashboard/`),

  drivers: (query: ListQuery) => apiRequest<Paginated<AdminDriver>>(`${B}/drivers/`, { query }),
  driver: (id: string) => apiRequest<AdminDriverDetail>(`${B}/drivers/${id}/`),
  decideDriver: (id: string, body: Decision) => apiRequest<AdminDriverDetail>(`${B}/drivers/${id}/decision/`, { method: 'POST', body }),
  decideDriverDocument: (id: string, body: Decision) =>
    apiRequest<AdminDriverDocument>(`${B}/driver-documents/${id}/decision/`, { method: 'POST', body }),

  identities: (query: ListQuery) => apiRequest<Paginated<AdminIdentity>>(`${B}/identities/`, { query }),
  identity: (id: string) => apiRequest<AdminIdentityDetail>(`${B}/identities/${id}/`),
  decideIdentity: (id: string, body: Decision) =>
    apiRequest<AdminIdentityDetail>(`${B}/identities/${id}/decision/`, { method: 'POST', body }),
  decideClientDocument: (id: string, body: Decision) =>
    apiRequest<AdminClientDocument>(`${B}/client-documents/${id}/decision/`, { method: 'POST', body }),

  users: (query: ListQuery) => apiRequest<Paginated<AdminUser>>(`${B}/users/`, { query }),
  setUserActive: (id: string, is_active: boolean) =>
    apiRequest<AdminUser>(`${B}/users/${id}/activation/`, { method: 'POST', body: { is_active } }),

  cargos: (query: ListQuery) => apiRequest<Paginated<AdminCargo>>(`${B}/cargos/`, { query }),
  shipments: (query: ListQuery) => apiRequest<Paginated<AdminShipment>>(`${B}/shipments/`, { query }),
  shipment: (id: string) => apiRequest<AdminShipmentDetail>(`${B}/shipments/${id}/`),

  reports: (query: ListQuery) => apiRequest<Paginated<AdminReport>>(`${B}/reports/`, { query }),
  updateReport: (id: string, body: { status?: ReportStatus; admin_note?: string }) =>
    apiRequest<AdminReport>(`${B}/reports/${id}/`, { method: 'PATCH', body }),
};
