import type { ImagePickerAsset } from 'expo-image-picker';
import { Platform } from 'react-native';

/** Construit un FormData compatible React Native (iOS/Android) et web. */
export async function assetToFormData(field: string, asset: ImagePickerAsset, extra: Record<string, string> = {}) {
  const form = new FormData();
  const name = asset.fileName ?? `photo-${Date.now()}.jpg`;
  const type = asset.mimeType ?? 'image/jpeg';
  if (Platform.OS === 'web') {
    const blob = await (await fetch(asset.uri)).blob();
    form.append(field, blob, name);
  } else {
    // React Native accepte un objet {uri, name, type} à la place d'un Blob.
    form.append(field, { uri: asset.uri, name, type } as unknown as Blob);
  }
  for (const [key, value] of Object.entries(extra)) form.append(key, value);
  return form;
}
