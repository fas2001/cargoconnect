import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts, FontSize, Radius, Spacing } from '@/constants/theme';
import { isArabic, t } from '@/i18n';
import { formatDay, toIsoDay } from '@/utils/format';

import { Button, Chevron, modalAnimation, SelectButton } from './ui';

const MONTHS = {
  fr: ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'],
  // Noms des mois utilisés au Maroc.
  ar: ['يناير', 'فبراير', 'مارس', 'أبريل', 'ماي', 'يونيو', 'يوليوز', 'غشت', 'شتنبر', 'أكتوبر', 'نونبر', 'دجنبر'],
};
const WEEKDAYS = { fr: ['L', 'M', 'M', 'J', 'V', 'S', 'D'], ar: ['ن', 'ث', 'ر', 'خ', 'ج', 'س', 'ح'] };

type Props = {
  label: string;
  value: string | null; // AAAA-MM-JJ
  onChange: (value: string) => void;
  minimumDate?: Date;
  error?: string;
};

/** Champ date avec calendrier (identique sur Android, iOS et web) : aucune saisie au clavier. */
export function DateField({ label, value, onChange, minimumDate, error }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <SelectButton
        label={label}
        placeholder={t('Choisir une date')}
        value={value ? formatDay(value) : undefined}
        onPress={() => setOpen(true)}
        icon="calendar-outline"
        error={error}
      />
      <Modal visible={open} transparent animationType={modalAnimation('fade')} onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          {/* Pressable interne : un appui dans le calendrier ne ferme pas la fenêtre. */}
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <Calendar
              value={value}
              minimumDate={minimumDate}
              onSelect={(day) => {
                onChange(day);
                setOpen(false);
              }}
            />
            <Button title={t('Fermer')} variant="ghost" onPress={() => setOpen(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function Calendar({ value, minimumDate, onSelect }: { value: string | null; minimumDate?: Date; onSelect: (day: string) => void }) {
  const initial = value ? new Date(`${value}T12:00:00`) : minimumDate ?? new Date();
  const [month, setMonth] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));

  const minDay = minimumDate ? toIsoDay(minimumDate) : null;
  const today = toIsoDay(new Date());
  const year = month.getFullYear();
  const monthIndex = month.getMonth();

  // Semaine commençant le lundi : décalage du 1er du mois.
  const offset = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  const canGoBack = !minimumDate || new Date(year, monthIndex, 1) > new Date(minimumDate.getFullYear(), minimumDate.getMonth(), 1);

  return (
    <View style={{ gap: Spacing.sm }}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Mois précédent')}
          disabled={!canGoBack}
          onPress={() => setMonth(new Date(year, monthIndex - 1, 1))}
          hitSlop={10}
          style={[styles.nav, !canGoBack && { opacity: 0.3 }]}>
          <Chevron direction="back" size={22} color={Colors.primary} />
        </Pressable>
        <Text style={styles.monthTitle}>
          {MONTHS[isArabic() ? 'ar' : 'fr'][monthIndex]} {year}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Mois suivant')}
          onPress={() => setMonth(new Date(year, monthIndex + 1, 1))}
          hitSlop={10}
          style={styles.nav}>
          <Chevron size={22} color={Colors.primary} />
        </Pressable>
      </View>

      <View style={styles.row}>
        {WEEKDAYS[isArabic() ? 'ar' : 'fr'].map((d, i) => (
          <Text key={i} style={[styles.cell, styles.weekday]}>
            {d}
          </Text>
        ))}
      </View>

      {Array.from({ length: cells.length / 7 }, (_, week) => (
        <View key={week} style={styles.row}>
          {cells.slice(week * 7, week * 7 + 7).map((day, i) => {
            if (day === null) return <View key={i} style={styles.cell} />;
            const iso = toIsoDay(new Date(year, monthIndex, day));
            const disabled = minDay !== null && iso < minDay;
            const selected = iso === value;
            return (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityLabel={formatDay(iso)}
                accessibilityState={{ disabled, selected }}
                disabled={disabled}
                onPress={() => onSelect(iso)}
                style={styles.cell}>
                <View style={[styles.day, selected && styles.daySelected, iso === today && !selected && styles.dayToday]}>
                  <Text style={[styles.dayText, disabled && styles.dayDisabled, selected && styles.dayTextSelected]}>{day}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: Spacing.lg },
  sheet: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nav: { padding: Spacing.xs },
  monthTitle: { fontSize: FontSize.title, fontFamily: Fonts.bold, color: Colors.text },
  row: { flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 42 },
  weekday: { fontSize: FontSize.caption, fontFamily: Fonts.semibold, color: Colors.textMuted, textAlign: 'center', textAlignVertical: 'center' },
  day: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  daySelected: { backgroundColor: Colors.primary },
  dayToday: { borderWidth: 1.5, borderColor: Colors.accent },
  dayText: { fontFamily: Fonts.regular, fontSize: FontSize.body, color: Colors.text },
  dayTextSelected: { color: Colors.white, fontFamily: Fonts.bold },
  dayDisabled: { color: Colors.border },
});
