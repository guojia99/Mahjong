import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImagePlus } from 'lucide-react';
import { uploadLeagueSeasonMarkdownImage } from '@/api/leagues';
import { useToast } from '@/hooks/useToast';
import LeagueMarkdownBody from '@/components/LeagueMarkdownBody';

export interface LeagueMarkdownEditorProps {
    value: string;
    onChange: (next: string) => void;
    /** 有值时显示「上传并插入图片」（需已存在赛季 id） */
    seasonId?: string | null;
    rows?: number;
    showPreview?: boolean;
}

export default function LeagueMarkdownEditor({
    value,
    onChange,
    seasonId,
    rows = 12,
    showPreview = true,
}: LeagueMarkdownEditorProps) {
    const { t } = useTranslation();
    const { showToast } = useToast();
    const taRef = useRef<HTMLTextAreaElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

    async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file || !seasonId) return;
        setUploading(true);
        try {
            const { url } = await uploadLeagueSeasonMarkdownImage(seasonId, file);
            const insert = `\n![image](${url})\n`;
            const ta = taRef.current;
            if (ta) {
                const start = ta.selectionStart ?? value.length;
                const end = ta.selectionEnd ?? value.length;
                const next = value.slice(0, start) + insert + value.slice(end);
                onChange(next);
                requestAnimationFrame(() => {
                    ta.focus();
                    const pos = start + insert.length;
                    ta.setSelectionRange(pos, pos);
                });
            } else {
                onChange(value + insert);
            }
            showToast(t('league.markdownImageInserted'), 'success');
        } catch {
            showToast(t('league.actionFailed'));
        } finally {
            setUploading(false);
        }
    }

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
                {seasonId ? (
                    <>
                        <input
                            ref={fileRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif"
                            className="hidden"
                            onChange={onFileChange}
                        />
                        <button
                            type="button"
                            disabled={uploading}
                            onClick={() => fileRef.current?.click()}
                            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl border transition-all disabled:opacity-50"
                            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                        >
                            <ImagePlus size={14} />
                            {uploading ? t('league.markdownImageUploading') : t('league.insertMarkdownImage')}
                        </button>
                    </>
                ) : null}
                <p className="text-xs flex-1 min-w-[12rem]" style={{ color: 'var(--color-text-light)' }}>
                    {t('league.markdownEditorHint')}
                </p>
            </div>
            <textarea
                ref={taRef}
                value={value}
                onChange={e => onChange(e.target.value)}
                rows={rows}
                spellCheck={false}
                className="w-full px-3 py-2 rounded-xl border text-sm resize-y font-mono leading-relaxed"
                style={{ borderColor: 'var(--color-border)', minHeight: '8rem' }}
            />
            {showPreview && Boolean(value.trim()) && (
                <div className="rounded-xl border p-3 mt-1" style={{ borderColor: 'var(--color-border)', background: '#fafafa' }}>
                    <div className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-light)' }}>
                        {t('league.markdownPreview')}
                    </div>
                    <LeagueMarkdownBody source={value} />
                </div>
            )}
        </div>
    );
}
