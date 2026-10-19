import type {
  AccountType,
  AppNotification,
  AuthResponse,
  CargoDetail,
  CargoInput,
  CargoStatus,
  CargoSummary,
  City,
  ClientIdentity,
  ClientOffer,
  DriverProfile,
  GoodsCategory,
  MyOffer,
  Option,
  OwnOffer,
  Paginated,
  RegisterData,
  Shipment,
  ShipmentProof,
  ShipmentStatus,
  ShipmentSummary,
  TruckType,
  User,
  Vehicle,
} from '@/types/api';

import { apiRequest } from './api';
import { appendAsset } from './upload';

export type CargoFilters = {
  origin_city?: number;
  destination_city?: number;
  truck_type?: TruckType[];
  date_from?: string;
  date_to?: string;
  weight_max?: string;
  page?: number;
};

export const api = {
  // Authentification
  register: (body: RegisterData) =>
    apiRequest<AuthResponse>('/auth/register/', { method: 'POST', body, auth: false }),
  login: (body: { phone: string; password: string }) =>
    apiRequest<AuthResponse>('/auth/login/', { method: 'POST', body, auth: false }),
  logout: (refresh: string) => apiRequest<void>('/auth/logout/', { method: 'POST', body: { refresh } }),
  requestOtp: (phone: string, purpose: 'verify_phone' | 'reset_password') =>
    apiRequest<{ detail: string }>('/auth/otp/request/', { method: 'POST', body: { phone, purpose }, auth: false }),
  resetPassword: (body: { phone: string; code: string; new_password: string }) =>
    apiRequest<void>('/auth/password-reset/', { method: 'POST', body, auth: false }),

  // Profil
  me: () => apiRequest<User>('/me/'),
  updateMe: (body: Partial<Pick<User, 'full_name' | 'email' | 'avatar'>>) => apiRequest<User>('/me/', { method: 'PATCH', body }),
  /** Nouvelle photo de profil (multipart). Pour la retirer : updateMe({ avatar: null }). */
  uploadAvatar: (form: FormData) => apiRequest<User>('/me/', { method: 'PATCH', body: form }),
  changePassword: (body: { current_password: string; new_password: string }) =>
    // Les autres appareils sont déconnectés ; celui-ci reçoit de nouveaux jetons.
    apiRequest<{ access: string; refresh: string }>('/me/password/', { method: 'POST', body }),
  /** Suppression définitive du compte (données personnelles effacées). Le mot de passe est exigé. */
  deleteAccount: (password: string) => apiRequest<void>('/me/', { method: 'DELETE', body: { password } }),
  verifyPhone: (code: string) => apiRequest<User>('/me/verify-phone/', { method: 'POST', body: { code } }),
  driverProfile: () => apiRequest<DriverProfile>('/me/driver-profile/'),
  vehicles: () => apiRequest<Paginated<Vehicle>>('/me/vehicles/'),
  addVehicle: (body: { truck_type: TruckType; capacity_kg: string; registration_number: string; brand_model?: string }) =>
    apiRequest<Vehicle>('/me/vehicles/', { method: 'POST', body }),
  removeVehicle: (id: string) => apiRequest<void>(`/me/vehicles/${id}/`, { method: 'DELETE' }),
  clientIdentity: () => apiRequest<ClientIdentity>('/me/client-identity/'),
  saveClientIdentity: (body: { account_type: AccountType; cin_number?: string; company_name?: string; ice?: string }) =>
    apiRequest<ClientIdentity>('/me/client-identity/', { method: 'PUT', body }),
  uploadClientDocument: (form: FormData) =>
    apiRequest<unknown>('/me/client-identity/documents/', { method: 'POST', body: form }),
  uploadDocument: (form: FormData) =>
    apiRequest<unknown>('/me/driver-profile/documents/', { method: 'POST', body: form }),

  // Référentiels
  cities: () => apiRequest<City[]>('/reference/cities/', { auth: false }),
  categories: () => apiRequest<GoodsCategory[]>('/reference/goods-categories/', { auth: false }),
  truckTypes: () => apiRequest<Option<TruckType>[]>('/reference/truck-types/', { auth: false }),

  // Cargaisons
  marketplace: (filters: CargoFilters) => apiRequest<Paginated<CargoSummary>>('/cargos/', { query: filters }),
  myCargos: (status?: CargoStatus[], page = 1) =>
    apiRequest<Paginated<CargoSummary>>('/cargos/mine/', { query: { status, page } }),
  cargo: (id: string) => apiRequest<CargoDetail>(`/cargos/${id}/`),
  createCargo: (body: CargoInput) => apiRequest<CargoDetail>('/cargos/', { method: 'POST', body }),
  updateCargo: (id: string, body: Partial<CargoInput>) =>
    apiRequest<CargoDetail>(`/cargos/${id}/`, { method: 'PATCH', body }),
  publishCargo: (id: string) => apiRequest<CargoDetail>(`/cargos/${id}/publish/`, { method: 'POST' }),
  cancelCargo: (id: string, reason: string) =>
    apiRequest<CargoDetail>(`/cargos/${id}/cancel/`, { method: 'POST', body: { reason } }),
  uploadCargoPhoto: (id: string, form: FormData) =>
    apiRequest<unknown>(`/cargos/${id}/photos/`, { method: 'POST', body: form }),

  // Offres
  cargoOffers: <T = ClientOffer>(cargoId: string) => apiRequest<T[]>(`/cargos/${cargoId}/offers/`),
  createOffer: (cargoId: string, body: { price: string; message?: string; vehicle?: string | null }) =>
    apiRequest<OwnOffer>(`/cargos/${cargoId}/offers/`, { method: 'POST', body }),
  updateOffer: (id: string, body: { price?: string; message?: string }) =>
    apiRequest<OwnOffer>(`/offers/${id}/`, { method: 'PATCH', body }),
  withdrawOffer: (id: string) => apiRequest<OwnOffer>(`/offers/${id}/withdraw/`, { method: 'POST' }),
  /** `price` : le tarif affiché au client. Refusé (offer_changed) si le chauffeur l'a modifié entre-temps. */
  acceptOffer: (id: string, price: string) => apiRequest<Shipment>(`/offers/${id}/accept/`, { method: 'POST', body: { price } }),
  rejectOffer: (id: string) => apiRequest<ClientOffer>(`/offers/${id}/reject/`, { method: 'POST' }),
  myOffers: (status?: string, page = 1) =>
    apiRequest<Paginated<MyOffer>>('/offers/mine/', { query: { status, page } }),

  // Transports
  shipments: (role: 'client' | 'driver', scope?: 'active' | 'past', page = 1) =>
    apiRequest<Paginated<ShipmentSummary>>('/shipments/', { query: { role, scope, page } }),
  shipment: (id: string) => apiRequest<Shipment>(`/shipments/${id}/`),
  changeShipmentStatus: async (id: string, status: ShipmentStatus, note = '', proof?: ShipmentProof) => {
    if (!proof) return apiRequest<Shipment>(`/shipments/${id}/events/`, { method: 'POST', body: { status, note } });
    // Preuves : photos + position (+ réceptionnaire et signature à la livraison), en multipart.
    const form = new FormData();
    form.append('status', status);
    form.append('note', note);
    form.append('latitude', proof.latitude.toFixed(6));
    form.append('longitude', proof.longitude.toFixed(6));
    if (proof.accuracy !== null) form.append('location_accuracy_m', String(Math.round(proof.accuracy)));
    if (proof.receiver_name) form.append('receiver_name', proof.receiver_name);
    if (proof.signature) form.append('signature', proof.signature);
    if (proof.delivery_code) form.append('delivery_code', proof.delivery_code);
    for (const photo of proof.photos) await appendAsset(form, 'photos', photo);
    return apiRequest<Shipment>(`/shipments/${id}/events/`, { method: 'POST', body: form });
  },
  reviewShipment: (id: string, rating: number, comment = '') =>
    apiRequest<unknown>(`/shipments/${id}/review/`, { method: 'POST', body: { rating, comment } }),

  // Signalements et notifications
  report: (body: { reason: string; description: string; cargo?: string; shipment?: string }) =>
    apiRequest<unknown>('/reports/', { method: 'POST', body }),
  notifications: (page = 1) => apiRequest<Paginated<AppNotification>>('/notifications/', { query: { page } }),
  unreadCount: () => apiRequest<{ count: number }>('/notifications/unread-count/'),
  markRead: (id: string) => apiRequest<AppNotification>(`/notifications/${id}/read/`, { method: 'POST' }),
  markAllRead: () => apiRequest<void>('/notifications/read-all/', { method: 'POST' }),
  registerPushToken: (token: string, platform: string) =>
    apiRequest<unknown>('/push-tokens/', { method: 'POST', body: { token, platform } }),
};
