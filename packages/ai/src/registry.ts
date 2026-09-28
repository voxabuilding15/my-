import { createAnthropicProvider } from './anthropic-provider.ts';
import type { AiProvider, ProviderName } from './types.ts';

export type ProviderCredentials = { anthropicApiKey?: string | undefined };

/** Provider lookup by route. Adding OpenAI or Gemini = one factory here + a ProviderName. */
export function createProviderRegistry(credentials: ProviderCredentials) {
  const cache = new Map<ProviderName, AiProvider>();
  return (name: ProviderName): AiProvider => {
    const existing = cache.get(name);
    if (existing) return existing;
    switch (name) {
      case 'anthropic': {
        if (!credentials.anthropicApiKey) throw new Error('ANTHROPIC_API_KEY is not configured');
        const provider = createAnthropicProvider({ apiKey: credentials.anthropicApiKey });
        cache.set(name, provider);
        return provider;
      }
    }
  };
}
