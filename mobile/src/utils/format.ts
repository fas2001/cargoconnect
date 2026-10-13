import { isArabic, locale, t } from '@/i18n';

const TIME_ZONE = 'Africa/Casablanca';
const dateLocale = () => (isArabic() ? 'ar-MA' : 'fr-FR');

export function formatPrice(amount: string | number | null | undefined, currency = 'MAD'): string {
  if (amount === null || amount === undefined || amount === '') return t('Prix à négocier');
  const value = typeof amount === 'string' ? Number(amount) : amount;
  return `${value.toLocaleString(locale(), { maximumFractionDigits: 0 })} ${currency === 'MAD' ? t('DH') : currency}`;
}

export function formatWeight(kg: string | number): string {
  const value = typeof kg === 'string' ? Number(kg) : kg;
  if (value >= 1000) return `${(value / 1000).toLocaleString(locale(), { maximumFractionDigits: 1 })} ${t('t')}`;
  return `${value.toLocaleString(locale(), { maximumFractionDigits: 0 })} ${t('kg')}`;
}

/** Date seule (AAAA-MM-JJ) : affichée sans conversion de fuseau. */
export function formatDay(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(dateLocale(), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(dateLocale(), {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TIME_ZONE,
  });
}

export function toIsoDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
