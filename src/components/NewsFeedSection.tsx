import React from 'react';
import { ExternalLink, Newspaper, RefreshCw, Search } from 'lucide-react';
import type { NewsArticle } from '../types/release';

export type NewsTopic = 'all' | 'nepali' | 'movies' | 'games';

interface NewsFeedSectionProps {
  articles: NewsArticle[];
  loading: boolean;
  topic: NewsTopic;
  updatedAt: string | null;
  onTopicChange: (topic: NewsTopic) => void;
  onRefresh: () => void;
  onFindRelease: (article: NewsArticle) => void;
}

const TOPIC_OPTIONS: Array<{ id: NewsTopic; label: string }> = [
  { id: 'all', label: 'All News' },
  { id: 'nepali', label: 'Nepali Cinema' },
  { id: 'movies', label: 'Movies' },
  { id: 'games', label: 'Games' },
];

function formatRelativeTime(isoDate: string): string {
  const ts = Date.parse(isoDate);
  if (Number.isNaN(ts)) return 'Recent';
  const diffMins = Math.max(1, Math.floor((Date.now() - ts) / 60000));
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays <= 7) return `${diffDays}d ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatUpdatedClock(isoDate: string | null): string {
  if (!isoDate) return '';
  const ts = Date.parse(isoDate);
  if (Number.isNaN(ts)) return '';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export const NewsFeedSection: React.FC<NewsFeedSectionProps> = ({
  articles,
  loading,
  topic,
  updatedAt,
  onTopicChange,
  onRefresh,
  onFindRelease,
}) => {
  const clock = formatUpdatedClock(updatedAt);

  return (
    <section
      aria-labelledby="live-news-heading"
      className="rounded-2xl bg-[#13151B] border border-white/[0.08] overflow-hidden"
    >
      {/* Header Row */}
      <div className="p-4 sm:p-5 border-b border-white/[0.08] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Newspaper className="w-4 h-4 text-[#E5484D] shrink-0" />
            <h2 id="live-news-heading" className="font-display text-lg sm:text-xl font-bold text-[#F4F5F7]">
              Live Movie &amp; Game News Wire
            </h2>
          </div>
          <p className="text-xs text-[#9499A6]">
            Latest announcements, release date shifts, and trailers across Nepali cinema, world films, and games
            {clock ? (
              <span className="font-mono tabular-nums text-[#C9CDD6]"> · Updated {clock}</span>
            ) : null}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {TOPIC_OPTIONS.map((opt) => {
              const active = topic === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onTopicChange(opt.id)}
                  className={`min-h-[40px] px-3 rounded-xl text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-[#E5484D] text-white'
                      : 'bg-[#0B0C0F] border border-white/[0.08] text-[#9499A6] hover:text-[#F4F5F7]'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="min-h-[40px] px-3.5 rounded-xl bg-white/[0.08] text-xs font-medium text-[#F4F5F7] hover:bg-white/15 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Refreshing...' : 'Update News'}</span>
          </button>
        </div>
      </div>

      {/* News List */}
      {loading && articles.length === 0 ? (
        <div className="divide-y divide-white/[0.06]">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div key={idx} className="p-4 sm:px-5 space-y-2 animate-pulse">
              <div className="h-3 w-40 bg-white/[0.06] rounded" />
              <div className="h-4 w-5/6 bg-white/[0.08] rounded" />
            </div>
          ))}
        </div>
      ) : articles.length === 0 ? (
        <div className="p-8 text-center space-y-2">
          <p className="text-sm text-[#C9CDD6]">No live news headlines loaded right now.</p>
          <button
            type="button"
            onClick={onRefresh}
            className="min-h-[40px] px-4 rounded-xl bg-white/[0.08] text-xs font-medium text-white hover:bg-white/15 cursor-pointer"
          >
            Retry News Feed
          </button>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.06]">
          {articles.map((article) => (
            <article
              key={article.id}
              className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-white/[0.02] transition-colors"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#9499A6]">
                  <span className="font-semibold text-[#E5484D]">{article.category}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-[#C9CDD6]">{article.source}</span>
                  <span aria-hidden="true">·</span>
                  <time dateTime={article.publishedAt} className="font-mono tabular-nums">
                    {formatRelativeTime(article.publishedAt)}
                  </time>
                </div>

                <a
                  href={article.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-start gap-2 text-sm sm:text-[15px] font-medium text-[#F4F5F7] hover:text-white leading-snug"
                >
                  <span className="line-clamp-2">{article.title}</span>
                  <ExternalLink className="w-3.5 h-3.5 text-[#707584] group-hover:text-[#E5484D] shrink-0 mt-1" />
                </a>
              </div>

              <button
                type="button"
                onClick={() => onFindRelease(article)}
                title="Search Movies and Games for release date and details"
                className="min-h-[40px] px-3 rounded-xl bg-[#0B0C0F] border border-white/[0.08] text-xs font-medium text-[#C9CDD6] hover:text-white hover:border-white/20 inline-flex items-center gap-1.5 self-start sm:self-center shrink-0 whitespace-nowrap cursor-pointer"
              >
                <Search className="w-3.5 h-3.5" />
                <span>Find Release</span>
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};
