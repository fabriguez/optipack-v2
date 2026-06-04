import { useState } from 'react';
import { FlatList, Pressable } from 'react-native';
import { AuthedImage } from '@/components/ui/AuthedImage';
import { ZoomableImageViewer, type ViewerImage } from '@/components/parcel/ZoomableImageViewer';
import { colors, radius } from '@/lib/theme/colors';

interface ParcelImage {
  id: string;
  url: string;
  caption?: string | null;
  isPrimary?: boolean;
}

export function ImageGallery({ images }: { images: ParcelImage[] }) {
  const [openAt, setOpenAt] = useState<number | null>(null);
  if (!images || images.length === 0) return null;
  const sorted = [...images].sort((a, b) => (a.isPrimary ? -1 : b.isPrimary ? 1 : 0));
  const viewerImages: ViewerImage[] = sorted.map((i) => ({ id: i.id, url: i.url, caption: i.caption }));

  return (
    <>
      <FlatList
        data={sorted}
        keyExtractor={(i) => i.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
        renderItem={({ item, index }) => (
          <Pressable onPress={() => setOpenAt(index)}>
            <AuthedImage
              uri={item.url}
              style={{ width: 120, height: 120, borderRadius: radius.md, backgroundColor: colors.gray[100] }}
            />
          </Pressable>
        )}
      />
      <ZoomableImageViewer
        images={viewerImages}
        visible={openAt !== null}
        initialIndex={openAt ?? 0}
        onClose={() => setOpenAt(null)}
      />
    </>
  );
}
