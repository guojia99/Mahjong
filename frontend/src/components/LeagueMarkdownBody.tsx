import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import type { Components } from 'react-markdown';

/** 将历史数据里写死的本机绝对地址改为相对路径，线上可随站点域名加载。 */
export function normalizeLeagueMediaDevUrls(text: string): string {
    return text.replace(
        /https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(\/api\/v1\/leagues\/media\/[0-9a-fA-F-]+\/?)/g,
        '$1',
    );
}

const components: Components = {
    img: ({ node: _node, ...props }) => (
        <img
            {...props}
            alt={props.alt ?? ''}
            loading="lazy"
            decoding="async"
            style={{
                maxWidth: '100%',
                height: 'auto',
                ...(typeof props.style === 'object' && props.style ? props.style : {}),
            }}
        />
    ),
    a: ({ node: _node, ...props }) => (
        <a {...props} target="_blank" rel="noopener noreferrer" />
    ),
    table: ({ children, ...props }) => (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', marginBottom: '0.75rem' }}>
            <table {...props}>{children}</table>
        </div>
    ),
};

export interface LeagueMarkdownBodyProps {
    source: string;
    className?: string;
}

/** 联赛赛季描述等 Markdown（含 GFM、受控 HTML）的统一渲染器。 */
export default function LeagueMarkdownBody({ source, className }: LeagueMarkdownBodyProps) {
    if (!source?.trim()) return null;
    const normalized = normalizeLeagueMediaDevUrls(source);
    return (
        <div className={`league-md-content ${className ?? ''}`}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw, rehypeSanitize]}
                components={components}
            >
                {normalized}
            </ReactMarkdown>
        </div>
    );
}
