import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfmCompat from '@/lib/remarkGfmCompat';
import { Sparkles } from 'lucide-react';
import '@/pages/changelog.css';

const CHANGELOG_LANG_MAP: Record<string, string> = {
  'zh-Hans': 'zh-Hans',
  'zh-Hant': 'zh-Hant',
  en: 'en',
  ja: 'ja',
};

interface ChangelogSection {
  version: string;
  date: string;
  items: string[];
}

interface ParsedChangelog {
  title: string;
  sections: ChangelogSection[];
}

interface FetchResult {
  lang: string;
  parsed: ParsedChangelog;
  failed: boolean;
}

function resolveChangelogPath(lang: string): string {
  const code = CHANGELOG_LANG_MAP[lang] || 'zh-Hans';
  return `${import.meta.env.BASE_URL}changelog/${code}.md`;
}

const HEADING_RE = /^##\s+(.+?)\s*[—\-–]\s*(.+)$/;

function parseChangelog(md: string): ParsedChangelog {
  const lines = md.split('\n');
  const sections: ChangelogSection[] = [];
  let title = '';
  let current: ChangelogSection | null = null;
  let pendingItem: string | null = null;

  const flushItem = () => {
    if (current && pendingItem !== null) {
      const trimmed = pendingItem.replace(/\s+$/, '');
      if (trimmed) current.items.push(trimmed);
    }
    pendingItem = null;
  };

  const flushSection = () => {
    flushItem();
    if (current) sections.push(current);
    current = null;
  };

  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');

    if (line.startsWith('# ')) {
      flushSection();
      title = line.slice(2).trim();
      continue;
    }

    const headingMatch = line.match(HEADING_RE);
    if (headingMatch) {
      flushSection();
      current = {
        version: headingMatch[1].trim(),
        date: headingMatch[2].trim(),
        items: [],
      };
      continue;
    }

    if (!current) continue;

    const bulletMatch = line.match(/^\s*-\s+(.*)$/);
    if (bulletMatch) {
      flushItem();
      pendingItem = bulletMatch[1];
      continue;
    }

    const continuation = line.match(/^\s{2,}(\S.*)$/);
    if (continuation && pendingItem !== null) {
      pendingItem = `${pendingItem} ${continuation[1]}`;
      continue;
    }

    if (line.trim() === '' && pendingItem !== null) {
      flushItem();
    }
  }

  flushSection();
  return { title, sections };
}

const inlineMarkdownComponents = {
  p: ({ children }: { children?: ReactNode }) => <>{children}</>,
};

export default function ChangelogPage() {
  const { t, i18n } = useTranslation();
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    const targetLang = i18n.language;
    const url = resolveChangelogPath(targetLang);

    const fetchOnce = (path: string) =>
      fetch(path, { cache: 'no-cache' }).then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      });

    fetchOnce(url)
      .catch(() => fetchOnce(`${import.meta.env.BASE_URL}changelog/zh-Hans.md`))
      .then((text) => {
        if (cancelled) return;
        setResult({ lang: targetLang, parsed: parseChangelog(text), failed: false });
      })
      .catch(() => {
        if (cancelled) return;
        setResult({
          lang: targetLang,
          parsed: { title: '', sections: [] },
          failed: true,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [i18n.language]);

  const ready = result && result.lang === i18n.language;

  const sections = useMemo(() => result?.parsed.sections ?? [], [result]);
  const title = result?.parsed.title ?? '';

  if (!ready) {
    return (
      <div className="changelog-status">
        {t('common.loading')}
      </div>
    );
  }

  if (result.failed) {
    return (
      <div className="changelog-status changelog-status--error">
        {t('changelog.loadFailed')}
      </div>
    );
  }

  return (
    <div className="changelog-page">
      {title && (
        <header className="changelog-header">
          <Sparkles size={18} className="changelog-header__icon" aria-hidden />
          <h1 className="changelog-header__title">{title}</h1>
        </header>
      )}

      <div className="changelog-list">
        {sections.map((section, idx) => (
          <article
            key={`${section.version}-${idx}`}
            className={`changelog-card ${idx === 0 ? 'changelog-card--latest' : ''}`}
          >
            <header className="changelog-card__head">
              <span className="changelog-card__version">{section.version}</span>
              <span className="changelog-card__dot" aria-hidden />
              <time className="changelog-card__date">{section.date}</time>
              {idx === 0 && (
                <span className="changelog-card__badge">
                  {t('changelog.latestBadge')}
                </span>
              )}
            </header>

            <ul className="changelog-card__list">
              {section.items.map((item, i) => (
                <li key={i} className="changelog-card__item">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfmCompat]}
                    components={inlineMarkdownComponents}
                  >
                    {item}
                  </ReactMarkdown>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </div>
  );
}
