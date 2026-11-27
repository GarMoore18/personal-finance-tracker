import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ActivityPage } from './ActivityPage';
import { currentMonth } from './transactions';
import { HomePage } from './HomePage';
import { AccountsPage } from './AccountsPage';
import { ExpenseForm } from './ExpenseForm';
import { CategorySettings } from './CategorySettings';
import { CsvImportPage } from './CsvImportPage';
import { DataExportPage } from './DataExportPage';
import { changeAppearance, initialTheme, themes } from './appearance';
import { dashboardWidgets, loadDashboardPreferences, saveDashboardPreferences } from './dashboardPreferences';

const pages = [
  { id: 'home', label: 'Home', icon: '⌂', heading: 'Overview' },
  { id: 'activity', label: 'Activity', icon: '≡', heading: 'Activity' },
  { id: 'add', label: 'Add', icon: '+', heading: 'Add expense' },
  { id: 'accounts', label: 'Accounts', icon: '▤', heading: 'Accounts' },
  { id: 'more', label: 'More', icon: '···', heading: 'Settings' },
] as const;

const categoriesPage = { id: 'categories', heading: 'Categories' } as const;
const importPage = { id: 'import', heading: 'Import expenses' } as const;
const exportPage = { id: 'export', heading: 'Export data' } as const;
type Page = (typeof pages)[number] | typeof categoriesPage | typeof importPage | typeof exportPage;

function currentPage(): Page {
  if (location.hash === '#/categories') return categoriesPage;
  if (location.hash === '#/import') return importPage;
  if (location.hash === '#/export') return exportPage;
  return pages.find(({ id }) => location.hash === '#/' + id) ?? pages[0];
}

export function App({ signOut, client }: { signOut: ReactNode; client: SupabaseClient }) {
  const [page, setPage] = useState(currentPage);
  const [theme, setTheme] = useState(initialTheme);
  const [dashboard, setDashboard] = useState(loadDashboardPreferences);
  const [activityMonth, setActivityMonth] = useState(currentMonth);
  const [expenseSavedOn, setExpenseSavedOn] = useState<Page | null>(null);
  const expenseOrigin = useRef<Page>(pages[0]);
  const main = useRef<HTMLElement>(null);
  const previousPage = useRef(page);

  useEffect(() => {
    function navigate() {
      const next = currentPage();
      if (next.id === 'add') {
        if (previousPage.current.id !== 'add') expenseOrigin.current = previousPage.current;
      }
      setExpenseSavedOn((savedOn) => savedOn === next ? savedOn : null);
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
        <div role="status">{expenseSavedOn === page && <p className="expense-confirmation">Expense saved.</p>}</div>
        {page.id === 'home' && <HomePage client={client} widgets={dashboard}
          onCurrentActivity={() => setActivityMonth(currentMonth())} />}
        {page.id === 'activity' && (
          <ActivityPage client={client} month={activityMonth} onMonthChange={setActivityMonth} />
        )}
        {page.id === 'add' && (
          <ExpenseForm client={client} onSaved={() => {
            if (currentPage().id === 'add') {
              setExpenseSavedOn(expenseOrigin.current);
              location.hash = '#/' + expenseOrigin.current.id;
            }
          }} />
        )}
        {page.id === 'accounts' && <AccountsPage client={client} />}
        {page.id === 'categories' && <CategorySettings client={client} />}
        {page.id === 'import' && <CsvImportPage client={client} />}
        {page.id === 'export' && <DataExportPage client={client} />}
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
                    onChange={() => {
                      changeAppearance(option);
                      setTheme(option);
                    }}
                  />
                  {option}
                </label>
              ))}
            </fieldset>
            <fieldset className="panel appearance">
              <legend>Dashboard widgets</legend>
              {dashboardWidgets.map(({ id, label }) => (
                <label key={id}>
                  <input type="checkbox" checked={dashboard[id]} onChange={(event) => {
                    const next = { ...dashboard, [id]: event.currentTarget.checked };
                    setDashboard(next);
                    saveDashboardPreferences(next);
                  }} />
                  {label}
                </label>
              ))}
            </fieldset>
            <div className="settings-links">
              <a className="action" href="#/categories">Manage categories</a>
              <a className="action" href="#/import">Import CSV</a>
              <a className="action" href="#/export">Export data</a>
            </div>
            {signOut}
          </>
        )}
      </main>
    </div>
  );
}
