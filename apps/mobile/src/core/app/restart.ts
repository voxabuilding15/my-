import * as Updates from 'expo-updates';
import { DevSettings } from 'react-native';

/** Restarts the JS app (needed after switching between LTR and RTL layouts). */
export async function restartApp(): Promise<void> {
  if (__DEV__) {
    DevSettings.reload();
    return;
  }
  await Updates.reloadAsync();
}
