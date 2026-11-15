import React, { useEffect, useState } from 'react';
import {
  Bookmark,
  CalendarPlus,
  ExternalLink,
  Film,
  Gamepad2,
  Heart,
  Newspaper,
  Play,
  Star,
  X,
} from 'lucide-react';
import type { NewsArticle, ReleaseDetails, ReleaseItem } from '../types/release';
import {
  type ArtworkResult,
  downloadICSReminder,
  getArtworkForItem,
  getCountdownLabel,
} from '../utils/releaseHelpers';

interface ReleaseDetailSheetProps {
  item: ReleaseItem | null;
  assignedArtwork?: ArtworkResult;
  inWatchlist: boolean;
  isFavorite: boolean;
  userNotes?: string;
  onClose: () => void;
  onToggleWatchlist: (item: ReleaseItem) => void;
  onToggleFavorite: (item: ReleaseItem) => void;
  onSaveNotes?: (itemId: string, notes: string) => void;
}

export const ReleaseDetailSheet: React.FC<ReleaseDetailSheetProps> = ({
  item,
  assignedArtwork,
  inWatchlist,
  isFavorite,
  userNotes = '',
  onClose,
  onToggleWatchlist,
  onToggleFavorite,
  onSaveNotes,
}) => {
  const [details, setDetails] = useState<ReleaseDetails | null>(null);
  const [itemNews, setItemNews] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [noteDraft, setNoteDraft] = useState(userNotes);
  const [noteSaved, setNoteSaved] = useState(false);

  useEffect(() => {
    setNoteDraft(userNotes);
    setNoteSaved(false);
  }, [userNotes, item?.id]);

  useEffect(() => {
    if (!item) {
      setDetails(null);
      setItemNews([]);
      return;
    }

    setImgError(false);
    let cancelled = false;
    setLoading(true);
    setDetails(null);
    setItemNews([]);

    fetch('/api/details', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: item.title,
        mediaType: item.mediaType,
        region: item.region,
        releaseYear: item.releaseYear,
      }),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to load details'))))
      .then((data: { details?: ReleaseDetails }) => {
        if (!cancelled && data.details) {
          setDetails(data.details);
        }
      })
      .catch(() => {
        // Keep base ReleaseItem info if offline or transient error
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const topicParam =
      item.mediaType === 'game' ? 'games' : item.region === 'Nepali' ? 'nepali' : 'movies';
    fetch(`/api/news?topic=${topicParam}&q=${encodeURIComponent(item.title)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { articles?: NewsArticle[] } | null) => {
        if (!cancelled && Array.isArray(data?.articles)) {
          setItemNews(data.articles.slice(0, 4));
        }
      })
      .catch(() => {
        // Ignore transient news fetch errors
      });

    return () => {
      cancelled = true;
    };
  }, [item]);

  if (!item) return null;

  const activeData = details || item;
  const artwork = assignedArtwork || getArtworkForItem(activeData);
  const countdown = getCountdownLabel(activeData);
  const trailerUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(
    details?.trailerQuery || `${activeData.title} ${activeData.releaseYear ?? ''} official trailer`
  )}`;

  const handleNoteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSaveNotes) return;
    onSaveNotes(activeData.id, noteDraft);
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-sheet-title"
        className="relative flex flex-col w-full md:max-w-2xl max-h-[90vh] rounded-t-3xl md:rounded-2xl bg-[#13151B] border border-white/10 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile drag handle */}
        <div className="pt-3 pb-1 md:hidden bg-[#13151B] shrink-0">
          <div className="w-10 h-1.5 bg-white/20 rounded-full mx-auto" />
        </div>

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close release details"
          className="absolute top-3 right-3 z-20 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-[#0B0C0F]/80 text-[#F4F5F7] hover:bg-[#0B0C0F] transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Scrollable Sheet Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="relative h-52 sm:h-64 w-full bg-[#0B0C0F]">
            {!imgError ? (
              <img
                src={artwork.src}
                alt={activeData.title}
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className={`h-full w-full bg-gradient-to-br ${artwork.tint} flex items-center justify-center`}>
                {activeData.mediaType === 'game' ? (
                  <Gamepad2 className="w-12 h-12 text-white/25" />
                ) : (
                  <Film className="w-12 h-12 text-white/25" />
                )}
              </div>
            )}
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-t from-[#13151B] via-[#13151B]/50 to-transparent"
            />
            <div className="absolute bottom-4 left-5 right-5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#C9CDD6]">
                <span className="text-[#E5484D] font-semibold">{activeData.region}</span>
                <span aria-hidden="true">·</span>
                <span>{activeData.mediaType === 'game' ? 'Video Game' : 'Feature Film'}</span>
                <span aria-hidden="true">·</span>
                <span>{activeData.language}</span>
                {details?.ageRating && details.ageRating !== 'Unrated' && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{details.ageRating}</span>
                  </>
                )}
              </div>
              <h2
                id="detail-sheet-title"
                className="mt-1 font-display text-2xl sm:text-3xl font-bold text-[#F4F5F7] leading-tight"
              >
                {activeData.title}
              </h2>
              {activeData.originalTitle && activeData.originalTitle !== activeData.title && (
                <p className="text-sm text-[#C9CDD6] mt-0.5">{activeData.originalTitle}</p>
              )}
            </div>
          </div>

          <div className="p-5 sm:p-6 space-y-6">
            {/* Primary Release & Rating Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pb-5 border-b border-white/[0.08]">
              <div>
                <p className="text-xs text-[#9499A6]">Release Window</p>
                <p className="mt-1 font-mono text-sm font-semibold text-[#F4F5F7] tabular-nums">
                  {activeData.displayDate}
                </p>
                <p className="mt-0.5 font-mono text-xs text-[#E5484D] tabular-nums">
                  {countdown}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#9499A6]">
                  {activeData.mediaType === 'game' ? 'Playtime / Scope' : 'Runtime'}
                </p>
                <p className="mt-1 font-mono text-sm font-medium text-[#F4F5F7] tabular-nums">
                  {activeData.runtimeOrPlaytime}
                </p>
                <p className="mt-0.5 text-xs text-[#9499A6]">{activeData.status}</p>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <p className="text-xs text-[#9499A6]">User Rating</p>
                {activeData.rating !== null ? (
                  <p className="mt-1 inline-flex items-center gap-1.5 font-mono text-sm font-semibold text-[#F4F5F7] tabular-nums">
                    <Star className="w-4 h-4 text-[#F5A623] fill-[#F5A623]" />
                    {activeData.rating.toFixed(1)} / 10
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-[#9499A6]">Awaiting Release</p>
                )}
              </div>
            </div>

            {/* Synopsis / Extended Overview */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-[#F4F5F7]">Overview</h3>
              <p className="text-sm leading-relaxed text-[#C9CDD6]">
                {details?.extendedOverview || activeData.synopsis}
              </p>
              {activeData.releaseNotes && (
                <p className="text-xs leading-relaxed text-[#9499A6] pt-1">
                  {activeData.releaseNotes}
                </p>
              )}
              {loading && (
                <p className="text-xs text-[#9499A6]">Loading regional dates and web sources...</p>
              )}
            </div>

            {/* Credits & Platforms */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4 border-y border-white/[0.08]">
              <div>
                <p className="text-xs text-[#9499A6]">
                  {activeData.mediaType === 'game' ? 'Developer' : 'Director'}
                </p>
                <p className="mt-1 text-sm font-medium text-[#F4F5F7]">{activeData.creator}</p>
                {activeData.castOrStudio.length > 0 && (
                  <p className="mt-1 text-xs text-[#9499A6]">
                    {activeData.castOrStudio.join(' · ')}
                  </p>
                )}
              </div>

              <div>
                <p className="text-xs text-[#9499A6]">
                  {activeData.mediaType === 'game' ? 'Platforms' : 'Where to Watch'}
                </p>
                <p className="mt-1 text-sm font-medium text-[#F4F5F7]">
                  {(details?.whereToAccess?.length ? details.whereToAccess : activeData.platforms).join(' · ')}
                </p>
                <p className="mt-1 text-xs text-[#9499A6]">
                  {activeData.genres.join(' · ')}
                </p>
              </div>
            </div>

            {/* Personal Note when saved */}
            {(inWatchlist || isFavorite) && onSaveNotes && (
              <form onSubmit={handleNoteSubmit} className="space-y-2">
                <label htmlFor="personal-note-input" className="block text-sm font-semibold text-[#F4F5F7]">
                  Personal Note
                </label>
                <div className="flex gap-2">
                  <input
                    id="personal-note-input"
                    type="text"
                    maxLength={300}
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="Add a reminder (e.g., watch at QFX with friends, play on PS5)..."
                    className="flex-1 min-h-[44px] rounded-xl bg-[#0B0C0F] border border-white/10 px-3.5 text-xs text-[#F4F5F7] placeholder:text-[#707584] focus:outline-none focus:border-[#E5484D]"
                  />
                  <button
                    type="submit"
                    className="min-h-[44px] px-4 rounded-xl bg-white/10 text-xs font-medium text-white hover:bg-white/15 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {noteSaved ? 'Saved' : 'Save Note'}
                  </button>
                </div>
              </form>
            )}

            {/* Regional Release Breakdown */}
            {details?.regionalDates && details.regionalDates.length > 0 && (
              <div className="space-y-2.5">
                <h3 className="text-sm font-semibold text-[#F4F5F7]">Regional Release Dates</h3>
                <div className="divide-y divide-white/[0.06] rounded-xl bg-[#0B0C0F] border border-white/[0.06]">
                  {details.regionalDates.map((rd, idx) => (
                    <div
                      key={`${rd.territory}-${idx}`}
                      className="flex items-center justify-between gap-4 px-4 py-3 text-xs"
                    >
                      <span className="font-medium text-[#F4F5F7]">{rd.territory}</span>
                      <div className="text-right">
                        <span className="font-mono text-[#F4F5F7] tabular-nums">{rd.date}</span>
                        <span className="text-[#9499A6] ml-2">· {rd.format}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reception & Buzz */}
            {details?.receptionSummary && (
              <div className="space-y-1.5">
                <h3 className="text-sm font-semibold text-[#F4F5F7]">Reception &amp; Anticipation</h3>
                <p className="text-xs leading-relaxed text-[#9499A6]">{details.receptionSummary}</p>
              </div>
            )}

            {/* Latest Title News */}
            {itemNews.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <Newspaper className="w-4 h-4 text-[#E5484D]" />
                  <h3 className="text-sm font-semibold text-[#F4F5F7]">Latest News</h3>
                </div>
                <div className="divide-y divide-white/[0.06] rounded-xl bg-[#0B0C0F] border border-white/[0.06]">
                  {itemNews.map((article) => (
                    <a
                      key={article.id}
                      href={article.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors"
                    >
                      <div className="min-w-0 space-y-1">
                        <p className="text-xs font-medium text-[#F4F5F7] leading-snug line-clamp-2">
                          {article.title}
                        </p>
                        <p className="text-[11px] text-[#9499A6] font-mono tabular-nums">
                          {article.source} ·{' '}
                          {new Date(article.publishedAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </p>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-[#707584] shrink-0 mt-0.5" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Verified Grounded Web Sources */}
            {activeData.sources && activeData.sources.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-[#F4F5F7]">Verified Web Sources</h3>
                <div className="flex flex-wrap gap-3">
                  {activeData.sources.map((src) => (
                    <a
                      key={src.uri}
                      href={src.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-[#C9CDD6] hover:text-white underline underline-offset-4"
                    >
                      <span className="truncate max-w-[220px]">{src.title}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sticky Bottom Action Bar */}
        <div className="p-4 pb-safe bg-[#0B0C0F]/95 border-t border-white/[0.08] flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onToggleWatchlist(activeData)}
            className={`flex-1 min-h-[48px] px-3.5 rounded-xl text-xs sm:text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
              inWatchlist
                ? 'bg-[#F4F5F7] text-[#0B0C0F]'
                : 'bg-[#E5484D] text-white hover:bg-[#D13B40]'
            }`}
          >
            <Bookmark className={`w-4 h-4 shrink-0 ${inWatchlist ? 'fill-current' : ''}`} />
            <span>{inWatchlist ? 'In Watchlist' : 'Watchlist'}</span>
          </button>

          <button
            type="button"
            onClick={() => onToggleFavorite(activeData)}
            aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            className={`min-h-[48px] px-3.5 rounded-xl text-xs sm:text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              isFavorite
                ? 'bg-[#E5484D] text-white'
                : 'bg-[#1C2029] text-[#F4F5F7] hover:bg-[#252A36]'
            }`}
          >
            <Heart className={`w-4 h-4 shrink-0 ${isFavorite ? 'fill-current' : ''}`} />
            <span className="hidden sm:inline">{isFavorite ? 'Favorited' : 'Favorite'}</span>
          </button>

          <button
            type="button"
            onClick={() => downloadICSReminder(activeData)}
            title="Add release date to iPhone or Android calendar"
            className="min-h-[48px] px-3.5 rounded-xl bg-[#1C2029] text-xs sm:text-sm font-medium text-[#F4F5F7] hover:bg-[#252A36] inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <CalendarPlus className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Calendar</span>
          </button>

          <a
            href={trailerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[48px] px-3.5 rounded-xl bg-[#1C2029] text-xs sm:text-sm font-medium text-[#F4F5F7] hover:bg-[#252A36] inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0"
          >
            <Play className="w-4 h-4 shrink-0" />
            <span>Trailer</span>
          </a>
        </div>
      </div>
    </div>
  );
};
