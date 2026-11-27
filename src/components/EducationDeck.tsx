import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  Calculator,
  CheckCircle2,
  Circle,
  Compass,
  ExternalLink,
  GraduationCap,
  Library,
  Lightbulb,
  PlayCircle,
  Search,
  Sparkles,
} from 'lucide-react';
import { computeReserveBreakdown, formatUsd } from '../shared/betaUtils';
import {
  EDUCATION_CATEGORY_META,
  EDUCATION_LESSONS,
  OFFICIAL_XRPL_LINKS,
  XRPL_GLOSSARY,
  type EducationCategory,
} from '../shared/educationContent';
import { useCommandStore } from '../store/useCommandStore';
import { InteractiveExplainers } from './InteractiveExplainers';

type AcademySubTab = 'lessons' | 'animations' | 'reserve-lab' | 'glossary' | 'links';

const COMPLETED_STORAGE_KEY = 'xrpl-cc-academy-completed-v1';

function loadCompletedLessons(): string[] {
  try {
    const raw = localStorage.getItem(COMPLETED_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as string[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  return [];
}

export const EducationDeck: React.FC = () => {
  const setActiveTab = useCommandStore((s) => s.setActiveTab);
  const marketPrice = useCommandStore((s) => s.marketPrice);

  const [subTab, setSubTab] = useState<AcademySubTab>('lessons');
  const [categoryFilter, setCategoryFilter] = useState<'all' | EducationCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLessonId, setSelectedLessonId] = useState<string>(EDUCATION_LESSONS[0].id);
  const [completedIds, setCompletedIds] = useState<string[]>(loadCompletedLessons);

  // Interactive Reserve & Fee Lab state
  const [simTotalXrp, setSimTotalXrp] = useState(100);
  const [simTrustlines, setSimTrustlines] = useState(3);
  const [simDexOffers, setSimDexOffers] = useState(1);
  const [simNftPages, setSimNftPages] = useState(1);
  const [simEscrowsChecks, setSimEscrowsChecks] = useState(0);

  // Glossary filter
  const [glossaryQuery, setGlossaryQuery] = useState('');
  const [glossaryCat, setGlossaryCat] = useState<'All' | 'Protocol' | 'DeFi' | 'Security' | 'Node Ops'>('All');

  const toggleLessonComplete = (id: string) => {
    setCompletedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem(COMPLETED_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const filteredLessons = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return EDUCATION_LESSONS.filter((lesson) => {
      if (categoryFilter !== 'all' && lesson.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        lesson.title.toLowerCase().includes(q) ||
        lesson.summary.toLowerCase().includes(q) ||
        lesson.keyTakeaways.some((k) => k.toLowerCase().includes(q)) ||
        lesson.sections.some(
          (s) => s.heading.toLowerCase().includes(q) || s.body.toLowerCase().includes(q)
        )
      );
    });
  }, [categoryFilter, searchQuery]);

  const activeLesson =
    filteredLessons.find((l) => l.id === selectedLessonId) ??
    filteredLessons[0] ??
    EDUCATION_LESSONS[0];

  const completionPct = Math.round((completedIds.length / EDUCATION_LESSONS.length) * 100);

  const simOwnerCount = simTrustlines + simDexOffers + simNftPages + simEscrowsChecks;
  const simBreakdown = useMemo(
    () => computeReserveBreakdown(simTotalXrp, 1, simOwnerCount, 0.2),
    [simTotalXrp, simOwnerCount]
  );

  const filteredGlossary = useMemo(() => {
    const q = glossaryQuery.trim().toLowerCase();
    return XRPL_GLOSSARY.filter((item) => {
      if (glossaryCat !== 'All' && item.category !== glossaryCat) return false;
      if (!q) return true;
      return (
        item.term.toLowerCase().includes(q) || item.definition.toLowerCase().includes(q)
      );
    });
  }, [glossaryQuery, glossaryCat]);

  const linkGroups = useMemo(() => {
    const groups = new Map<string, typeof OFFICIAL_XRPL_LINKS>();
    for (const link of OFFICIAL_XRPL_LINKS) {
      const arr = groups.get(link.group) ?? [];
      arr.push(link);
      groups.set(link.group, arr);
    }
    return Array.from(groups.entries());
  }, []);

  return (
    <div className="space-y-4">
      {/* Top Academy Header & Mastery Progress */}
      <div className="hud-panel rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500/20 to-violet-500/20 border border-cyan-400/40 flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-cyan-300" />
            </div>
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
                XRPL Academy &amp; Command Center Deep Guide
              </h2>
              <p className="text-[11px] text-slate-400">
                Built-in XRP Ledger protocol engineering curriculum, interactive reserve lab, glossary, and official docs
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 font-mono">
            <div className="text-right">
              <div className="text-[10px] uppercase text-slate-500">Academy Progress</div>
              <div className="text-xs font-bold text-emerald-300 tabular-nums">
                {completedIds.length} / {EDUCATION_LESSONS.length} Lessons ({completionPct}%)
              </div>
            </div>
            <div className="w-24 h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all"
                style={{ width: `${completionPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Sub-Navigation Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {[
            { id: 'lessons', label: `Deep Lessons (${EDUCATION_LESSONS.length})`, icon: BookOpen },
            { id: 'animations', label: 'Interactive Animations (6)', icon: PlayCircle },
            { id: 'reserve-lab', label: 'Interactive Reserve & Fee Lab', icon: Calculator },
            { id: 'glossary', label: `XRPL Glossary (${XRPL_GLOSSARY.length})`, icon: Library },
            { id: 'links', label: `Official Links & Docs (${OFFICIAL_XRPL_LINKS.length})`, icon: Compass },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubTab(tab.id as AcademySubTab)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-mono border transition-colors ${
                  subTab === tab.id
                    ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                    : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* VIEW 1: DEEP LESSONS */}
      {subTab === 'lessons' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          {/* Left Lesson List */}
          <div className="xl:col-span-4 hud-panel rounded-xl p-3.5 space-y-3 h-fit">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search XRPL topics, AMM, Rust vault…"
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setCategoryFilter('all')}
                className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                  categoryFilter === 'all'
                    ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                    : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                All
              </button>
              {(Object.keys(EDUCATION_CATEGORY_META) as EducationCategory[]).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                    categoryFilter === cat
                      ? EDUCATION_CATEGORY_META[cat].badgeClass
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {EDUCATION_CATEGORY_META[cat].label}
                </button>
              ))}
            </div>

            <div className="space-y-1.5 max-h-[560px] overflow-y-auto pr-0.5">
              {filteredLessons.length === 0 ? (
                <div className="py-8 text-center text-xs font-mono text-slate-500">
                  No lessons match your search.
                </div>
              ) : (
                filteredLessons.map((lesson) => {
                  const selected = activeLesson?.id === lesson.id;
                  const done = completedIds.includes(lesson.id);
                  return (
                    <button
                      key={lesson.id}
                      type="button"
                      onClick={() => setSelectedLessonId(lesson.id)}
                      className={`w-full text-left p-3 rounded-xl border transition-all ${
                        selected
                          ? 'bg-cyan-500/15 border-cyan-400/50 shadow-glowCyan'
                          : 'bg-slate-950/70 border-slate-800/90 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-semibold text-white leading-snug">
                          {lesson.title}
                        </span>
                        {done ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        ) : (
                          <Circle className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
                        )}
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 text-[10px] font-mono">
                        <span
                          className={`px-1.5 py-0.5 rounded border ${
                            EDUCATION_CATEGORY_META[lesson.category].badgeClass
                          }`}
                        >
                          {lesson.level}
                        </span>
                        <span className="text-slate-500">{lesson.readMinutes} min read</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Lesson Reader */}
          {activeLesson && (
            <div className="xl:col-span-8 hud-panel rounded-xl p-5 space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
                <div className="space-y-1.5 max-w-2xl">
                  <div className="flex flex-wrap items-center gap-2 font-mono text-[10px]">
                    <span
                      className={`px-2 py-0.5 rounded border ${
                        EDUCATION_CATEGORY_META[activeLesson.category].badgeClass
                      }`}
                    >
                      {EDUCATION_CATEGORY_META[activeLesson.category].label}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">
                      {activeLesson.level}
                    </span>
                    <span className="text-slate-400">{activeLesson.readMinutes} min read</span>
                  </div>
                  <h3 className="text-lg font-bold text-white leading-snug">
                    {activeLesson.title}
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed">{activeLesson.summary}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {activeLesson.appTab && (
                    <button
                      type="button"
                      onClick={() => setActiveTab(activeLesson.appTab!)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-400/50 text-xs font-mono text-cyan-200 hover:bg-cyan-500/30"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      {activeLesson.appCta ?? 'Try It Live'}
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleLessonComplete(activeLesson.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono border transition-colors ${
                      completedIds.includes(activeLesson.id)
                        ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                        : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-emerald-400/50'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {completedIds.includes(activeLesson.id) ? 'Completed' : 'Mark Complete'}
                  </button>
                </div>
              </div>

              {/* Key Takeaways Box */}
              <div className="rounded-xl bg-cyan-500/5 border border-cyan-400/25 p-4 space-y-2">
                <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-cyan-300 font-semibold">
                  Key Takeaways
                </div>
                <ul className="space-y-1.5 text-xs text-slate-200 list-disc pl-4">
                  {activeLesson.keyTakeaways.map((point, idx) => (
                    <li key={idx} className="leading-relaxed">
                      {point}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Deep Content Sections */}
              <div className="space-y-4">
                {activeLesson.sections.map((sec, idx) => (
                  <div key={idx} className="space-y-1.5">
                    <h4 className="text-sm font-semibold text-white">{sec.heading}</h4>
                    <p className="text-xs text-slate-300 leading-relaxed">{sec.body}</p>
                  </div>
                ))}
              </div>

              {/* Pro Tip Callout */}
              <div className="rounded-xl bg-amber-500/5 border border-amber-400/30 p-3.5 flex items-start gap-2.5">
                <Lightbulb className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-100/90 leading-relaxed">
                  <span className="font-mono font-bold text-amber-300 uppercase mr-1.5">
                    Command Center Pro Tip:
                  </span>
                  {activeLesson.proTip}
                </div>
              </div>

              {/* Official Reference Links */}
              {activeLesson.links.length > 0 && (
                <div className="pt-3 border-t border-slate-800 space-y-2">
                  <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-slate-400">
                    Further Reading (Official Sources)
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {activeLesson.links.map((lnk) => (
                      <a
                        key={lnk.url}
                        href={lnk.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-cyan-400/50 text-xs font-mono text-cyan-300 transition-colors"
                      >
                        {lnk.label}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* VIEW 1B: INTERACTIVE VISUAL EXPLAINER ANIMATIONS */}
      {subTab === 'animations' && <InteractiveExplainers />}

      {/* VIEW 2: INTERACTIVE RESERVE & FEE LAB */}
      {subTab === 'reserve-lab' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-6 hud-panel rounded-xl p-5 space-y-4">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
                Interactive XRPL Account Reserve Simulator
              </h3>
              <p className="text-[11px] text-slate-400 mt-1">
                Drag the sliders to see how Base Reserve (1 XRP) + Owner Reserve (0.2 XRP per ledger object) affect your spendable balance.
              </p>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-300">Total Account Balance</span>
                  <span className="text-white font-bold">{simTotalXrp} XRP</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="1000"
                  step="1"
                  value={simTotalXrp}
                  onChange={(e) => setSimTotalXrp(Number(e.target.value))}
                  className="w-full accent-cyan-400"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-300">Token TrustLines (0.2 XRP each)</span>
                  <span className="text-cyan-300">{simTrustlines} objects</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="50"
                  value={simTrustlines}
                  onChange={(e) => setSimTrustlines(Number(e.target.value))}
                  className="w-full accent-cyan-400"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-300">Open DEX Limit Orders (0.2 XRP each)</span>
                  <span className="text-amber-300">{simDexOffers} objects</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="30"
                  value={simDexOffers}
                  onChange={(e) => setSimDexOffers(Number(e.target.value))}
                  className="w-full accent-amber-400"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-300">NFT Pages (up to 32 NFTs per page, 0.2 XRP)</span>
                  <span className="text-fuchsia-300">{simNftPages} pages</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="20"
                  value={simNftPages}
                  onChange={(e) => setSimNftPages(Number(e.target.value))}
                  className="w-full accent-fuchsia-400"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-300">Active Escrows &amp; Checks (0.2 XRP each)</span>
                  <span className="text-emerald-300">{simEscrowsChecks} objects</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="20"
                  value={simEscrowsChecks}
                  onChange={(e) => setSimEscrowsChecks(Number(e.target.value))}
                  className="w-full accent-emerald-400"
                />
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 hud-panel rounded-xl p-5 space-y-4 font-mono">
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">
              Live Reserve Calculation Result
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-950 border border-cyan-400/30 p-3.5">
                <div className="text-[10px] uppercase text-slate-500">Total Locked Reserve</div>
                <div className="text-xl font-bold text-cyan-300 mt-1 tabular-nums">
                  {simBreakdown.lockedXrp.toFixed(2)} XRP
                </div>
                {marketPrice.xrpUsd !== null && (
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    ≈ {formatUsd(simBreakdown.lockedXrp * marketPrice.xrpUsd)} USD
                  </div>
                )}
              </div>

              <div className="rounded-xl bg-slate-950 border border-emerald-400/30 p-3.5">
                <div className="text-[10px] uppercase text-slate-500">Spendable XRP</div>
                <div className="text-xl font-bold text-emerald-300 mt-1 tabular-nums">
                  {simBreakdown.spendableXrp.toFixed(2)} XRP
                </div>
                {marketPrice.xrpUsd !== null && (
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    ≈ {formatUsd(simBreakdown.spendableXrp * marketPrice.xrpUsd)} USD
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>Locked ({simBreakdown.lockedPct}%)</span>
                <span>Spendable ({simBreakdown.spendablePct}%)</span>
              </div>
              <div className="h-3 rounded-full bg-slate-800 overflow-hidden flex">
                <div className="bg-cyan-400 h-full" style={{ width: `${simBreakdown.lockedPct}%` }} />
                <div className="bg-emerald-400 h-full" style={{ width: `${simBreakdown.spendablePct}%` }} />
              </div>
            </div>

            <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3.5 text-[11px] text-slate-300 space-y-1.5">
              <div>
                • Base Reserve: <span className="text-white">1.00 XRP</span> (required to keep account active)
              </div>
              <div>
                • Owner Reserve: <span className="text-cyan-300">{simOwnerCount} objects × 0.2 XRP = {simBreakdown.ownerReserveXrp.toFixed(2)} XRP</span>
              </div>
              <div>
                • Typical Transaction Fee: <span className="text-emerald-300">12 drops (0.000012 XRP)</span> — 1 XRP pays for ~83,333 transactions!
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: XRPL GLOSSARY */}
      {subTab === 'glossary' && (
        <div className="hud-panel rounded-xl p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={glossaryQuery}
                onChange={(e) => setGlossaryQuery(e.target.value)}
                placeholder="Search glossary terms (UNL, Drops, MPT, NuDB…)"
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(['All', 'Protocol', 'DeFi', 'Security', 'Node Ops'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setGlossaryCat(cat)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-mono border ${
                    glossaryCat === cat
                      ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredGlossary.map((item) => (
              <div
                key={item.term}
                className="rounded-xl bg-slate-950/85 border border-slate-800 p-3.5 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono font-bold text-cyan-200">{item.term}</span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] font-mono text-slate-400">
                    {item.category}
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">{item.definition}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VIEW 4: CURATED OFFICIAL LINKS & DOCS */}
      {subTab === 'links' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {linkGroups.map(([groupName, items]) => (
            <div key={groupName} className="hud-panel rounded-xl p-4 space-y-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
                {groupName}
              </div>
              <div className="space-y-2">
                {items.map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-xl bg-slate-950/80 border border-slate-800 hover:border-cyan-400/50 p-3 transition-colors group"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-white group-hover:text-cyan-200">
                        {link.label}
                      </span>
                      <ExternalLink className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">{link.description}</p>
                    <div className="text-[10px] font-mono text-slate-500 mt-1 truncate">
                      {link.url}
                    </div>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
