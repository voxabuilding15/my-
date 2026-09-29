import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { ThemeProvider } from '@/core/theme';

import { CodeInput } from '../code-input';

function renderCode() {
  render(
    <ThemeProvider>
      <CodeInput testID="code" label="Verification code" value="12" onChange={() => {}} />
    </ThemeProvider>,
  );
  return screen.getByTestId('code');
}

describe('CodeInput', () => {
  // Regression: the input was 1×1 with opacity 0, so Maestro could not find `code` on a device
  // and TalkBack had nothing to focus. It must cover the boxes while staying invisible.
  it('is one input covering the whole row, found by test ID and accessibility label', () => {
    const input = renderCode();
    expect(screen.getByLabelText('Verification code')).toBe(input);

    const style = StyleSheet.flatten(input.props.style);
    expect(style).toMatchObject({ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 });
    expect(style.width).toBeUndefined();
    expect(style.height).toBeUndefined();
    expect(style.opacity ?? 1).toBe(1);
  });

  it('stays visually invisible: transparent text, no caret or underline', () => {
    const input = renderCode();
    expect(StyleSheet.flatten(input.props.style)).toMatchObject({
      color: 'transparent',
      backgroundColor: 'transparent',
    });
    expect(input.props.caretHidden).toBe(true);
    expect(input.props.underlineColorAndroid).toBe('transparent');
  });

  it('shows the digits in the boxes and hides the boxes from screen readers', () => {
    renderCode();
    expect(screen.getByText('1', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByText('1')).toBeNull();
  });
});
