import {
  GoogleSignin,
  isCancelledResponse,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { AppError } from '@studexa/shared';

import { env } from '@/core/config/env';

let configured = false;

function configure() {
  if (configured) return;
  if (!env.googleWebClientId)
    throw new AppError('unknown', 'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is not set');
  GoogleSignin.configure({
    webClientId: env.googleWebClientId,
    ...(env.googleIosClientId ? { iosClientId: env.googleIosClientId } : {}),
    scopes: ['email', 'profile'],
  });
  configured = true;
}

/** Shows the native account picker (Credential Manager on Android) and returns a Google ID token. */
export async function getGoogleIdToken(): Promise<string> {
  configure();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (isCancelledResponse(response)) throw new AppError('sign_in_cancelled');
    const token = response.data.idToken;
    if (!token) throw new AppError('unknown', 'Google did not return an ID token');
    return token;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (isErrorWithCode(error)) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) throw new AppError('sign_in_cancelled');
      if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE)
        throw new AppError('play_services_unavailable');
    }
    throw new AppError('unknown', String(error));
  }
}

/** Clears the cached Google account so the picker shows again next time. */
export async function signOutOfGoogle(): Promise<void> {
  if (!configured) return;
  await GoogleSignin.signOut().catch(() => undefined);
}
