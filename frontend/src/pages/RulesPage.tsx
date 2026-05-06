import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import RulesMdReader from '@/components/RulesMdReader';
import PointsQuickReference from '@/components/PointsQuickReference';
import termsIndexData from '@/rules/terms-index';
import '@/rules/rules-md-reader.css';

const ruleMdFiles = import.meta.glob<{ default: string }>('/src/rules/**/*.md', {
  query: '?raw',
  eager: true,
});

function getRuleMd(lang: string, filePath: string): string {
  const key = `/src/rules/${lang}/${filePath}`;
  const mod = ruleMdFiles[key];
  if (mod) return (mod as { default: string }).default || '';
  const fallbackKey = `/src/rules/zh-Hans/${filePath}`;
  const fallback = ruleMdFiles[fallbackKey];
  if (fallback) return (fallback as { default: string }).default || '';
  return '';
}

const RULES_TABS = ['overview', 'terms', 'yaku-list', 'fu-list', 'scoring-table'] as const;
type RulesTab = (typeof RULES_TABS)[number];

const RULES_FILES: Record<string, string> = {
  overview: 'overview.md',
  terms: 'terms-index.md',
  'yaku-list': 'yaku-list.md',
  'fu-list': 'fu-list.md',
  'scoring-table': 'scoring-table.md',
};

const TERMS_IDS: Record<string, string[]> = {
  'zh-Hans': [
    'haipai', 'mouda', 'kawa', 'yama', 'mentsu', 'jantou',
    'riichi', 'tenpai', 'tsumo-ron', 'dora', 'menzen', 'furo',
    'kaze', 'honba', 'ryuukyoku', 'yaku',
  ],
  'zh-Hant': [
    'haipai', 'mouda', 'kawa', 'yama', 'mentsu', 'jantou',
    'riichi', 'tenpai', 'tsumo-ron', 'dora', 'menzen', 'furo',
    'kaze', 'honba', 'ryuukyoku', 'yaku',
  ],
  en: [
    'haipai', 'mouda', 'kawa', 'yama', 'mentsu', 'jantou',
    'riichi', 'tenpai', 'tsumo-ron', 'dora', 'menzen', 'furo',
    'kaze', 'honba', 'ryuukyoku', 'yaku',
  ],
  ja: [
    'haipai', 'mouda', 'kawa', 'yama', 'mentsu', 'jantou',
    'riichi', 'tenpai', 'tsumo-ron', 'dora', 'menzen', 'furo',
    'kaze', 'honba', 'ryuukyoku', 'yaku',
  ],
};

const TERM_LABELS: Record<string, Record<string, string>> = {
  'zh-Hans': {
    'haipai': '配牌', 'mouda': '摸打', 'kawa': '河（捨て牌）', 'yama': '山（牌山）',
    'mentsu': '面子', 'jantou': '雀头（对子）', 'riichi': '立直（リーチ）',
    'tenpai': '听牌（テンパイ）', 'tsumo-ron': '自摸与荣和',
    'dora': '宝牌（ドラ）', 'menzen': '门清（メンゼン）', 'furo': '副露（フーロ）',
    'kaze': '场风与自风', 'honba': '本场与连庄',
    'ryuukyoku': '流局', 'yaku': '役（翻数）',
  },
  'zh-Hant': {
    'haipai': '配牌', 'mouda': '摸打', 'kawa': '河（捨て牌）', 'yama': '山（牌山）',
    'mentsu': '面子', 'jantou': '雀頭（對子）', 'riichi': '立直（リーチ）',
    'tenpai': '聽牌（テンパイ）', 'tsumo-ron': '自摸與榮和',
    'dora': '寶牌（ドラ）', 'menzen': '門清（メンゼン）', 'furo': '副露（フーロ）',
    'kaze': '場風與自風', 'honba': '本場與連莊',
    'ryuukyoku': '流局', 'yaku': '役（翻數）',
  },
  en: {
    'haipai': 'Haipai (Initial Deal)', 'mouda': 'Mouda (Draw & Discard)',
    'kawa': 'Kawa (Discard Pile)', 'yama': 'Yama (Wall)',
    'mentsu': 'Mentsu (Tile Groups)', 'jantou': 'Jantou (Pair)',
    'riichi': 'Riichi', 'tenpai': 'Tenpai (Ready)',
    'tsumo-ron': 'Tsumo & Ron', 'dora': 'Dora (Bonus Tiles)',
    'menzen': 'Menzen (Closed)', 'furo': 'Furo (Melds)',
    'kaze': 'Wind Tiles', 'honba': 'Honba & Renchan',
    'ryuukyoku': 'Ryuukyoku (Draw)', 'yaku': 'Yaku (Hand Patterns)',
  },
  ja: {
    'haipai': '配牌（はいぱい）', 'mouda': '摸打（もだ）',
    'kawa': '河（かわ）', 'yama': '山（やま）',
    'mentsu': '面子（めんつ）', 'jantou': '雀頭（じゃんとう）',
    'riichi': '立直（リーチ）', 'tenpai': '聴牌（てんぱい）',
    'tsumo-ron': 'ツモとロン', 'dora': 'ドラ',
    'menzen': '門前（メンゼン）', 'furo': '副露（フーロ）',
    'kaze': '場風と自風', 'honba': '本場と連荘',
    'ryuukyoku': '流局（りゅうきょく）', 'yaku': '役（やく）',
  },
};

const TERM_CATEGORIES: Record<string, Record<string, string>> = {
  'zh-Hans': { basic: '基本用语', core: '核心规则' },
  'zh-Hant': { basic: '基本用語', core: '核心規則' },
  en: { basic: 'Basic', core: 'Core Rules' },
  ja: { basic: '基本用語', core: '主要ルール' },
};

const TAB_I18N_KEYS: Record<RulesTab, string> = {
  overview: 'rules.tabOverview',
  terms: 'rules.tabTerms',
  'yaku-list': 'rules.tabYakuList',
  'fu-list': 'rules.tabFuList',
  'scoring-table': 'rules.tabScoringTable',
};

export default function RulesPage() {
  const { t, i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const queryTab = searchParams.get('tab') as RulesTab | null;
  const queryTerm = searchParams.get('term');
  const activeTab: RulesTab = RULES_TABS.includes(queryTab as RulesTab) ? queryTab as RulesTab : 'overview';
  const selectedTerm = activeTab === 'terms' ? queryTerm : null;

  const lang = i18n.language;
  const termLabels = TERM_LABELS[lang] || TERM_LABELS['zh-Hans'];
  const termCategories = TERM_CATEGORIES[lang] || TERM_CATEGORIES['zh-Hans'];

  const currentMd = selectedTerm
    ? getRuleMd(lang, `terms/${selectedTerm}.md`)
    : getRuleMd(lang, RULES_FILES[activeTab] || '');

  const switchTab = useCallback((tab: RulesTab) => {
    setSearchParams({ tab });
  }, [setSearchParams]);

  const loadTerm = useCallback((termId: string) => {
    setSearchParams({ tab: 'terms', term: termId });
  }, [setSearchParams]);

  const backToTerms = useCallback(() => {
    setSearchParams({ tab: 'terms' });
  }, [setSearchParams]);

  const renderTermsTab = () => {
    if (selectedTerm) {
      return (
        <div>
          <button className="rules-term-back" onClick={backToTerms}>
            ← {t('rules.backToTerms')}
          </button>
          <RulesMdReader content={currentMd} />
        </div>
      );
    }

    return (
      <div style={{ marginTop: '0.75rem' }}>
        <RulesMdReader content={currentMd} />
        <div className="rules-term-grid" style={{ padding: '0 2rem 1.5rem' }}>
          {(TERMS_IDS[lang] || TERMS_IDS['zh-Hans']).map(id => (
            <button
              key={id}
              className="rules-term-card"
              onClick={() => loadTerm(id)}
            >
              <div className="term-title">{termLabels[id] || id}</div>
              <div className="term-category">
                {termCategories[termsIndexData.find(ti => ti.id === id)?.category || 'basic'] || ''}
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderScoringTable = () => {
    return (
      <div className="rules-md-content" style={{ padding: '1.5rem 2rem' }}>
        <h1>{t('rules.tabScoringTable')}</h1>
        <p>{t('rules.scoringIntro')}</p>
        <PointsQuickReference />
      </div>
    );
  };

  return (
    <div>
      <div className="rules-md-reader">
        <div className="rules-tabs">
          {RULES_TABS.map(tab => (
            <button
              key={tab}
              className={`rules-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => switchTab(tab)}
            >
              {t(TAB_I18N_KEYS[tab])}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: '0.75rem' }}>
        {activeTab === 'terms' && renderTermsTab()}
        {activeTab === 'scoring-table' && renderScoringTable()}
        {activeTab !== 'terms' && activeTab !== 'scoring-table' && (
          <RulesMdReader content={currentMd} />
        )}
      </div>
    </div>
  );
}
