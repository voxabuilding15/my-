import { ShieldCheck } from 'lucide-react';
import { useEffect, useState, type FormEvent, type PropsWithChildren } from 'react';

import { Button, Field, Input } from '@/components/ui';
import { useSupabase } from '@/lib/api';

import { useAuth } from './auth-context';

function AuthCard({
  title,
  subtitle,
  children,
}: PropsWithChildren<{ title: string; subtitle: string }>) {
  return (
    <main className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-2 text-brand">
          <ShieldCheck className="size-6" aria-hidden />
          <span className="font-semibold">Studexa Admin</span>
        </div>
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mt-1 mb-5 text-sm text-muted">{subtitle}</p>
        {children}
      </div>
    </main>
  );
}

const ErrorText = ({ message }: { message: string | null }) =>
  message ? (
    <p role="alert" className="text-sm text-bad">
      {message}
    </p>
  ) : null;

export function SignInScreen() {
  const client = useSupabase();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: signInError } = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    // One message for every failure: no hint whether the account exists.
    if (signInError) setError('Invalid email or password.');
  };

  return (
    <AuthCard
      title="Sign in"
      subtitle="Staff accounts only. Two-factor authentication is required."
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Email">
          <Input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <ErrorText message={error} />
        <Button type="submit" loading={busy}>
          Continue
        </Button>
      </form>
    </AuthCard>
  );
}

function CodeForm({
  onSubmit,
  busy,
  error,
}: {
  onSubmit: (code: string) => void;
  busy: boolean;
  error: string | null;
}) {
  const [code, setCode] = useState('');
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(code);
      }}
    >
      <Field label="6-digit code from your authenticator app">
        <Input
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          className="text-center font-mono text-lg tracking-[0.4em]"
        />
      </Field>
      <ErrorText message={error} />
      <Button type="submit" loading={busy} disabled={code.length !== 6}>
        Verify
      </Button>
    </form>
  );
}

export function ChallengeScreen({ factorId }: { factorId: string }) {
  const client = useSupabase();
  const { signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verify = async (code: string) => {
    setBusy(true);
    setError(null);
    const { error: verifyError } = await client.auth.mfa.challengeAndVerify({ factorId, code });
    setBusy(false);
    if (verifyError) setError('That code is not valid. Check your device clock and try again.');
  };

  return (
    <AuthCard
      title="Two-factor verification"
      subtitle="Enter the code from your authenticator app."
    >
      <CodeForm onSubmit={verify} busy={busy} error={error} />
      <Button variant="ghost" className="mt-3 w-full" onClick={() => void signOut()}>
        Use another account
      </Button>
    </AuthCard>
  );
}

export function EnrollScreen() {
  const client = useSupabase();
  const { signOut } = useAuth();
  const [factor, setFactor] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Abandoned setups leave unverified factors behind; clear them first.
      const { data: existing } = await client.auth.mfa.listFactors();
      for (const stale of existing?.all.filter((f) => f.status !== 'verified') ?? []) {
        await client.auth.mfa.unenroll({ factorId: stale.id });
      }
      const { data, error: enrollError } = await client.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `Studexa Admin ${new Date().toISOString().slice(0, 10)}`,
      });
      if (cancelled) return;
      if (enrollError || !data) setError(enrollError?.message ?? 'Could not start setup.');
      else setFactor({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  const verify = async (code: string) => {
    if (!factor) return;
    setBusy(true);
    setError(null);
    const { error: verifyError } = await client.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code,
    });
    setBusy(false);
    if (verifyError) setError('That code is not valid. Try the next one.');
  };

  return (
    <AuthCard
      title="Set up two-factor authentication"
      subtitle="Scan the QR code with an authenticator app (Google Authenticator, 1Password, Authy…)."
    >
      {factor ? (
        <div className="mb-4 flex flex-col items-center gap-2">
          <img
            src={factor.qr}
            alt="Authenticator QR code"
            className="size-44 rounded-lg bg-white p-2"
          />
          <code className="text-xs break-all text-muted">{factor.secret}</code>
        </div>
      ) : null}
      <CodeForm onSubmit={verify} busy={busy} error={error} />
      <Button variant="ghost" className="mt-3 w-full" onClick={() => void signOut()}>
        Cancel
      </Button>
    </AuthCard>
  );
}

export function NoAccessScreen() {
  const { signOut } = useAuth();
  return (
    <AuthCard
      title="No access"
      subtitle="This account is not a Studexa staff account. Ask an admin to grant you a role."
    >
      <Button variant="secondary" className="w-full" onClick={() => void signOut()}>
        Sign out
      </Button>
    </AuthCard>
  );
}
