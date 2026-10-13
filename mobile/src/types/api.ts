// Types alignés sur l'API Django (voir docs/openapi.yaml).
import type { ImagePickerAsset } from 'expo-image-picker';

export type Role = 'client' | 'driver';

export type CargoStatus = 'draft' | 'published' | 'assigned' | 'completed' | 'cancelled' | 'expired';
export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn' | 'closed';
export type ShipmentStatus =
  | 'confirmed'
  | 'loaded'
  | 'in_transit'
  | 'delivered'
  | 'completed'
  | 'cancelled'
  | 'disputed';
export type VerificationStatus = 'pending' | 'verified' | 'rejected';
export type TruckType =
  | 'plateau'
  | 'bache'
  | 'fourgon'
  | 'benne'
  | 'frigorifique'
  | 'citerne'
  | 'porte_conteneur'
  | 'porte_char'
  | 'pickup';

export type Paginated<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export type Rating = { average: number | null; count: number };

export type User = {
  id: string;
  phone: string;
  full_name: string;
  email: string;
  phone_verified: boolean;
  roles: Role[];
  driver_profile: { id: string; company_name: string; verification_status: VerificationStatus } | null;
  rating_as_client: Rating;
  date_joined: string;
};

export type AuthResponse = { access: string; refresh: string; user: User };

export type RegisterData = {
  phone: string;
  full_name: string;
  email?: string;
  password: string;
  role: Role;
  company_name?: string;
};

export type City = { id: number; slug: string; name_fr: string; name_ar: string; region: string };
export type GoodsCategory = { id: number; slug: string; name_fr: string; name_ar: string };
export type Option<T extends string = string> = { value: T; label: string };

export type Vehicle = {
  id: string;
  truck_type: TruckType;
  truck_type_label: string;
  capacity_kg: string;
  registration_number: string;
  brand_model: string;
  is_active: boolean;
};

export type DocumentType = 'cin' | 'selfie' | 'permis' | 'carte_grise' | 'assurance' | 'visite_technique' | 'agrement' | 'autre';
export type DocumentSide = 'recto' | 'verso' | 'unique';

export type DriverDocument = {
  id: string;
  doc_type: DocumentType;
  doc_type_label: string;
  side: DocumentSide;
  vehicle: string | null;
  document_number: string;
  holder_name: string;
  issuer: string;
  expires_on: string | null;
  covers_goods: boolean | null;
  status: VerificationStatus;
  review_note: string;
  is_expired: boolean;
  created_at: string;
};

export type ChecklistState = 'missing' | 'pending' | 'verified' | 'rejected' | 'expired';

/** Justificatif exigé (personnel ou par camion) et son état. */
export type ChecklistItem = {
  doc_type: DocumentType;
  side: DocumentSide;
  vehicle_id: string | null;
  vehicle_label: string;
  state: ChecklistState;
  document_id: string | null;
  expires_on: string | null;
  review_note: string;
};

export type DriverProfile = {
  id: string;
  company_name: string;
  bio: string;
  verification_status: VerificationStatus;
  verified_at: string | null;
  rejection_reason: string;
  vehicles: Vehicle[];
  documents: DriverDocument[];
  checklist: ChecklistItem[];
  rating: Rating;
  created_at: string;
};

export type PublicDriver = {
  id: string;
  name: string;
  company_name: string;
  bio: string;
  is_verified: boolean;
  rating: Rating;
  completed_shipments: number;
  created_at: string;
};

export type CargoSummary = {
  id: string;
  title: string;
  category: GoodsCategory;
  weight_kg: string;
  volume_m3: string | null;
  truck_type: TruckType;
  truck_type_label: string;
  origin_city: City;
  destination_city: City;
  loading_date: string;
  proposed_price: string | null;
  /** Tarif de l'offre acceptée (visible par le client et le chauffeur retenu). */
  agreed_price: string | null;
  currency: string;
  status: CargoStatus;
  status_label: string;
  published_at: string | null;
  expires_at: string | null;
  offers_count: number;
  thumbnail: string | null;
  is_mine: boolean;
  created_at: string;
};

export type OwnOffer = {
  id: string;
  cargo: string;
  price: string;
  currency: string;
  message: string;
  status: OfferStatus;
  status_label: string;
  vehicle: Vehicle | null;
  shipment_id: string | null;
  created_at: string;
  updated_at: string;
};

export type MyOffer = Omit<OwnOffer, 'cargo'> & { cargo: CargoSummary };

export type CargoDetail = CargoSummary & {
  description: string;
  instructions: string;
  origin_address?: string;
  destination_address?: string;
  photos: { id: string; image: string; created_at: string }[];
  client: { name: string; rating: Rating; member_since: string };
  cancel_reason: string;
  can_edit: boolean;
  my_offer: OwnOffer | null;
  shipment_id: string | null;
  // Privés : présents seulement pour le client et le chauffeur retenu.
  declared_value?: string | null;
  recipient_name?: string;
  recipient_phone?: string;
  goods_declaration_at: string | null;
};

export type ClientOffer = {
  id: string;
  price: string;
  currency: string;
  message: string;
  status: OfferStatus;
  status_label: string;
  driver: PublicDriver;
  vehicle: Vehicle | null;
  created_at: string;
  updated_at: string;
};

export type CargoInput = {
  title: string;
  description?: string;
  category: number;
  weight_kg: string;
  volume_m3?: string | null;
  truck_type: TruckType;
  origin_city: number;
  origin_address?: string;
  destination_city: number;
  destination_address?: string;
  loading_date: string; // AAAA-MM-JJ
  proposed_price?: string | null;
  instructions?: string;
  declared_value: string;
  recipient_name?: string;
  recipient_phone?: string;
  accept_goods_declaration: boolean;
  publish?: boolean;
};

export type Contact = { name: string; phone: string; company_name?: string };

export type ShipmentEvent = {
  id: string;
  from_status: ShipmentStatus | '';
  to_status: ShipmentStatus;
  to_status_label: string;
  actor_name: string;
  note: string;
  // Preuves au chargement et à la livraison.
  latitude: string | null;
  longitude: string | null;
  location_accuracy_m: number | null;
  receiver_name: string;
  signature: string;
  photos: { id: string; image: string; created_at: string }[];
  created_at: string;
};

/** Preuves envoyées par le chauffeur au chargement et à la livraison. */
export type ShipmentProof = {
  photos: ImagePickerAsset[];
  latitude: number;
  longitude: number;
  accuracy: number | null;
  receiver_name?: string;
  signature?: string;
};

export type ShipmentSummary = {
  id: string;
  status: ShipmentStatus;
  status_label: string;
  agreed_price: string;
  currency: string;
  confirmed_at: string;
  cargo: CargoSummary;
  my_role: Role;
};

export type Shipment = Omit<ShipmentSummary, 'cargo'> & {
  loaded_at: string | null;
  delivered_at: string | null;
  completed_at: string | null;
  cargo: CargoDetail;
  client: Contact;
  driver: Contact;
  vehicle: Vehicle | null;
  events: ShipmentEvent[];
  allowed_transitions: { status: ShipmentStatus; label: string; note_required: boolean }[];
  can_review: boolean;
};

export type AppNotification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  data: { cargo_id?: string; offer_id?: string; shipment_id?: string };
  is_read: boolean;
  created_at: string;
};
