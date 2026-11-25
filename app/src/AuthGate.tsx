import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { App } from './App';

function AccessPanel({ children }: { children: ReactNode }) {
  return (
    <main className="access">
      <h1>Ledger</h1>
      <div className="panel">{children}</div>
    </main>
  );
}

function SignIn({ client }: { client: SupabaseClient }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError('');

    try {
      const { error: authError } = await client.auth.signInWithPassword({
        email: String(form.get('email')).trim(),
        password: String(form.get('password')),
      });
      if (authError) setError('Sign-in failed. Check your email and password and try again.');
    } catch {
      setError('Could not reach Ledger. Try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <AccessPanel>
      <h2>Sign in</h2>
      <form onSubmit={signIn}>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" autoCapitalize="none" required />
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </AccessPanel>
  );
}

export function AuthGate({ client }: { client: SupabaseClient | null }) {
  if (!client) {
    return (
      <AccessPanel>
        <h2>Setup required</h2>
        <p>Configure Supabase to sign in to Ledger.</p>
      </AccessPanel>
    );
  }

  return <OwnerSession client={client} />;
}

function OwnerSession({ client }: { client: SupabaseClient }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [verifiedAccount, setVerifiedAccount] = useState<string | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const account = session?.user?.id ?? null;

  useEffect(() => {
    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => data.subscription.unsubscribe();
  }, [client]);

  useEffect(() => {
    if (!account) {
      setVerifiedAccount(null);
      setVerificationError(null);
      return;
    }
    if (account === verifiedAccount) return;

    let current = true;
    setVerificationError(null);

    async function verify() {
      try {
        const { data, error } = await client.auth.getUser();
        if (current && !error && data.user?.id === account) {
          setVerifiedAccount(account);
          return;
        }
      } catch {
        // The retry screen also handles connection errors.
      }
      if (current) setVerificationError(account);
    }

    void verify();
    return () => { current = false; };
  }, [account, client, retry, verifiedAccount]);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError('');
    try {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) setSignOutError('Could not sign out. Try again.');
    } catch {
      setSignOutError('Could not sign out. Try again.');
    } finally {
      setSigningOut(false);
    }
  }

  const signOutButton = (
    <div className="sign-out">
      <button type="button" onClick={signOut} disabled={signingOut}>
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
      {signOutError && <p role="alert">{signOutError}</p>}
    </div>
  );

  if (session === null || (session && !account)) return <SignIn client={client} />;
  if (account && verifiedAccount === account) return <App signOut={signOutButton} />;

  return (
    <AccessPanel>
      {account && verificationError === account ? (
        <>
          <p role="alert">Could not verify your session. Retry or sign in again.</p>
          <button type="button" onClick={() => setRetry(retry + 1)}>Retry</button>
          {signOutButton}
        </>
      ) : <p role="status">Checking your session…</p>}
    </AccessPanel>
  );
}
