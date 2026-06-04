import { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, Pressable, FlatList, Dimensions, type ListRenderItemInfo } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { AuthedImage } from '@/components/ui/AuthedImage';

export interface ViewerImage {
  id: string;
  url: string;
  caption?: string | null;
}

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;

/**
 * Une image zoomable : pinch + pan + double-tap. Remonte l'etat "zoome" au
 * parent (`onZoomChange`) pour desactiver le scroll horizontal du pager tant
 * qu'on est zoome. Se reinitialise quand la page n'est plus active.
 */
function ZoomableImage({
  image,
  active,
  onZoomChange,
  onRequestClose,
}: {
  image: ViewerImage;
  active: boolean;
  onZoomChange: (zoomed: boolean) => void;
  onRequestClose: () => void;
}) {
  const { width, height } = Dimensions.get('window');
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  const reset = () => {
    'worklet';
    scale.value = withTiming(1);
    savedScale.value = 1;
    tx.value = withTiming(0);
    ty.value = withTiming(0);
    savedTx.value = 0;
    savedTy.value = 0;
  };

  // Reinitialise le zoom quand on quitte cette page.
  useEffect(() => {
    if (!active) {
      scale.value = withTiming(1);
      savedScale.value = 1;
      tx.value = withTiming(0);
      ty.value = withTiming(0);
      savedTx.value = 0;
      savedTy.value = 0;
    }
  }, [active]);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(Math.max(savedScale.value * e.scale, 1), MAX_SCALE);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1) {
        reset();
        runOnJS(onZoomChange)(false);
      } else {
        runOnJS(onZoomChange)(true);
      }
    });

  const pan = Gesture.Pan()
    .enabled(true)
    .onUpdate((e) => {
      if (scale.value <= 1) return;
      tx.value = savedTx.value + e.translationX;
      ty.value = savedTy.value + e.translationY;
    })
    .onEnd(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        reset();
        runOnJS(onZoomChange)(false);
      } else {
        scale.value = withTiming(DOUBLE_TAP_SCALE);
        savedScale.value = DOUBLE_TAP_SCALE;
        runOnJS(onZoomChange)(true);
      }
    });

  // Tap simple : ferme le viewer (seulement si pas zoome).
  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => {
      if (scale.value <= 1) runOnJS(onRequestClose)();
    });

  const composed = Gesture.Race(
    Gesture.Simultaneous(pinch, pan),
    Gesture.Exclusive(doubleTap, singleTap),
  );

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={composed}>
      <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={animStyle}>
          <AuthedImage uri={image.url} style={{ width, height: height * 0.8 }} placeholderBg="#000" />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

/**
 * Visionneuse plein ecran : galerie agrandissable avec pinch-to-zoom, pan,
 * double-tap et swipe horizontal entre les images.
 */
export function ZoomableImageViewer({
  images,
  visible,
  initialIndex = 0,
  onClose,
}: {
  images: ViewerImage[];
  visible: boolean;
  initialIndex?: number;
  onClose: () => void;
}) {
  const { width } = Dimensions.get('window');
  const [index, setIndex] = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);
  const listRef = useRef<FlatList<ViewerImage>>(null);

  useEffect(() => {
    if (visible) {
      setIndex(initialIndex);
      setZoomed(false);
    }
  }, [visible, initialIndex]);

  const renderItem = ({ item, index: i }: ListRenderItemInfo<ViewerImage>) => (
    <ZoomableImage
      image={item}
      active={i === index}
      onZoomChange={setZoomed}
      onRequestClose={onClose}
    />
  );

  const current = images[index];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.96)' }}>
        <FlatList
          ref={listRef}
          data={images}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          horizontal
          pagingEnabled
          scrollEnabled={!zoomed}
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={(e) => {
            const i = Math.round(e.nativeEvent.contentOffset.x / width);
            setIndex(i);
            setZoomed(false);
          }}
        />

        {/* Header : compteur + fermer */}
        <View
          style={{
            position: 'absolute',
            top: 50,
            left: 20,
            right: 20,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }}>
            <Text style={{ color: 'white', fontSize: 13, fontWeight: '600' }}>
              {index + 1} / {images.length}
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="close" size={24} color="white" />
          </Pressable>
        </View>

        {/* Footer : legende */}
        {current?.caption ? (
          <View style={{ position: 'absolute', bottom: 40, left: 24, right: 24 }}>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, textAlign: 'center' }}>
              {current.caption}
            </Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}
