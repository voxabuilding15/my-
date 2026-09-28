jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));
require('react-native-reanimated').setUpTests();

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);

jest.mock('expo-sqlite/kv-store', () => {
  const store = new Map<string, string>();
  return {
    Storage: {
      getItemSync: (key: string) => store.get(key) ?? null,
      setItemSync: (key: string, value: string) => void store.set(key, value),
      removeItemSync: (key: string) => store.delete(key),
    },
  };
});

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
  },
  isCancelledResponse: () => false,
  isErrorWithCode: () => false,
  statusCodes: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
  },
}));

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  setUser: jest.fn(),
  captureException: jest.fn(),
  wrap: (component: unknown) => component,
}));

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    isConfigured: jest.fn(async () => false),
    logIn: jest.fn(),
    getOfferings: jest.fn(async () => ({ current: null })),
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn(),
  },
  PACKAGE_TYPE: { ANNUAL: 'ANNUAL', MONTHLY: 'MONTHLY' },
}));

jest.mock('expo-file-system', () => ({
  File: jest.fn(),
  UploadTask: jest.fn(),
  UploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
}));
