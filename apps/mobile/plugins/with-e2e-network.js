/**
 * End-to-end test builds only (E2E_BUILD=1): lets the app reach the local Supabase stack over
 * plain HTTP at the emulator's host address (10.0.2.2). Never active in store builds, which
 * keep Android's default of HTTPS only.
 */
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withE2eNetwork(config) {
  if (process.env.E2E_BUILD !== '1') return config;
  return withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application?.[0];
    if (application) application.$['android:usesCleartextTraffic'] = 'true';
    return mod;
  });
};
