import { useRef, useState } from 'react';
import { View, Text, Pressable, Modal, TextInput, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Button } from '@/components/ui/Button';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';
import { normalizeScannedTracking } from '@/lib/utils/scanNormalize';

const MIN_VALID_LENGTH = 4;
const BARCODE_TYPES = ['qr', 'ean13', 'ean8', 'code128', 'code39', 'code93', 'codabar', 'upc_a', 'upc_e', 'itf14', 'pdf417', 'datamatrix', 'aztec'] as const;

interface ScannerDialogProps {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
  title?: string;
  /** Ferme apres une detection (defaut true). false = scan en chaine. */
  closeOnDetect?: boolean;
  /** Codes deja accumules (scan en chaine) affiches sous la camera. */
  accumulatedCodes?: string[];
  onRemoveAccumulatedCode?: (code: string) => void;
  onClearAccumulated?: () => void;
}

/** Scanner QR + code-barres (expo-camera) avec saisie manuelle de secours (mirror web QRScannerDialog). */
export function ScannerDialog({
  open,
  onClose,
  onDetected,
  title = 'Scanner (QR / code-barres)',
  closeOnDetect = true,
  accumulatedCodes,
  onRemoveAccumulatedCode,
  onClearAccumulated,
}: ScannerDialogProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState('');
  const [torch, setTorch] = useState(false);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const lastAtRef = useRef(0);

  const emit = (raw: string) => {
    // Les QR encodent l'URL publique ("https://.../track?q=TST-ABC") : on extrait
    // le tracking number sec avant de valider la longueur et de remonter.
    const v = normalizeScannedTracking(raw);
    if (v.length < MIN_VALID_LENGTH) return;
    onDetected(v);
    setLastCode(v);
    if (closeOnDetect) onClose();
  };

  const onBarcode = (res: BarcodeScanningResult) => {
    const now = Date.now();
    const v = normalizeScannedTracking(res?.data ?? '');
    // Anti-rebond : ignore meme code < 1.5s ou trop court.
    if (v.length < MIN_VALID_LENGTH) return;
    if (v === lastCode && now - lastAtRef.current < 1500) return;
    lastAtRef.current = now;
    emit(v);
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
        <View style={{ width: 460, maxWidth: '100%', maxHeight: '90%', backgroundColor: colors.white, borderRadius: radius.lg, overflow: 'hidden' }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.gray[200] }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.gray[900] }}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10}><Ionicons name="close" size={22} color={colors.gray[500]} /></Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
            {/* Camera */}
            <View style={{ height: 280, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.gray[900] }}>
              {!permission ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: colors.white }}>Initialisation camera...</Text>
                </View>
              ) : !permission.granted ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg }}>
                  <Ionicons name="camera-outline" size={40} color={colors.gray[400]} />
                  <Text style={{ color: colors.gray[300], textAlign: 'center' }}>Acces camera requis pour scanner.</Text>
                  <Button size="sm" onPress={requestPermission}>Autoriser la camera</Button>
                </View>
              ) : (
                <>
                  <CameraView
                    style={{ flex: 1 }}
                    facing="back"
                    enableTorch={torch}
                    barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] as any }}
                    onBarcodeScanned={onBarcode}
                  />
                  {/* Reticule */}
                  <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                    <View style={{ width: '70%', height: 120, borderWidth: 2, borderColor: colors.primary[400], borderRadius: radius.md }} />
                  </View>
                  <Pressable onPress={() => setTorch((t) => !t)} style={{ position: 'absolute', top: 10, right: 10, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={torch ? 'flash' : 'flash-outline'} size={20} color={colors.white} />
                  </Pressable>
                </>
              )}
            </View>

            {/* Saisie manuelle */}
            <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', height: 44, borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, paddingHorizontal: spacing.md, gap: spacing.sm }}>
                <Ionicons name="keypad-outline" size={18} color={colors.gray[400]} />
                <TextInput
                  value={manual}
                  onChangeText={setManual}
                  onSubmitEditing={() => { emit(manual); setManual(''); }}
                  placeholder="Saisir le code manuellement..."
                  placeholderTextColor={colors.gray[400]}
                  style={{ flex: 1, fontSize: 14, color: colors.gray[900] }}
                />
              </View>
              <Button disabled={manual.trim().length < MIN_VALID_LENGTH} onPress={() => { emit(manual); setManual(''); }}>Valider</Button>
            </View>

            {/* Codes accumules (scan en chaine) */}
            {accumulatedCodes && accumulatedCodes.length > 0 && (
              <View style={{ gap: spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.gray[700] }}>Scannes ({accumulatedCodes.length})</Text>
                  {onClearAccumulated && (
                    <Pressable onPress={onClearAccumulated}><Text style={{ fontSize: 12, color: colors.error }}>Vider</Text></Pressable>
                  )}
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {accumulatedCodes.map((c) => (
                    <View key={c} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary[50], borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4 }}>
                      <Text style={{ fontFamily: 'monospace', fontSize: 12, color: colors.primary[700] }}>{c}</Text>
                      {onRemoveAccumulatedCode && (
                        <Pressable onPress={() => onRemoveAccumulatedCode(c)} hitSlop={6}><Ionicons name="close-circle" size={14} color={colors.primary[400]} /></Pressable>
                      )}
                    </View>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>

          {!closeOnDetect && (
            <View style={{ padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.gray[200] }}>
              <Button onPress={onClose}>Terminer</Button>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
