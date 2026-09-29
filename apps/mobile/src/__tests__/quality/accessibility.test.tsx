/**
 * Accessibility audit of every screen (demo data, English and Arabic): whatever can be tapped
 * must be announced by TalkBack with a name and a role, and be large enough to hit (48 dp,
 * Material; hitSlop counts). Colour contrast is checked separately from the theme tokens.
 */
import { screen, waitFor } from 'expo-router/testing-library';
import type { ReactTestInstance } from 'react-test-renderer';
import { StyleSheet } from 'react-native';

import { renderApp, signedInApp } from '@/test-utils/render-app';

jest.setTimeout(20_000);

const SIGNED_IN_SCREENS = [
  '/',
  '/documents',
  '/documents/doc-biology',
  '/documents/doc-biology/read',
  '/chat',
  '/chat/conv-biology',
  '/study',
  '/profile',
  '/flashcards/review',
  '/quizzes/quiz-biology',
  '/notes/note-1',
  '/bookmarks',
  '/translator',
  '/settings',
  '/paywall',
  '/ai/summarize?documentId=doc-biology',
  '/edit-profile',
  '/change-password',
  '/delete-account',
];

const SIGNED_OUT_SCREENS = ['/welcome', '/sign-in', '/sign-up', '/forgot-password'];

const MIN_TARGET_DP = 48;

type Finding = { screen: string; problem: string; element: string };

function textOf(node: ReactTestInstance | string): string {
  if (typeof node === 'string') return node;
  return node.children.map((child) => textOf(child as ReactTestInstance | string)).join(' ');
}

function describe_(node: ReactTestInstance): string {
  const p = node.props as Record<string, unknown>;
  return String(
    p.testID ?? p.accessibilityLabel ?? (textOf(node).trim().slice(0, 40) || node.type),
  );
}

/** Host views that react to taps (Pressable, Touchable*, Button all render one). */
function tappables(root: ReactTestInstance): ReactTestInstance[] {
  return root.findAll(
    (node) =>
      typeof node.type === 'string' &&
      (typeof node.props.onClick === 'function' ||
        typeof node.props.onResponderRelease === 'function') &&
      node.props.accessible !== false &&
      node.props.accessibilityElementsHidden !== true &&
      node.props.importantForAccessibility !== 'no-hide-descendants',
  );
}

function audit(route: string): Finding[] {
  const findings: Finding[] = [];
  for (const node of tappables(screen.root)) {
    const props = node.props as Record<string, unknown>;
    const label = props.accessibilityLabel ?? props['aria-label'];
    const name = typeof label === 'string' && label.trim() ? label : textOf(node).trim();
    const role = props.accessibilityRole ?? props.role;
    const element = describe_(node);
    if (!name) findings.push({ screen: route, problem: 'no accessible name', element });
    if (!role) findings.push({ screen: route, problem: 'no role', element });

    const style = StyleSheet.flatten(props.style as never) as Record<string, unknown> | undefined;
    const slop = props.hitSlop as number | Record<string, number> | undefined;
    const extra = (a: 'top' | 'left', b: 'bottom' | 'right') =>
      typeof slop === 'number' ? slop * 2 : slop ? (slop[a] ?? 0) + (slop[b] ?? 0) : 0;
    const checks = [
      ['height', style?.height ?? style?.minHeight, extra('top', 'bottom')],
      ['width', style?.width ?? style?.minWidth, extra('left', 'right')],
    ] as const;
    for (const [dimension, size, slopTotal] of checks) {
      if (typeof size === 'number' && size + slopTotal < MIN_TARGET_DP) {
        findings.push({
          screen: route,
          problem: `${dimension} ${size}+${slopTotal} < ${MIN_TARGET_DP}dp`,
          element,
        });
      }
    }
  }
  return findings;
}

/** Waits until the screen has rendered its interactive content (works with fake timers). */
async function settle() {
  await waitFor(() => expect(tappables(screen.root).length).toBeGreaterThan(0));
}

describe('accessibility audit', () => {
  const cases = (['en', 'ar'] as const).flatMap((locale) =>
    SIGNED_IN_SCREENS.map((route) => [route, locale] as const),
  );

  it.each(cases)('%s (%s) is usable with TalkBack', async (route, locale) => {
    await signedInApp({ initialUrl: route, locale });
    await settle();
    expect(audit(route)).toEqual([]);
  });

  it.each(SIGNED_OUT_SCREENS)('%s (signed out) is usable with TalkBack', async (route) => {
    renderApp({ initialUrl: route });
    await settle();
    expect(audit(route)).toEqual([]);
  });
});
