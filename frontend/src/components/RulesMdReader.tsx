import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfmCompat from '@/lib/remarkGfmCompat';
import { List, X } from 'lucide-react';

interface RulesMdReaderProps {
  content: string;
}

const MAHJONG_RE = /\{\{\[mahjong\]\s*([^}]+)\}\}/g;

function extractHeadings(markdown: string): { id: string; text: string; level: number }[] {
  const lines = markdown.split('\n');
  const headings: { id: string; text: string; level: number }[] = [];
  for (const line of lines) {
    const match = line.match(/^(#{1,4})\s+(.+)/);
    if (match) {
      const level = match[1].length;
      const text = match[2].replace(/[*_`]/g, '');
      const id = text
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fff]+/g, '-')
        .replace(/^-|-$/g, '');
      if (level <= 3) {
        headings.push({ id, text, level });
      }
    }
  }
  return headings;
}

function renderMahjongTiles(data: string): ReactNode {
  const segments = data.split(';').map(s => s.trim()).filter(Boolean);
  const parts: { type: string; tiles: string[] }[] = [];

  for (const seg of segments) {
    const colonIdx = seg.indexOf(':');
    if (colonIdx === -1) continue;
    const type = seg.slice(0, colonIdx);
    const tiles = seg.slice(colonIdx + 1).match(/[0-9][mpsz]r?/g) || [];
    parts.push({ type, tiles });
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: '2px', verticalAlign: 'middle' }}>
      {parts.map((part, pi) => (
        <span key={pi} style={{ display: 'inline-flex', alignItems: 'flex-end' }}>
          {part.tiles.map((tile, ti) => (
            <img
              key={ti}
              src={`/marjongs/${tile}.webp`}
              alt={tile}
              draggable={false}
              style={{ height: '2rem', width: 'auto', borderRadius: '0.15rem' }}
            />
          ))}
        </span>
      ))}
    </span>
  );
}

function preprocessContent(content: string): string {
  return content.replace(MAHJONG_RE, '`{{$1}}`');
}

function isMahjongCode(text: string): boolean {
  return text.startsWith('{{') && text.endsWith('}}');
}

function CodeHandler({ children }: { children?: ReactNode; className?: string; node?: unknown }) {
  const text = String(children).trim();
  if (isMahjongCode(text)) {
    return <>{renderMahjongTiles(text.slice(2, -2))}</>;
  }
  return <code>{children}</code>;
}

export default function RulesMdReader({ content }: RulesMdReaderProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [headings, setHeadings] = useState<{ id: string; text: string; level: number }[]>([]);
  const [activeHeading, setActiveHeading] = useState('');
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    const h = extractHeadings(content);
    setHeadings(h);
    if (h.length > 0) setActiveHeading(h[0].id);
  }, [content]);

  const handleScroll = useCallback(() => {
    if (!contentRef.current || headings.length === 0) return;
    const scrollTop = contentRef.current.scrollTop;
    let current = headings[0].id;
    for (const heading of headings) {
      const el = contentRef.current?.querySelector(`[data-heading="${heading.id}"]`);
      if (el && (el as HTMLElement).offsetTop - 20 <= scrollTop) {
        current = heading.id;
      }
    }
    setActiveHeading(current);
  }, [headings]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const scrollToHeading = (id: string) => {
    const el = contentRef.current?.querySelector(`[data-heading="${id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const processedContent = preprocessContent(content);

  return (
    <div className="rules-md-reader">
      <div className="rules-content rules-md-content" ref={contentRef}>
        <ReactMarkdown
          remarkPlugins={[remarkGfmCompat]}
          components={{
            h1: ({ children, ...props }) => {
              const text = String(children).replace(/[*_`]/g, '');
              const id = text.toLowerCase().replace(/[^\w\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '');
              return <h1 data-heading={id} id={id} {...props}>{children}</h1>;
            },
            h2: ({ children, ...props }) => {
              const text = String(children).replace(/[*_`]/g, '');
              const id = text.toLowerCase().replace(/[^\w\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '');
              return <h2 data-heading={id} id={id} {...props}>{children}</h2>;
            },
            h3: ({ children, ...props }) => {
              const text = String(children).replace(/[*_`]/g, '');
              const id = text.toLowerCase().replace(/[^\w\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '');
              return <h3 data-heading={id} id={id} {...props}>{children}</h3>;
            },
              code: CodeHandler,
              table: ({ children, ...props }) => (
                <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', marginBottom: '1rem' }}>
                  <table {...props}>{children}</table>
                </div>
              ),
          }}
        >
          {processedContent}
        </ReactMarkdown>
      </div>

      {headings.length > 0 && (
        <>
          <button
            className="rules-nav-fab"
            onClick={() => setNavOpen(!navOpen)}
            title="目录"
          >
            {navOpen ? <X size={18} /> : <List size={18} />}
          </button>

          <div className={`rules-nav-overlay ${navOpen ? 'open' : ''}`} onClick={() => setNavOpen(false)} />

          <nav className={`rules-nav-panel ${navOpen ? 'open' : ''}`}>
            <div className="rules-nav-panel-title">目录</div>
            {headings.map(h => (
              <button
                key={h.id}
                className={`rules-nav-panel-item ${activeHeading === h.id ? 'active' : ''}`}
                onClick={() => { scrollToHeading(h.id); setNavOpen(false); }}
                style={h.level === 3 ? { paddingLeft: '1.25rem' } : {}}
              >
                {h.text}
              </button>
            ))}
          </nav>
        </>
      )}
    </div>
  );
}
