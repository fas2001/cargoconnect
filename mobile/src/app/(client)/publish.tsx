import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { Screen } from '@/components/ui';
import { CargoForm } from '@/features/cargos/cargo-form';
import { errorMessage } from '@/services/api';
import { api } from '@/services/endpoints';
import { assetToFormData } from '@/services/upload';
import { t } from '@/i18n';

export default function Publish() {
  const queryClient = useQueryClient();
  // La clé force un formulaire vierge après chaque publication.
  const [formKey, setFormKey] = useState(0);

  return (
    <Screen edges={[]}>
      <CargoForm
        key={formKey}
        submitLabel={t("Publier l'annonce")}
        allowDraft
        withPhotos
        onSubmit={async (input, photos) => {
          const cargo = await api.createCargo(input);
          let failedPhotos = 0;
          let lastError = '';
          for (const photo of photos) {
            try {
              await api.uploadCargoPhoto(cargo.id, await assetToFormData('image', photo));
            } catch (e) {
              failedPhotos += 1;
              lastError = errorMessage(e);
            }
          }
          await queryClient.invalidateQueries({ queryKey: ['cargos'] });
          setFormKey((k) => k + 1);
          if (failedPhotos) {
            Alert.alert(t('Annonce enregistrée'), t("{count} photo(s) n'ont pas pu être envoyées : {error}", { count: failedPhotos, error: lastError }));
          }
          router.push({ pathname: '/cargo/[id]', params: { id: cargo.id } });
        }}
      />
    </Screen>
  );
}
