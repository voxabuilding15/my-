/**
 * Expo's default preset, plus: release bundles drop console.log/info/debug/warn/trace (they
 * would reach the device log, where other apps with log access could read them). console.error
 * is kept for genuine failures; crash reports go to Sentry either way.
 *
 * "Release" is Metro's own flag (dev = false), so it holds for `expo export`, Gradle release
 * builds and EAS alike, whatever NODE_ENV is.
 */
module.exports = function babelConfig(api) {
  const release = api.caller((caller) => caller?.isDev === false) || api.env('production');
  return {
    presets: ['babel-preset-expo'],
    plugins: release ? [['transform-remove-console', { exclude: ['error'] }]] : [],
  };
};
