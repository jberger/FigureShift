import { useState } from 'react';

type Theme = 'light' | 'dark';

function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Apply the saved theme (or the OS preference if none) before React renders, to avoid a flash.
export function initTheme(): void {
  const saved = localStorage.getItem('fs-theme') as Theme | null;
  document.documentElement.dataset.theme = saved ?? systemTheme();
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme as Theme) || 'light');
  const flip = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('fs-theme', next);
    setTheme(next);
  };
  return (
    <button className="link-btn" onClick={flip}>
      {theme === 'dark' ? '☀ Light mode' : '🌙 Dark mode'}
    </button>
  );
}
