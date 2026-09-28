import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { DEMO, renderApp } from '@/test-utils/render-app';

import { MOCK_EMAIL_CODE, MockAuthRepository } from '../data/mock-auth-repository';

jest.setTimeout(20_000);

async function signIn(email = DEMO.email, password = DEMO.password) {
  fireEvent.press(await screen.findByTestId('go-sign-in'));
  fireEvent.changeText(await screen.findByTestId('email'), email);
  fireEvent.changeText(screen.getByTestId('password'), password);
  fireEvent.press(screen.getByTestId('sign-in-submit'));
}

describe('authentication flows', () => {
  it('guards the app: signed-out users land on the welcome screen', async () => {
    const app = renderApp();
    expect(await screen.findByText('Study smarter with AI')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/welcome');
  });

  it('signs in with email and password and reaches home', async () => {
    const app = renderApp();
    await signIn();
    expect(await screen.findByText('Ready to learn?')).toBeOnTheScreen();
    expect(screen.getByText('Hi Demo,')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/');
  });

  it('shows a clear error for wrong credentials', async () => {
    renderApp();
    await signIn(DEMO.email, 'wrong-password');
    expect(await screen.findByText('Incorrect email or password.')).toBeOnTheScreen();
  });

  it('signs up, requires consent and a strong password, then verifies the email', async () => {
    const app = renderApp();
    fireEvent.press(await screen.findByTestId('go-sign-up'));
    fireEvent.changeText(await screen.findByTestId('name'), 'Lina');
    fireEvent.changeText(screen.getByTestId('email'), 'lina@example.com');
    fireEvent.changeText(screen.getByTestId('password'), 'weak');
    fireEvent.press(screen.getByTestId('sign-up-submit'));
    expect(
      await screen.findByText('Please confirm your age and accept the terms to continue.'),
    ).toBeOnTheScreen();
    expect(screen.getByText('At least 10 characters')).toBeOnTheScreen();

    fireEvent.changeText(screen.getByTestId('password'), 'Str0ngPassword');
    fireEvent.press(screen.getByTestId('consent'));
    fireEvent.press(screen.getByTestId('sign-up-submit'));

    expect(await screen.findByText('Verify your email')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/verify-email');

    fireEvent.changeText(screen.getByTestId('code'), '000000');
    expect(await screen.findByText('That code is incorrect. Attempts left: 4')).toBeOnTheScreen();

    fireEvent.changeText(screen.getByTestId('code'), MOCK_EMAIL_CODE);
    expect(
      await screen.findByText('Email verified. Every AI feature is now unlocked.'),
    ).toBeOnTheScreen();
  });

  it('prompts unverified users to verify from home', async () => {
    const repository = new MockAuthRepository(0);
    await repository.signUp({
      email: 'u@example.com',
      password: 'Str0ngPassword',
      displayName: 'U',
    });
    renderApp({ repository });
    expect(await screen.findByTestId('verify-banner')).toBeOnTheScreen();
  });

  it('resets a forgotten password with a 6-digit code', async () => {
    const app = renderApp();
    fireEvent.press(await screen.findByTestId('go-sign-in'));
    fireEvent.changeText(await screen.findByTestId('email'), DEMO.email);
    fireEvent.press(screen.getByText('Forgot password?'));
    fireEvent.press(await screen.findByTestId('send-code'));

    expect(await screen.findByText('Enter the code')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/reset-password');
    fireEvent.changeText(screen.getByTestId('code'), MOCK_EMAIL_CODE);

    fireEvent.changeText(await screen.findByTestId('new-password'), 'BrandNew1pass');
    fireEvent.press(screen.getByTestId('update-password'));
    expect(
      await screen.findByText('Password updated. Sign in with your new password.'),
    ).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('go-sign-in'));
    fireEvent.changeText(await screen.findByTestId('email'), DEMO.email);
    fireEvent.changeText(screen.getByTestId('password'), 'BrandNew1pass');
    fireEvent.press(screen.getByTestId('sign-in-submit'));
    expect(await screen.findByText('Ready to learn?')).toBeOnTheScreen();
  });

  it('deletes the account after re-authentication when the sign-in is not recent', async () => {
    let now = 1_000_000;
    const repository = new MockAuthRepository(0, () => now);
    await repository.signInWithPassword(DEMO.email, DEMO.password);
    const app = renderApp({ repository, initialUrl: '/delete-account' });

    now += 11 * 60_000;
    fireEvent.press(await screen.findByTestId('confirm-delete'));
    fireEvent.press(screen.getByTestId('delete-submit'));

    expect(await screen.findByText('Confirm it is you')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId('reauth-password'), DEMO.password);
    fireEvent.press(screen.getByTestId('reauth-submit'));

    expect(await screen.findByText('Your account has been deleted.')).toBeOnTheScreen();
    await waitFor(() => expect(app.getPathname()).toBe('/welcome'));
    await expect(repository.signInWithPassword(DEMO.email, DEMO.password)).rejects.toMatchObject({
      code: 'invalid_credentials',
    });
  });

  it('signs out from the profile', async () => {
    const repository = new MockAuthRepository(0);
    await repository.signInWithPassword(DEMO.email, DEMO.password);
    const app = renderApp({ repository, initialUrl: '/profile' });
    fireEvent.press(await screen.findByTestId('sign-out'));
    expect(await screen.findByText('Study smarter with AI')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/welcome');
  });

  it('changes the password while signed in, then signs out everywhere', async () => {
    const repository = new MockAuthRepository(0);
    await repository.signInWithPassword(DEMO.email, DEMO.password);
    const app = renderApp({ repository, initialUrl: '/profile' });

    fireEvent.press(await screen.findByText('Change password'));
    expect(await screen.findByText('Change your password')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('send-code'));
    fireEvent.changeText(await screen.findByTestId('code'), MOCK_EMAIL_CODE);
    fireEvent.changeText(await screen.findByTestId('new-password'), 'Changed1Password');
    fireEvent.press(screen.getByTestId('update-password'));
    fireEvent.press(await screen.findByTestId('go-sign-in'));

    expect(await screen.findByText('Study smarter with AI')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/welcome');
    await expect(
      repository.signInWithPassword(DEMO.email, 'Changed1Password'),
    ).resolves.toMatchObject({
      email: DEMO.email,
    });
  });
});
