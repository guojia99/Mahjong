import { useTranslation } from 'react-i18next';

interface Props {
  query: string;
  onQueryChange: (q: string) => void;
  placeholder?: string;
}

export default function SearchBar({ query, onQueryChange, placeholder }: Props) {
  const { t } = useTranslation();
  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={placeholder || t('searchBar.placeholder')}
        className="form-input pl-10"
      />
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
    </div>
  );
}
