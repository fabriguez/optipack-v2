'use client';

import { AppSelect } from '@/components/ui/AppSelect';

const LANGUAGES = [
  { value: 'fr', label: 'Francais' },
  { value: 'en', label: 'English' },
];

export function LanguageSwitcher() {

  const currentLocale = typeof document !== 'undefined'
    ? (document.cookie.match(/locale=([^;]+)/)?.[1] || 'fr')
    : 'fr';

  const handleChange = (e: { target: { value: string } }) => {
    const locale = e.target.value;
    document.cookie = `locale=${locale};path=/;max-age=31536000`;
    window.location.reload();
  };

  return (
    <div className="w-28">
      <select
        value={currentLocale}
        onChange={(e) => handleChange({ target: { value: e.target.value } })}
        className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-600 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/20"
      >
        {LANGUAGES.map((lang) => (
          <option key={lang.value} value={lang.value}>{lang.label}</option>
        ))}
      </select>
    </div>
  );
}
