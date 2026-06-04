import { useState } from 'react';
import { View, Text } from 'react-native';
import PhoneInput, { type ICountry } from 'react-native-international-phone-number';
import { colors, radius, spacing } from '@/lib/theme/colors';

interface AppPhoneInputProps {
  label?: string;
  error?: string;
  /** Numero international complet (ex: "+237 6XX XX XX XX"). Mis a jour via onChange. */
  value: string;
  onChange: (fullPhone: string) => void;
  defaultCountry?: string;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Champ telephone international avec selecteur pays + drapeau (parite avec
 * l'AppPhoneInput web). Etat pays gere localement ; la valeur exposee au
 * parent est le format international concatene "<callingCode> <national>".
 */
export function AppPhoneInput({
  label,
  error,
  value,
  onChange,
  defaultCountry = 'CM',
  placeholder,
  disabled,
}: AppPhoneInputProps) {
  const [selectedCountry, setSelectedCountry] = useState<ICountry | null>(null);

  // Extrait la portion nationale a partir de la valeur courante : on
  // soustrait le calling code si present (sinon laisse tel quel pour
  // l'init).
  const callingCode = selectedCountry
    ? `${selectedCountry.idd.root}${selectedCountry.idd.suffixes?.[0] ?? ''}`
    : '';
  const national = callingCode && value.startsWith(callingCode)
    ? value.slice(callingCode.length).trim()
    : value;

  const buildFull = (cc: string, nat: string) => {
    const ccTrim = cc.replace(/\s/g, '');
    const natTrim = nat.replace(/^\+?\d+\s?/, '').trim();
    return ccTrim ? `${ccTrim} ${natTrim}`.trim() : natTrim;
  };

  return (
    <View style={{ gap: 6 }}>
      {label && <Text style={{ fontSize: 13, fontWeight: '500', color: colors.gray[700] }}>{label}</Text>}
      <PhoneInput
        value={national}
        defaultCountry={defaultCountry as any}
        selectedCountry={selectedCountry}
        onChangePhoneNumber={(phoneNumber) => onChange(buildFull(callingCode, phoneNumber))}
        onChangeSelectedCountry={(country) => {
          setSelectedCountry(country);
          const newCc = `${country.idd.root}${country.idd.suffixes?.[0] ?? ''}`;
          onChange(buildFull(newCc, national));
        }}
        disabled={disabled}
        phoneInputStyles={{
          container: {
            height: 48,
            borderWidth: 1,
            borderColor: error ? colors.error : colors.gray[300],
            borderRadius: radius.md,
            backgroundColor: colors.white,
          },
          flagContainer: {
            backgroundColor: 'transparent',
          },
          input: {
            color: colors.gray[900],
            fontSize: 15,
            paddingHorizontal: spacing.md,
          },
          callingCode: {
            color: colors.gray[700],
            fontSize: 15,
          },
        }}
        placeholder={placeholder}
      />
      {error && <Text style={{ fontSize: 11, color: colors.error }}>{error}</Text>}
    </View>
  );
}
