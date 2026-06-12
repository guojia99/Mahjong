import type { ReactNode } from 'react';

export interface QueMiOptionGroupProps<T extends string | number> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  hint?: ReactNode;
}

export function QueMiOptionGroup<T extends string | number>({
  label,
  value,
  options,
  onChange,
  hint,
}: QueMiOptionGroupProps<T>) {
  return (
    <div>
      <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text)' }}>
        {label}
      </h2>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: value === opt.value ? 'var(--color-primary)' : 'var(--color-bg)',
              color: value === opt.value ? '#fff' : 'var(--color-text)',
              border: '1px solid var(--color-border)',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {hint && (
        <p className="text-xs mt-2" style={{ color: 'var(--color-text-light)' }}>
          {hint}
        </p>
      )}
    </div>
  );
}
