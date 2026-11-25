import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

function validProjectUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const isLocal = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    return (url.protocol === 'https:' || (isLocal && url.protocol === 'http:'))
      && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/';
  } catch {
    return false;
  }
}

export default defineConfig(({ command, mode, isPreview }) => {
  const env = loadEnv(mode, import.meta.dirname, 'LEDGER_SUPABASE_');
  const url = env.LEDGER_SUPABASE_URL ?? '';
  const publishableKey = env.LEDGER_SUPABASE_PUBLISHABLE_KEY ?? '';
  const hasConfig = Boolean(url || publishableKey);

  if (!isPreview && (command === 'build' || hasConfig)) {
    if (!validProjectUrl(url)) {
      throw new Error('Set LEDGER_SUPABASE_URL to an HTTPS project origin or a local Supabase origin.');
    }
    if (!/^sb_publishable_[a-zA-Z0-9_-]+$/.test(publishableKey)) {
      throw new Error('Set LEDGER_SUPABASE_PUBLISHABLE_KEY to a Supabase publishable key.');
    }
  }

  return {
    base: './',
    envPrefix: [],
    plugins: [react()],
    define: {
      __LEDGER_SUPABASE__: JSON.stringify(hasConfig ? { url, publishableKey } : null),
    },
  };
});
