import { cargoStatusLabel, offerStatusLabel, shipmentStatusLabel, verificationLabel } from '@/i18n/labels';
import type { CargoStatus, OfferStatus, ShipmentStatus, VerificationStatus } from '@/types/api';

import { Badge, type BadgeTone } from './ui';

const CARGO_TONE: Record<CargoStatus, BadgeTone> = {
  draft: 'neutral',
  published: 'info',
  assigned: 'warning',
  completed: 'success',
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
  <Badge label={cargoStatusLabel(status)} tone={CARGO_TONE[status]} />
);
export const OfferStatusBadge = ({ status }: { status: OfferStatus }) => (
  <Badge label={offerStatusLabel(status)} tone={OFFER_TONE[status]} />
);
export const ShipmentStatusBadge = ({ status }: { status: ShipmentStatus }) => (
  <Badge label={shipmentStatusLabel(status)} tone={SHIPMENT_TONE[status]} />
);
export const VerificationBadge = ({ status }: { status: VerificationStatus }) => (
  <Badge label={verificationLabel(status)} tone={VERIFICATION_TONE[status]} />
);
