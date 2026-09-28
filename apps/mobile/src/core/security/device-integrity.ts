import * as Device from 'expo-device';
import { Platform } from 'react-native';

export type DeviceIntegrity = 'ok' | 'rooted' | 'unknown';

/**
 * Best-effort root/jailbreak signal. Used only to inform the user and as an anonymous risk
 * signal — never to block: rooted devices are common among legitimate users, and the security
 * of their data is guaranteed server-side (RLS, server-enforced quotas), not by the device.
 * Emulators are skipped because they commonly report as rooted.
 */
export async function checkDeviceIntegrity(): Promise<DeviceIntegrity> {
  if (Platform.OS === 'web' || !Device.isDevice) return 'unknown';
  try {
    return (await Device.isRootedExperimentalAsync()) ? 'rooted' : 'ok';
  } catch {
    return 'unknown';
  }
}
