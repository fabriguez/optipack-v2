import { useState, type ReactNode } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

export interface TabItem {
  value: string;
  label: string;
  icon?: ReactNode;
  content: ReactNode;
}

/** Onglets avec barre scrollable au drag (mirror web AppTabs). */
export function AppTabs({ tabs, defaultValue }: { tabs: TabItem[]; defaultValue?: string }) {
  const [active, setActive] = useState(defaultValue ?? tabs[0]?.value);
  const current = tabs.find((t) => t.value === active) ?? tabs[0];

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
        contentContainerStyle={{ gap: 6, padding: 5 }}
        style={{ backgroundColor: colors.gray[100], borderRadius: radius.lg, flexGrow: 0 }}
      >
        {tabs.map((t) => {
          const isActive = t.value === active;
          return (
            <Pressable
              key={t.value}
              onPress={() => setActive(t.value)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingVertical: 9,
                paddingHorizontal: spacing.lg,
                borderRadius: radius.md,
                backgroundColor: isActive ? colors.white : 'transparent',
                shadowColor: isActive ? colors.black : 'transparent',
                shadowOpacity: isActive ? 0.06 : 0,
                shadowRadius: 3,
                shadowOffset: { width: 0, height: 1 },
                elevation: isActive ? 1 : 0,
              }}
            >
              {t.icon}
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: isActive ? '600' : '500',
                  color: isActive ? colors.primary[700] : colors.gray[500],
                }}
              >
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={{ marginTop: spacing.xl, flex: 1 }}>{current?.content}</View>
    </View>
  );
}
