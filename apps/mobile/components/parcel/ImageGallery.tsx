import { useState } from 'react';
import { FlatList, Image, Pressable, Modal, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '@/lib/theme/colors';

interface ParcelImage {
  id: string;
  url: string;
  caption?: string | null;
  isPrimary?: boolean;
}

export function ImageGallery({ images }: { images: ParcelImage[] }) {
  const [active, setActive] = useState<string | null>(null);
  if (!images || images.length === 0) return null;
  const sorted = [...images].sort((a, b) => (a.isPrimary ? -1 : b.isPrimary ? 1 : 0));
  const win = Dimensions.get('window');

  return (
    <>
      <FlatList
        data={sorted}
        keyExtractor={(i) => i.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
        renderItem={({ item }) => (
          <Pressable onPress={() => setActive(item.url)}>
            <Image
              source={{ uri: item.url }}
              style={{ width: 120, height: 120, borderRadius: radius.md, backgroundColor: colors.gray[100] }}
            />
          </Pressable>
        )}
      />
      <Modal visible={!!active} transparent animationType="fade" onRequestClose={() => setActive(null)}>
        <Pressable
          onPress={() => setActive(null)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center' }}
        >
          {active && (
            <Image source={{ uri: active }} style={{ width: win.width, height: win.height * 0.8 }} resizeMode="contain" />
          )}
          <Pressable
            onPress={() => setActive(null)}
            style={{ position: 'absolute', top: 50, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="close" size={24} color="white" />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
