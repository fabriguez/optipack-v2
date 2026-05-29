import { View, Text, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/lib/theme/colors';
import { parcelStatusLabel } from '@/lib/labels';

const FLOW = ['IN_STOCK', 'LOADING', 'IN_TRANSIT', 'ARRIVED', 'RECEIVED', 'DELIVERED'] as const;
type Status = (typeof FLOW)[number];

interface Props {
  current: string;
}

export function StatusStepper({ current }: Props) {
  const currentIdx = FLOW.indexOf(current as Status);
  // Si statut inconnu (ex: LOST), affiche tout comme non-atteint.
  const idx = currentIdx < 0 ? -1 : currentIdx;

  return (
    <View style={{ paddingVertical: 8 }}>
      {FLOW.map((step, i) => {
        const reached = i < idx;
        const isCurrent = i === idx;
        const future = i > idx;
        const isLast = i === FLOW.length - 1;
        return (
          <View key={step} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            {/* Rail + dot */}
            <View style={{ alignItems: 'center', width: 36 }}>
              <View style={{ position: 'relative', width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: reached ? colors.primary[500] : isCurrent ? colors.primary[50] : colors.white,
                    borderWidth: future ? 2 : 0,
                    borderColor: colors.gray[300],
                    borderStyle: future ? 'dashed' : 'solid',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {reached && <Ionicons name="checkmark" size={14} color={colors.white} />}
                  {isCurrent && (
                    <ActivityIndicator
                      size="small"
                      color={colors.primary[600]}
                      style={{ position: 'absolute', top: -7, left: -7, right: -7, bottom: -7 }}
                    />
                  )}
                </View>
              </View>
              {!isLast && (
                <View
                  style={{
                    width: future ? 0 : 2,
                    borderLeftWidth: future ? 2 : 0,
                    borderLeftColor: colors.gray[300],
                    borderStyle: future ? 'dashed' : 'solid',
                    backgroundColor: reached ? colors.primary[500] : 'transparent',
                    height: 28,
                    marginVertical: 2,
                  }}
                />
              )}
            </View>
            {/* Label */}
            <View style={{ flex: 1, paddingTop: 4, paddingBottom: isLast ? 0 : 18 }}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: isCurrent ? '700' : reached ? '600' : '500',
                  color: future ? colors.gray[400] : isCurrent ? colors.primary[700] : colors.gray[900],
                }}
              >
                {parcelStatusLabel(step)}
              </Text>
              {isCurrent && (
                <Text style={{ fontSize: 11, color: colors.primary[600], marginTop: 2 }}>En cours</Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}
