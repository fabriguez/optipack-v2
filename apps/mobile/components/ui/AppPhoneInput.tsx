import { useState } from 'react';
import { View, Text, Image } from 'react-native';
import PhoneInput, { type ICountry } from 'react-native-international-phone-number';
import { colors, radius, spacing } from '@/lib/theme/colors';

/**
 * Drapeau PNG haute resolution depuis flagcdn.com (parite avec web).
 * Evite les emojis qui ne sont pas rendus uniformement entre OS Android/iOS.
 */
function FlagImage({ country, size = 26 }: { country: ICountry; size?: number }) {
  const code = country.cca2?.toLowerCase();
  if (!code) return null;
  return (
    <Image
      source={{
        uri: `https://flagcdn.com/w80/${code}.png`,
      }}
      style={{ width: size, height: Math.round(size * 0.73), borderRadius: 2, marginLeft: 4 }}
      resizeMode="cover"
    />
  );
}

/** Item utilise dans la liste du modal de selection pays : drapeau image
 *  + indicatif + nom de pays. Remplace le rendu par defaut a base d'emoji. */
function ModalCountryItem({ country }: { country: ICountry }) {
  const name =
    typeof country.name === 'string'
      ? country.name
      : (country.name as any)?.common ?? country.cca2 ?? '';
  const callingCode = `${country.idd?.root ?? ''}${country.idd?.suffixes?.[0] ?? ''}`;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 10,
        paddingHorizontal: 16,
      }}
    >
      <FlagImage country={country} size={28} />
      <Text style={{ flex: 1, fontSize: 14, color: colors.gray[900] }}>{name}</Text>
      {!!callingCode && (
        <Text style={{ fontSize: 13, color: colors.gray[500] }}>{callingCode}</Text>
      )}
    </View>
  );
}

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
        customFlag={(country: ICountry) => <FlagImage country={country} />}
        modalCountryItemComponent={(country: ICountry) => <ModalCountryItem country={country} />}
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
