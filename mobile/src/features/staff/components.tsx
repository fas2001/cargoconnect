import { useInfiniteQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { type ReactElement, useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ReasonDialog } from '@/components/reason-dialog';
import { TruckLoader } from '@/components/truck-loader';
import { Badge, type BadgeTone, Button, Chip, EmptyState, ErrorState, Loading, modalAnimation } from '@/components/ui';
import { Colors, Fonts, FontSize, Radius, Spacing } from '@/constants/theme';
import { errorMessage } from '@/services/api';
import { tokenStorage } from '@/services/token-storage';
import type { Paginated } from '@/types/api';

// ---------------------------------------------------------------------------
// Justificatifs : images privées, chargées avec le jeton de l'équipe (chaque ouverture est journalisée).

function useAccessToken(): string | null {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void tokenStorage.getAccess().then((value) => {
      if (active) setToken(value);
    });
    return () => {
      active = false;
    };
  }, []);
  return token;
}

/** Aperçu d'un justificatif ; un appui l'ouvre en plein écran. Les PDF s'affichent comme un lien. */
export function PrivateImage({ uri, height = 180 }: { uri: string; height?: number }) {
  const token = useAccessToken();
  const [open, setOpen] = useState(false);
  if (!token) return <View style={[styles.image, { height }]} />;
  const source = { uri, headers: { Authorization: `Bearer ${token}` } };
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="imagebutton" accessibilityLabel="Agrandir le justificatif">
        <Image source={source} style={[styles.image, { height }]} contentFit="cover" />
      </Pressable>
      <Modal visible={open} transparent animationType={modalAnimation('fade')} onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.viewer} onPress={() => setOpen(false)}>
          <Image source={source} style={styles.full} contentFit="contain" />
          <Text style={styles.viewerHint}>Toucher pour fermer</Text>
        </Pressable>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Décisions

/** Valider ou refuser (le refus demande un motif, envoyé à l'utilisateur). */
export function DecisionButtons({
  onDecide,
  verifyLabel = 'Valider',
  rejectLabel = 'Refuser',
}: {
  onDecide: (status: 'verified' | 'rejected', reason?: string) => Promise<void>;
  verifyLabel?: string;
  rejectLabel?: string;
}) {
  const [busy, setBusy] = useState<'verified' | 'rejected' | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decide = async (status: 'verified' | 'rejected', reason?: string) => {
    setError(null);
    setBusy(status);
    try {
      await onDecide(status, reason);
      setRejecting(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ gap: Spacing.xs }}>
      <View style={styles.row}>
        <Button title={rejectLabel} variant="danger" onPress={() => setRejecting(true)} disabled={busy !== null} style={{ flex: 1 }} />
        <Button title={verifyLabel} onPress={() => decide('verified')} loading={busy === 'verified'} disabled={busy !== null} style={{ flex: 1 }} />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <ReasonDialog
        visible={rejecting}
        title={rejectLabel}
        label="Motif (envoyé à l'utilisateur)"
        confirmLabel="Confirmer le refus"
        required
        onCancel={() => setRejecting(false)}
        onConfirm={(reason) => decide('rejected', reason)}
      />
    </View>
  );
}

const VERIFICATION: Record<string, { label: string; tone: BadgeTone }> = {
  missing: { label: 'Non renseigné', tone: 'neutral' },
  incomplete: { label: 'Incomplet', tone: 'neutral' },
  pending: { label: 'À vérifier', tone: 'warning' },
  verified: { label: 'Vérifié', tone: 'success' },
  rejected: { label: 'Refusé', tone: 'danger' },
  expired: { label: 'Expiré', tone: 'danger' },
};

export function VerificationPill({ status }: { status: string }) {
  const v = VERIFICATION[status] ?? { label: status, tone: 'neutral' as const };
  return <Badge label={v.label} tone={v.tone} />;
}

// ---------------------------------------------------------------------------
// Listes : filtres, recherche et pagination

export type Filter = { label: string; value?: string };

/** Liste paginée avec filtres (pastilles) et recherche, commune à tous les écrans de l'administration. */
export function AdminList<T extends { id: string }>({
  queryKey,
  fetchPage,
  filters,
  initialFilter = 0,
  searchPlaceholder,
  renderItem,
  emptyTitle,
}: {
  queryKey: string;
  fetchPage: (query: { status?: string; search?: string; page: number }) => Promise<Paginated<T>>;
  filters?: Filter[];
  initialFilter?: number;
  searchPlaceholder?: string;
  renderItem: (item: T) => ReactElement;
  emptyTitle: string;
}) {
  const [filter, setFilter] = useState(initialFilter);
  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState('');
  const status = filters?.[filter]?.value;

  const query = useInfiniteQuery({
    queryKey: ['backoffice', queryKey, status ?? 'all', submitted],
    queryFn: ({ pageParam }) => fetchPage({ status, search: submitted || undefined, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.next ? pages.length + 1 : undefined),
  });
  const items = query.data?.pages.flatMap((p) => p.results) ?? [];
  const total = query.data?.pages[0]?.count;

  return (
    <FlatList
      style={{ backgroundColor: Colors.background }}
      contentContainerStyle={styles.list}
      data={items}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View style={{ gap: Spacing.sm }}>
          {searchPlaceholder ? (
            <TextInput
              style={styles.search}
              placeholder={searchPlaceholder}
              placeholderTextColor={Colors.textMuted}
              value={search}
              onChangeText={setSearch}
              onSubmitEditing={() => setSubmitted(search.trim())}
              returnKeyType="search"
            />
          ) : null}
          {filters ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
              {filters.map((f, i) => (
                <Chip key={f.label} label={f.label} selected={i === filter} onPress={() => setFilter(i)} />
              ))}
            </ScrollView>
          ) : null}
          {total !== undefined ? <Text style={styles.count}>{total} résultat(s)</Text> : null}
        </View>
      }
      renderItem={({ item }) => renderItem(item)}
      ListEmptyComponent={
        query.isLoading ? (
          <Loading />
        ) : query.error ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />
        ) : (
          <EmptyState icon="checkmark-done-outline" title={emptyTitle} />
        )
      }
      refreshing={query.isRefetching}
      onRefresh={() => query.refetch()}
      onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage()}
      ListFooterComponent={query.isFetchingNextPage ? <TruckLoader size="small" label={false} /> : null}
    />
  );
}

/** Ligne d'information « libellé : valeur » des fiches. */
export function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue} selectable>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { width: '100%', borderRadius: Radius.md, backgroundColor: Colors.border },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', padding: Spacing.md },
  full: { width: '100%', height: '85%' },
  viewerHint: { fontFamily: Fonts.regular, color: Colors.white, textAlign: 'center', marginTop: Spacing.md, fontSize: FontSize.small },
  row: { flexDirection: 'row', gap: Spacing.sm },
  error: { fontFamily: Fonts.regular, fontSize: FontSize.small, color: Colors.danger },
  list: { padding: Spacing.lg, gap: Spacing.md, flexGrow: 1 },
  search: {
    fontFamily: Fonts.regular,
    minHeight: 48,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.body,
    color: Colors.text,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  count: { fontFamily: Fonts.regular, fontSize: FontSize.caption, color: Colors.textSecondary },
  field: { flexDirection: 'row', gap: Spacing.sm },
  fieldLabel: { fontFamily: Fonts.regular, width: 120, fontSize: FontSize.small, color: Colors.textSecondary },
  fieldValue: { fontFamily: Fonts.semibold, flex: 1, fontSize: FontSize.small, color: Colors.text },
});
