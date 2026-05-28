import { ToastAndroid, Platform, Alert } from 'react-native';

function show(message: string, kind: 'success' | 'error' | 'info' = 'info') {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
    return;
  }
  if (kind === 'error') {
    Alert.alert('Erreur', message);
  } else {
    // Light non-blocking on iOS via brief alert; could be replaced by a banner later.
    Alert.alert('', message);
  }
}

export const toast = {
  success: (m: string) => show(m, 'success'),
  error: (m: string) => show(m, 'error'),
  info: (m: string) => show(m, 'info'),
  message: (m: string) => show(m, 'info'),
};
