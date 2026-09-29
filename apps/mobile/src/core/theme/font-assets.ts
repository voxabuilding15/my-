/**
 * Android and iOS: the eight fonts are embedded in the app by the expo-font config plugin
 * (app.config.ts) and registered under their file names, so nothing is loaded at runtime.
 * Requiring the .ttf files here as well shipped every font twice (~2.2 MB); see
 * font-assets.web.ts for the web build.
 */
export const FONT_ASSETS: Record<string, number> = {};
