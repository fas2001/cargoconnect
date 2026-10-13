// Libellés français centralisés : l'arabe s'ajoutera dans `ar.ts` avec la même structure.
import type { CargoStatus, OfferStatus, ShipmentStatus, VerificationStatus } from '@/types/api';

export const fr = {
  cargoStatus: {
    draft: 'Brouillon',
    published: 'Publiée',
    assigned: 'Attribuée',
    cancelled: 'Annulée',
    expired: 'Expirée',
  } satisfies Record<CargoStatus, string>,
  offerStatus: {
    pending: 'En attente',
    accepted: 'Acceptée',
    rejected: 'Refusée',
    withdrawn: 'Retirée',
    closed: 'Caduque',
  } satisfies Record<OfferStatus, string>,
  shipmentStatus: {
    confirmed: 'Confirmé',
    loaded: 'Chargement effectué',
    in_transit: 'En transit',
    delivered: 'Livraison déclarée',
    completed: 'Livré',
    cancelled: 'Annulé',
    disputed: 'En litige',
  } satisfies Record<ShipmentStatus, string>,
  verification: {
    pending: 'Vérification en cours',
    verified: 'Profil vérifié',
    rejected: 'Vérification refusée',
  } satisfies Record<VerificationStatus, string>,
  shipmentAction: {
    loaded: 'Confirmer le chargement',
    in_transit: 'Démarrer le transport',
    delivered: 'Déclarer la livraison',
    completed: 'Confirmer la réception',
    cancelled: 'Annuler le transport',
    disputed: 'Signaler un problème',
    confirmed: '',
  } satisfies Record<ShipmentStatus, string>,
  reportReasons: [
    { value: 'fraud', label: 'Fraude ou arnaque' },
    { value: 'no_show', label: 'Absence au rendez-vous' },
    { value: 'damage', label: 'Marchandise endommagée ou perdue' },
    { value: 'payment', label: 'Problème de paiement' },
    { value: 'behavior', label: 'Comportement inapproprié' },
    { value: 'inaccurate', label: 'Annonce inexacte' },
    { value: 'other', label: 'Autre' },
  ],
  documentTypes: [
    { value: 'cin', label: "Carte d'identité nationale" },
    { value: 'permis', label: 'Permis de conduire' },
    { value: 'carte_grise', label: 'Carte grise' },
    { value: 'assurance', label: "Attestation d'assurance" },
    { value: 'agrement', label: 'Agrément / inscription transporteur' },
    { value: 'autre', label: 'Autre' },
  ],
};
