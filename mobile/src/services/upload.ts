import { File } from 'expo-file-system';
import type { ImagePickerAsset } from 'expo-image-picker';
import { Platform } from 'react-native';

/** Ajoute une image au formulaire, dans un format accepté par le fetch d'Expo (iOS/Android) et le web. */
export async function appendAsset(form: FormData, field: string, asset: ImagePickerAsset) {
  const name = asset.fileName ?? `photo-${Date.now()}.jpg`;
  if (Platform.OS === 'web') {
    const blob = await (await fetch(asset.uri)).blob();
    form.append(field, blob, name);
  } else {
    // Le fetch d'Expo (SDK 52+) refuse l'objet {uri, name, type} de React Native :
    // il lui faut un File d'expo-file-system, dont il lit le contenu.
    form.append(field, new File(asset.uri) as unknown as Blob, name);
  }
}

/** Formulaire avec une image et des champs texte. */
export async function assetToFormData(field: string, asset: ImagePickerAsset, extra: Record<string, string> = {}) {
  const form = new FormData();
  await appendAsset(form, field, asset);
  for (const [key, value] of Object.entries(extra)) form.append(key, value);
  return form;
}
