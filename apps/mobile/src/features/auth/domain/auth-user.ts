export type AuthProviderId = 'email' | 'google' | 'apple';
/** Providers that sign in through a native SDK (Apple is reserved for the iOS release). */
export type SocialProviderId = Exclude<AuthProviderId, 'email'>;

export type AuthUser = {
  id: string;
  email: string;
  displayName: string | null;
  emailVerified: boolean;
  providers: AuthProviderId[];
};

export const hasPassword = (user: AuthUser): boolean => user.providers.includes('email');
