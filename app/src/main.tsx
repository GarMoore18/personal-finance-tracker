import { createClient } from '@supabase/supabase-js';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthGate } from './AuthGate';
import './styles.css';

const config = __LEDGER_SUPABASE__;
const client = config ? createClient(config.url, config.publishableKey, {
  auth: { detectSessionInUrl: false },
}) : null;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate client={client} />
  </StrictMode>,
);
