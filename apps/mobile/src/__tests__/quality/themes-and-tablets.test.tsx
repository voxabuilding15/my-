/**
 * Light/dark themes and tablet layouts.
 * - Contrast: every text/background pairing the UI uses meets WCAG 2.2 AA in both themes.
 * - Themes: no screen hard-codes colours, so dark mode can never show light-mode colours.
 * - Tablets: size classes switch to the navigation rail and multi-column lists, and every
 *   screen renders at tablet sizes in both orientations.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { FlashList } from '@shopify/flash-list';
import { screen, waitFor } from 'expo-router/testing-library';
import * as ReactNative from 'react-native';

import { layoutFor } from '@/core/layout/use-layout';
import { palettes } from '@/core/theme/tokens';
import { signedInApp } from '@/test-utils/render-app';

jest.setTimeout(30_000);

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

type Token = keyof (typeof palettes)['light'];
/** [foreground, background, minimum]: 4.5 for body text, 3 for large text and UI shapes. */
const PAIRS: [Token, Token, number][] = [
  ['text', 'background', 4.5],
  ['text', 'surface', 4.5],
  ['text', 'surfaceContainer', 4.5],
  ['text', 'surfaceElevated', 4.5],
  ['textSecondary', 'background', 4.5],
  ['textSecondary', 'surface', 4.5],
  ['primaryText', 'background', 4.5],
  ['primaryText', 'surface', 4.5],
  ['primaryText', 'primarySubtle', 4.5],
  ['onPrimary', 'primary', 4.5],
  ['onPrimary', 'brandGradientEnd', 4.5],
  ['danger', 'background', 4.5],
  ['danger', 'dangerSubtle', 4.5],
  ['success', 'background', 4.5],
  ['success', 'successSubtle', 4.5],
  ['warning', 'warningSubtle', 4.5],
  ['text', 'warningSubtle', 4.5], // offline banner
  ['streak', 'streakSubtle', 4.5],
  ['flashcards', 'flashcardsSubtle', 4.5],
  ['quizzes', 'quizzesSubtle', 4.5],
  ['notes', 'notesSubtle', 4.5],
  ['chat', 'chatSubtle', 4.5],
  ['primary', 'background', 3], // buttons and focus rings (UI components)
];

describe('colour contrast (WCAG 2.2 AA)', () => {
  it.each(['light', 'dark'] as const)('every text colour is legible in the %s theme', (scheme) => {
    const palette = palettes[scheme] as Record<Token, string>;
    const failures = PAIRS.map(([fg, bg, min]) => ({
      pair: `${fg} on ${bg}`,
      ratio: +contrast(palette[fg], palette[bg]).toFixed(2),
      min,
    })).filter((r) => r.ratio < r.min);
    expect(failures).toEqual([]);
  });
});

describe('theming', () => {
  const root = join(__dirname, '..', '..');
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return name === '__tests__' ? [] : files(path);
      return /\.tsx?$/.test(name) ? [path] : [];
    });

  it('screens and components take colours from the theme, never hard-coded values', () => {
    const offenders = [
      ...files(join(root, 'features')),
      ...files(join(root, 'shared')),
      ...files(join(root, 'app')),
    ].flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, i) => ({ file: file.slice(root.length + 1), line: i + 1, text: line.trim() }))
        .filter(
          ({ text }) => /['"`]#[0-9a-fA-F]{3,8}['"`]|rgba?\(/.test(text) && !text.startsWith('//'),
        ),
    );
    expect(offenders).toEqual([]);
  });
});

describe('tablet layouts', () => {
  it('uses the navigation rail and more columns as the window grows', () => {
    expect(layoutFor(390, 844)).toMatchObject({ sizeClass: 'compact', useRail: false, columns: 1 }); // phone
    expect(layoutFor(800, 1280)).toMatchObject({ sizeClass: 'medium', useRail: true, columns: 2 }); // tablet portrait
    expect(layoutFor(1280, 800)).toMatchObject({
      sizeClass: 'expanded',
      useRail: true,
      columns: 3,
    }); // tablet landscape
    expect(layoutFor(1280, 800).contentMaxWidth).toBeLessThanOrEqual(1040);
  });

  const SCREENS = [
    '/',
    '/documents',
    '/documents/doc-biology/read',
    '/chat/conv-biology',
    '/study',
    '/settings',
  ];
  const SIZES = [
    { name: 'tablet portrait', width: 800, height: 1280 },
    { name: 'tablet landscape', width: 1280, height: 800 },
  ];

  const atSize = (size: { width: number; height: number }) =>
    jest
      .spyOn(ReactNative, 'useWindowDimensions')
      .mockReturnValue({ width: size.width, height: size.height, scale: 2, fontScale: 1 });

  afterEach(() => jest.restoreAllMocks());

  it.each(SIZES.flatMap((size) => SCREENS.map((route) => [size.name, route, size] as const)))(
    '%s: %s renders its content',
    async (_name, route, size) => {
      atSize(size);
      await signedInApp({ initialUrl: route });
      await waitFor(() => expect(screen.getAllByRole('button').length).toBeGreaterThan(0));
    },
  );

  it('the library shows documents in two columns on tablets', async () => {
    atSize(SIZES[1]!);
    await signedInApp({ initialUrl: '/documents' });
    await screen.findByTestId('document-doc-biology');
    expect(screen.UNSAFE_getByType(FlashList).props.numColumns).toBe(2);
  });
});
