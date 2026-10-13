import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { Screen } from '@/components/ui';
import { CargoForm } from '@/features/cargos/cargo-form';
import { api } from '@/services/endpoints';
import { assetToFormData } from '@/services/upload';

export default function Publish() {
  const queryClient = useQueryClient();
  // La clé force un formulaire vierge après chaque publication.
  const [formKey, setFormKey] = useState(0);

  return (
    <Screen edges={[]}>
      <CargoForm
        key={formKey}
        submitLabel="Publier l'annonce"
        allowDraft
        withPhotos
        onSubmit={async (input, photos) => {
          const cargo = await api.createCargo(input);
          let failedPhotos = 0;
          for (const photo of photos) {
            try {
              await api.uploadCargoPhoto(cargo.id, await assetToFormData('image', photo));
            } catch {
              failedPhotos += 1;
            }
          }
          await queryClient.invalidateQueries({ queryKey: ['cargos'] });
          setFormKey((k) => k + 1);
          if (failedPhotos) {
            Alert.alert('Annonce enregistrée', `${failedPhotos} photo(s) n'ont pas pu être envoyées (réseau).`);
          }
          router.push({ pathname: '/cargo/[id]', params: { id: cargo.id } });
        }}
      />
    </Screen>
  );
}
