import { ToastAndroid, Platform, Alert } from 'react-native';

function show(message: string, kind: 'success' | 'error' | 'info' = 'info') {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
    return;
  }
  if (kind === 'error') {
    Alert.alert('Erreur', message);
  } else {
    Alert.alert('', message);
  }
}

export const toast = {
  success: (m: string) => show(m, 'success'),
  error: (m: string) => show(m, 'error'),
  info: (m: string) => show(m, 'info'),
};
