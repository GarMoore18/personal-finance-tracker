export const dashboardWidgets = [
  { id: 'spending', label: 'Spending this month' },
  { id: 'recent', label: 'Recent expenses' },
  { id: 'worth', label: 'Net worth' },
] as const;

export type DashboardPreferences = Record<(typeof dashboardWidgets)[number]['id'], boolean>;

const storageKey = 'ledger-app:dashboard-widgets';
const defaults = { spending: true, recent: true, worth: true };

export function loadDashboardPreferences(): DashboardPreferences {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as Partial<DashboardPreferences> | null;
    return {
      spending: stored?.spending !== false,
      recent: stored?.recent !== false,
      worth: stored?.worth !== false,
    };
  } catch {
    return defaults;
  }
}

export function saveDashboardPreferences(preferences: DashboardPreferences) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(preferences));
  } catch {
    // Use the updated settings until the app is reloaded.
  }
}
