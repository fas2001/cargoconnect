import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { t } from '@/i18n';

import { modalAnimation, SelectButton } from './ui';

export type PickerOption<V> = { value: V; label: string; sublabel?: string };

type Props<V> = {
  label: string;
  placeholder: string;
  options: PickerOption<V>[];
  value: V | null | undefined;
  onChange: (value: V | null) => void;
  searchable?: boolean;
  allowClear?: boolean;
  error?: string;
};

/** Sélecteur plein écran, avec recherche (pratique pour la liste des villes). */
export function OptionPicker<V extends string | number>({
  label,
  placeholder,
  options,
  value,
  onChange,
  searchable,
  allowClear,
  error,
}: Props<V>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return options;
    return options.filter((o) => normalize(`${o.label} ${o.sublabel ?? ''}`).includes(q));
  }, [options, query]);

  const choose = (v: V | null) => {
    onChange(v);
    setOpen(false);
    setQuery('');
  };

  return (
    <>
      <SelectButton label={label} placeholder={placeholder} value={selected?.label} onPress={() => setOpen(true)} error={error} />
      <Modal visible={open} animationType={modalAnimation('slide')} onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>{label}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={t('Fermer')} onPress={() => setOpen(false)} hitSlop={12}>
              <Ionicons name="close" size={26} color={Colors.text} />
            </Pressable>
          </View>
          {searchable ? (
            <TextInput
              autoFocus
              placeholder={t('Rechercher...')}
              placeholderTextColor={Colors.textMuted}
              value={query}
              onChangeText={setQuery}
              style={styles.search}
            />
          ) : null}
          <FlatList
            data={filtered}
            keyExtractor={(item) => String(item.value)}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              allowClear && value != null ? (
                <Pressable style={styles.row} onPress={() => choose(null)}>
                  <Text style={[styles.rowLabel, { color: Colors.primary }]}>{t('Tous / effacer')}</Text>
                </Pressable>
              ) : null
            }
            renderItem={({ item }) => (
              <Pressable style={styles.row} onPress={() => choose(item.value)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>{item.label}</Text>
                  {item.sublabel ? <Text style={styles.rowSub}>{item.sublabel}</Text> : null}
                </View>
                {item.value === value ? <Ionicons name="checkmark" size={20} color={Colors.primary} /> : null}
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

const styles = StyleSheet.create({
  modal: { flex: 1, backgroundColor: Colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.lg,
  },
  title: { fontSize: FontSize.title, fontWeight: '700', color: Colors.text },
  search: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    minHeight: 46,
    fontSize: FontSize.body,
    color: Colors.text,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    minHeight: 52,
  },
  rowLabel: { fontSize: FontSize.body, color: Colors.text },
  rowSub: { fontSize: FontSize.caption, color: Colors.textMuted, marginTop: 2 },
});
