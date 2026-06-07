import { useEffect, useRef } from 'react';
import { Animated, View, type ViewStyle, type StyleProp } from 'react-native';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

/** Bloc anime reutilisable (mirror web AppSkeleton). */
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={[{ backgroundColor: colors.gray[200], borderRadius: radius.md, opacity }, style]}
    />
  );
}

/** Skeleton de tableau : header + lignes. */
export function TableSkeleton({ rows = 6, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', gap: spacing.lg, paddingVertical: spacing.md }}>
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} style={{ height: 12, flex: 1 }} />
        ))}
      </View>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} style={{ height: 48, width: '100%', borderRadius: radius.md }} />
      ))}
    </View>
  );
}
