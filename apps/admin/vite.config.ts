import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

/**
 * Cloudflare Pages security headers, generated at build time so the Content Security Policy
 * names the exact Supabase and Sentry origins this build talks to.
 */
function securityHeaders(env: Record<string, string>): Plugin {
  const origin = (url: string | undefined) => (url ? new URL(url).origin : '');
  const supabase = origin(env.VITE_SUPABASE_URL);
  const sentry = env.VITE_SENTRY_DSN ? `https://${new URL(env.VITE_SENTRY_DSN).host}` : '';
  const connect = ["'self'", supabase, supabase.replace(/^https:/, 'wss:'), sentry].filter(Boolean);
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    // Charts set inline styles.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${connect.join(' ')}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
  const headers = `/*
  Content-Security-Policy: ${csp}
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  Cross-Origin-Opener-Policy: same-origin
  X-Robots-Tag: noindex, nofollow

/assets/*
  Cache-Control: public, max-age=31536000, immutable
`;
  return {
    name: 'studexa-security-headers',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '_headers', source: headers });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  return {
    plugins: [react(), tailwindcss(), securityHeaders(env)],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@studexa/shared': fileURLToPath(
          new URL('../../packages/shared/src/index.ts', import.meta.url),
        ),
      },
    },
    // Hidden source maps: uploaded to Sentry, never referenced by the served bundle.
    build: { sourcemap: 'hidden', target: 'es2022' },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: false,
    },
  };
});
