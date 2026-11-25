import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ActivityPage } from './ActivityPage';
import { currentMonth } from './transactions';
import { HomePage } from './HomePage';
import { AccountsPage } from './AccountsPage';
import { ExpenseForm } from './ExpenseForm';

const pages = [
  { id: 'home', label: 'Home', icon: '⌂', heading: 'Overview' },
  { id: 'activity', label: 'Activity', icon: '≡', heading: 'Activity' },
  { id: 'add', label: 'Add', icon: '+', heading: 'Add expense' },
  { id: 'accounts', label: 'Accounts', icon: '▤', heading: 'Accounts' },
  { id: 'more', label: 'More', icon: '···', heading: 'Settings' },
] as const;

const themes = ['system', 'light', 'dark'] as const;
type Theme = (typeof themes)[number];
type Page = (typeof pages)[number];
const appearanceKey = 'ledger-app:appearance';

function currentPage(): Page {
  return pages.find(({ id }) => location.hash === '#/' + id) ?? pages[0];
}

function initialTheme(): Theme {
  try {
    const preference = localStorage.getItem(appearanceKey);
    return themes.find((theme) => theme === preference) ?? 'system';
  } catch {
    return 'system';
  }
}

export function App({ signOut, client }: { signOut: ReactNode; client: SupabaseClient }) {
  const [page, setPage] = useState(currentPage);
  const [theme, setTheme] = useState(initialTheme);
  const [activityMonth, setActivityMonth] = useState(currentMonth);
  const [expenseSaved, setExpenseSaved] = useState(false);
  const expenseOrigin = useRef<Page>(pages[0]);
  const main = useRef<HTMLElement>(null);
  const previousPage = useRef(page);

  useEffect(() => {
    function navigate() {
      const next = currentPage();
      if (next.id === 'add') {
        if (previousPage.current.id !== 'add') expenseOrigin.current = previousPage.current;
        setExpenseSaved(false);
      }
      setPage(next);
    }
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);

  useEffect(() => {
    document.title = page.heading + ' | Ledger';
    if (previousPage.current !== page) {
      main.current?.focus();
      window.scrollTo(0, 0);
      previousPage.current = page;
    }
  }, [page]);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  function changeTheme(nextTheme: Theme) {
    setTheme(nextTheme);
    try {
      localStorage.setItem(appearanceKey, nextTheme);
    } catch {
      // Apply the preference for this page when storage is unavailable.
    }
  }

  return (
    <div className="shell">
      <a className="skip-link" href="#main-content" onClick={(event) => {
        event.preventDefault();
        main.current?.focus();
      }}>
        Skip to content
      </a>
      <header className="sidebar">
        <a className="brand" href="#/home"><span className="brand-mark" aria-hidden="true" />Ledger</a>
        <nav aria-label="Main navigation">
          {pages.map(({ id, label, icon }) => (
            <a
              key={id}
              href={'#/' + id}
              aria-label={id === 'add' ? 'Add an expense' : undefined}
              aria-current={page.id === id ? 'page' : undefined}
              className={id === 'add' ? 'nav-add' : undefined}
            >
              <span className="nav-icon" aria-hidden="true">{icon}</span>
              {label}
            </a>
          ))}
        </nav>
      </header>
      <main id="main-content" ref={main} tabIndex={-1}>
        {page.id !== 'home' && <h1>{page.heading}</h1>}
        <div role="status">{expenseSaved && <p className="expense-confirmation">Expense saved.</p>}</div>
        {page.id === 'home' && <HomePage client={client} onCurrentActivity={() => setActivityMonth(currentMonth())} />}
        {page.id === 'activity' && (
          <ActivityPage client={client} month={activityMonth} onMonthChange={setActivityMonth} />
        )}
        {page.id === 'add' && (
          <ExpenseForm client={client} onSaved={() => {
            setExpenseSaved(true);
            if (currentPage().id === 'add') location.hash = '#/' + expenseOrigin.current.id;
          }} />
        )}
        {page.id === 'accounts' && <AccountsPage client={client} />}
        {page.id === 'more' && (
          <>
            <fieldset className="panel appearance">
              <legend>Appearance</legend>
              {themes.map((option) => (
                <label key={option}>
                  <input
                    type="radio"
                    name="appearance"
                    value={option}
                    checked={theme === option}
                    onChange={() => changeTheme(option)}
                  />
                  {option}
                </label>
              ))}
            </fieldset>
            {signOut}
          </>
        )}
      </main>
    </div>
  );
}
