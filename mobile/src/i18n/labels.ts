// Libellés des statuts et listes fixes, traduits dans la langue de l'interface.
import type { CargoStatus, DocumentType, OfferStatus, ShipmentStatus, VerificationStatus } from '@/types/api';

import { t, type TKey } from './index';

const CARGO_STATUS = {
  draft: 'Brouillon',
  published: 'Publiée',
  assigned: 'Attribuée',
  completed: 'Livrée',
  cancelled: 'Annulée',
  expired: 'Expirée',
} as const satisfies Record<CargoStatus, TKey>;

const OFFER_STATUS = {
  pending: 'En attente',
  accepted: 'Acceptée',
  rejected: 'Refusée',
  withdrawn: 'Retirée',
  closed: 'Caduque',
} as const satisfies Record<OfferStatus, TKey>;

const SHIPMENT_STATUS = {
  confirmed: 'Confirmé',
  loaded: 'Chargement effectué',
  in_transit: 'En transit',
  delivered: 'Livraison déclarée',
  completed: 'Livré',
  cancelled: 'Annulé',
  disputed: 'En litige',
} as const satisfies Record<ShipmentStatus, TKey>;

const VERIFICATION = {
  pending: 'Vérification en cours',
  verified: 'Profil vérifié',
  rejected: 'Vérification refusée',
} as const satisfies Record<VerificationStatus, TKey>;

const SHIPMENT_ACTION = {
  loaded: 'Confirmer le chargement',
  in_transit: 'Démarrer le transport',
  delivered: 'Déclarer la livraison',
  completed: 'Confirmer la réception',
  cancelled: 'Annuler le transport',
  disputed: 'Signaler un problème',
} as const satisfies Partial<Record<ShipmentStatus, TKey>>;

const REPORT_REASONS = [
  { value: 'fraud', label: 'Fraude ou arnaque' },
  { value: 'no_show', label: 'Absence au rendez-vous' },
  { value: 'damage', label: 'Marchandise endommagée ou perdue' },
  { value: 'payment', label: 'Problème de paiement' },
  { value: 'behavior', label: 'Comportement inapproprié' },
  { value: 'inaccurate', label: 'Annonce inexacte' },
  { value: 'other', label: 'Autre' },
] as const satisfies readonly { value: string; label: TKey }[];

const DOCUMENT_TYPES = {
  cin: "Carte d'identité nationale",
  selfie: 'Photo du visage (selfie)',
  permis: 'Permis de conduire',
  carte_grise: 'Carte grise',
  assurance: "Attestation d'assurance",
  visite_technique: 'Visite technique',
  agrement: 'Agrément / inscription transporteur',
  autre: 'Autre',
} as const satisfies Record<DocumentType, TKey>;

export const cargoStatusLabel = (status: CargoStatus) => t(CARGO_STATUS[status]);
export const offerStatusLabel = (status: OfferStatus) => t(OFFER_STATUS[status]);
export const shipmentStatusLabel = (status: ShipmentStatus) => t(SHIPMENT_STATUS[status]);
export const verificationLabel = (status: VerificationStatus) => t(VERIFICATION[status]);

/** Libellé du bouton qui fait passer un transport au statut donné ('' si aucun). */
export function shipmentActionLabel(status: ShipmentStatus): string {
  const key = (SHIPMENT_ACTION as Partial<Record<ShipmentStatus, TKey>>)[status];
  return key ? t(key) : '';
}

export const reportReasons = () => REPORT_REASONS.map((r) => ({ value: r.value, label: t(r.label) }));
export const documentTypeLabel = (type: DocumentType) => t(DOCUMENT_TYPES[type]);
