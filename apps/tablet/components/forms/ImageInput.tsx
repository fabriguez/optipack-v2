import { useState } from 'react';
import { View, Text, Pressable, Image, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import { FormField } from './FormField';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

export interface PickedImage {
  uri: string;
  name: string;
  mimeType: string;
  width?: number;
  height?: number;
}

interface ImageInputProps<T extends FieldValues> {
  name: Path<T>;
  control: Control<T>;
  label?: string;
  required?: boolean;
  /** When true, value is an array of PickedImage; otherwise a single PickedImage|null. */
  multiple?: boolean;
}

async function ensurePermissions(source: 'camera' | 'library'): Promise<boolean> {
  if (source === 'camera') {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission requise', 'Acces a la camera necessaire.');
      return false;
    }
  } else {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission requise', 'Acces aux photos necessaire.');
      return false;
    }
  }
  return true;
}

function toPicked(asset: ImagePicker.ImagePickerAsset): PickedImage {
  const guessedName = asset.fileName ?? `image-${Date.now()}.jpg`;
  return {
    uri: asset.uri,
    name: guessedName,
    mimeType: asset.mimeType ?? 'image/jpeg',
    width: asset.width,
    height: asset.height,
  };
}

export function ImageInput<T extends FieldValues>({ name, control, label, required, multiple }: ImageInputProps<T>) {
  const [busy, setBusy] = useState(false);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { value, onChange }, fieldState: { error } }) => {
        const list: PickedImage[] = multiple
          ? (Array.isArray(value) ? value : [])
          : value
          ? [value as PickedImage]
          : [];

        const setList = (next: PickedImage[]) => {
          if (multiple) onChange(next);
          else onChange((next[0] as unknown) ?? null);
        };

        const pick = async (source: 'camera' | 'library') => {
          if (!(await ensurePermissions(source))) return;
          setBusy(true);
          try {
            const opts: ImagePicker.ImagePickerOptions = {
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.85,
              allowsMultipleSelection: !!multiple && source === 'library',
            };
            const res =
              source === 'camera'
                ? await ImagePicker.launchCameraAsync(opts)
                : await ImagePicker.launchImageLibraryAsync(opts);
            if (res.canceled) return;
            const picked = res.assets.map(toPicked);
            setList(multiple ? [...list, ...picked] : picked.slice(0, 1));
          } finally {
            setBusy(false);
          }
        };

        const removeAt = (idx: number) => {
          const next = list.filter((_, i) => i !== idx);
          setList(next);
        };

        return (
          <FormField label={label} error={error?.message} required={required}>
            <View
              style={{
                borderWidth: 1,
                borderColor: error ? colors.error : colors.gray[300],
                borderRadius: radius.md,
                padding: spacing.md,
                backgroundColor: colors.white,
                gap: spacing.md,
              }}
            >
              {list.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                  {list.map((img, idx) => (
                    <View key={`${img.uri}-${idx}`} style={{ position: 'relative' }}>
                      <Image
                        source={{ uri: img.uri }}
                        style={{ width: 88, height: 88, borderRadius: radius.sm, backgroundColor: colors.gray[100] }}
                      />
                      <Pressable
                        onPress={() => removeAt(idx)}
                        style={{
                          position: 'absolute',
                          top: -6,
                          right: -6,
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          backgroundColor: colors.error,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Ionicons name="close" size={14} color={colors.white} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Pressable
                  onPress={() => pick('library')}
                  disabled={busy}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingHorizontal: spacing.lg,
                    height: 36,
                    borderRadius: radius.md,
                    backgroundColor: colors.gray[100],
                  }}
                >
                  <Ionicons name="images-outline" size={16} color={colors.gray[700]} />
                  <Text style={{ fontSize: 13, color: colors.gray[700] }}>Galerie</Text>
                </Pressable>
                <Pressable
                  onPress={() => pick('camera')}
                  disabled={busy}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingHorizontal: spacing.lg,
                    height: 36,
                    borderRadius: radius.md,
                    backgroundColor: colors.gray[100],
                  }}
                >
                  <Ionicons name="camera-outline" size={16} color={colors.gray[700]} />
                  <Text style={{ fontSize: 13, color: colors.gray[700] }}>Camera</Text>
                </Pressable>
                {busy && <ActivityIndicator size="small" color={colors.primary[500]} />}
              </View>
            </View>
          </FormField>
        );
      }}
    />
  );
}
