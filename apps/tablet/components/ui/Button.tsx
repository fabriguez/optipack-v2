import { Pressable, Text, ActivityIndicator, type PressableProps } from 'react-native';
import { colors } from '@/lib/theme/colors';
import { radius } from '@/lib/theme/spacing';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
type Size = 'sm' | 'md' | 'lg';

const variantStyles: Record<Variant, { bg: string; text: string; border?: string }> = {
  primary: { bg: colors.gray[900], text: colors.white },
  secondary: { bg: colors.gray[100], text: colors.gray[900] },
  outline: { bg: 'transparent', text: colors.gray[700], border: colors.gray[300] },
  ghost: { bg: 'transparent', text: colors.gray[600] },
  destructive: { bg: colors.error, text: colors.white },
};

const sizeStyles: Record<Size, { height: number; paddingH: number; fontSize: number }> = {
  sm: { height: 34, paddingH: 12, fontSize: 12 },
  md: { height: 42, paddingH: 16, fontSize: 14 },
  lg: { height: 50, paddingH: 24, fontSize: 16 },
};

interface ButtonProps extends PressableProps {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: string;
}

export function Button({ variant = 'primary', size = 'md', loading, disabled, children, ...props }: ButtonProps) {
  const v = variantStyles[variant];
  const s = sizeStyles[size];

  return (
    <Pressable
      disabled={disabled || loading}
      style={({ pressed }) => ({
        backgroundColor: v.bg,
        height: s.height,
        paddingHorizontal: s.paddingH,
        borderRadius: radius.md,
        borderWidth: v.border ? 1 : 0,
        borderColor: v.border,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        opacity: disabled || loading ? 0.5 : pressed ? 0.8 : 1,
      })}
      {...props}
    >
      {loading && <ActivityIndicator size="small" color={v.text} />}
      <Text style={{ fontSize: s.fontSize, fontWeight: '600', color: v.text }}>{children}</Text>
    </Pressable>
  );
}
