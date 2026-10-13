import { fr } from '@/i18n/fr';
import type { CargoStatus, OfferStatus, ShipmentStatus, VerificationStatus } from '@/types/api';

import { Badge, type BadgeTone } from './ui';

const CARGO_TONE: Record<CargoStatus, BadgeTone> = {
  draft: 'neutral',
  published: 'info',
  assigned: 'success',
  cancelled: 'danger',
  expired: 'neutral',
};

const OFFER_TONE: Record<OfferStatus, BadgeTone> = {
  pending: 'warning',
  accepted: 'success',
  rejected: 'danger',
  withdrawn: 'neutral',
  closed: 'neutral',
};

const SHIPMENT_TONE: Record<ShipmentStatus, BadgeTone> = {
  confirmed: 'info',
  loaded: 'info',
  in_transit: 'info',
  delivered: 'warning',
  completed: 'success',
  cancelled: 'danger',
  disputed: 'danger',
};

const VERIFICATION_TONE: Record<VerificationStatus, BadgeTone> = {
  pending: 'warning',
  verified: 'success',
  rejected: 'danger',
};

export const CargoStatusBadge = ({ status }: { status: CargoStatus }) => (
  <Badge label={fr.cargoStatus[status]} tone={CARGO_TONE[status]} />
);
export const OfferStatusBadge = ({ status }: { status: OfferStatus }) => (
  <Badge label={fr.offerStatus[status]} tone={OFFER_TONE[status]} />
);
export const ShipmentStatusBadge = ({ status }: { status: ShipmentStatus }) => (
  <Badge label={fr.shipmentStatus[status]} tone={SHIPMENT_TONE[status]} />
);
export const VerificationBadge = ({ status }: { status: VerificationStatus }) => (
  <Badge label={fr.verification[status]} tone={VERIFICATION_TONE[status]} />
);
