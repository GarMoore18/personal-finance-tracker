export const themes = ['system', 'light', 'dark'] as const;
export type Theme = (typeof themes)[number];

const appearanceKey = 'ledger-app:appearance';

export function initialTheme(): Theme {
  try {
    const preference = localStorage.getItem(appearanceKey);
    return themes.find((theme) => theme === preference) ?? 'system';
  } catch {
    return 'system';
  }
}

export function changeAppearance(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(appearanceKey, theme);
  } catch {
    // Keep the preference applied while storage is unavailable.
  }
}
