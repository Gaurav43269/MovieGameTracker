import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bookmark,
  Compass,
  Film,
  Gamepad2,
  Info,
  Newspaper,
  RefreshCw,
  User as UserIcon,
  WifiOff,
  X,
} from 'lucide-react';
import heroBannerImg from './assets/images/hero_release_radar_1794763051712.jpg';
import { NewsFeedSection, type NewsTopic } from './components/NewsFeedSection';
import { ProfileView } from './components/ProfileView';
import { PWAInstallButton } from './components/PWAInstallButton';
import { ReleaseCard } from './components/ReleaseCard';
import { ReleaseDetailSheet } from './components/ReleaseDetailSheet';
import { SearchFilterBar } from './components/SearchFilterBar';
import { useAuth } from './context/AuthContext';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import type { NewsArticle, ReleaseItem, SearchFilterState } from './types/release';
import { assignUniqueArtworks, filterReleases, sortReleases } from './utils/releaseHelpers';

type ActiveView = 'discover' | 'movies' | 'games' | 'lists' | 'profile';

const FEED_CACHE_KEY = 'cue_discover_cache_v4';

const DEFAULT_FILTERS: SearchFilterState = {
  query: '',
  mediaType: 'all',
  region: 'All',
  genre: 'All',
  releaseYear: 'All',
  platform: 'All',
  status: 'all',
  sortBy: 'release_asc',
};

const QUICK_PROMPTS: Array<{
  label: string;
  patch: Partial<SearchFilterState>;
  liveQuery?: boolean;
}> = [
  { label: 'Nepali Cinema', patch: { mediaType: 'movie', region: 'Nepali', query: '' } },
  { label: 'Hollywood & English', patch: { mediaType: 'movie', region: 'Hollywood', query: '' } },
  { label: 'PS5 & PC Games', patch: { mediaType: 'game', platform: 'PS5', region: 'All' } },
  { label: 'Mobile Games (iOS/Android)', patch: { mediaType: 'game', platform: 'iOS', region: 'All' }, liveQuery: true },
  { label: 'Top Rated', patch: { sortBy: 'rating', mediaType: 'all', region: 'All' } },
];

function loadCachedFeed(): ReleaseItem[] {
  try {
    const raw = localStorage.getItem(FEED_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ReleaseItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function App() {
  const isOnline = useOnlineStatus();
  const {
    user,
    profile,
    savedItems,
    toggleWatchlist,
    toggleFavorite,
    updateItemNotes,
    isInWatchlist,
    isFavorite,
  } = useAuth();

  const [activeView, setActiveView] = useState<ActiveView>('discover');
  const [filters, setFilters] = useState<SearchFilterState>(DEFAULT_FILTERS);
  const [discoverItems, setDiscoverItems] = useState<ReleaseItem[]>(() => loadCachedFeed());
  const [searchResults, setSearchResults] = useState<ReleaseItem[] | null>(null);
  const [loadingFeed, setLoadingFeed] = useState<boolean>(discoverItems.length === 0);
  const [searching, setSearching] = useState<boolean>(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [feedNotice, setFeedNotice] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<ReleaseItem | null>(null);
  const [heroImgError, setHeroImgError] = useState(false);

  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>([]);
  const [loadingNews, setLoadingNews] = useState<boolean>(true);
  const [newsUpdatedAt, setNewsUpdatedAt] = useState<string | null>(null);
  const [newsTopic, setNewsTopic] = useState<NewsTopic>('all');
  const lastAutoSyncRef = useRef<number>(Date.now());
  const newsSectionRef = useRef<HTMLDivElement | null>(null);

  // Sync user's preferred region once on profile load if no filter chosen yet
  const [appliedProfilePref, setAppliedProfilePref] = useState(false);
  useEffect(() => {
    if (profile && !appliedProfilePref && profile.preferredRegion !== 'All') {
      setAppliedProfilePref(true);
      setFilters((prev) => ({
        ...prev,
        region: profile.preferredRegion,
      }));
    }
  }, [profile, appliedProfilePref]);

  const fetchDiscover = useCallback(async (refresh = false) => {
    setLoadingFeed(true);
    setFeedError(null);
    try {
      const res = await fetch(`/api/discover${refresh ? '?refresh=true' : ''}`);
      const data = (await res.json()) as { items?: ReleaseItem[]; notice?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Unable to load releases');
      }
      setFeedNotice(data.notice || null);
      if (Array.isArray(data.items)) {
        setDiscoverItems(data.items);
        try {
          localStorage.setItem(FEED_CACHE_KEY, JSON.stringify(data.items));
        } catch {
          // Ignore storage limit
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to reach release service';
      setFeedError(msg);
    } finally {
      setLoadingFeed(false);
    }
  }, []);

  const fetchNews = useCallback(async (topic: NewsTopic, refresh = false) => {
    setLoadingNews(true);
    try {
      const res = await fetch(
        `/api/news?topic=${encodeURIComponent(topic)}${refresh ? '&refresh=true' : ''}`
      );
      if (!res.ok) return;
      const data = (await res.json()) as { articles?: NewsArticle[]; updatedAt?: string };
      if (Array.isArray(data.articles)) {
        setNewsArticles(data.articles);
      }
      if (data.updatedAt) {
        setNewsUpdatedAt(data.updatedAt);
      }
    } catch {
      // Keep existing articles silently on transient offline errors
    } finally {
      setLoadingNews(false);
    }
  }, []);

  useEffect(() => {
    fetchDiscover(false);
    fetchNews('all', false);
  }, [fetchDiscover, fetchNews]);

  // Automatically refresh releases and news when user returns to the app or every 5 minutes
  useEffect(() => {
    const triggerAutoRefresh = () => {
      if (!isOnline) return;
      const now = Date.now();
      if (now - lastAutoSyncRef.current < 1000 * 60 * 3) return;
      lastAutoSyncRef.current = now;
      fetchDiscover(true);
      fetchNews(newsTopic, true);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        triggerAutoRefresh();
      }
    };

    window.addEventListener('focus', triggerAutoRefresh);
    document.addEventListener('visibilitychange', handleVisibility);
    const interval = window.setInterval(triggerAutoRefresh, 1000 * 60 * 5);

    return () => {
      window.removeEventListener('focus', triggerAutoRefresh);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.clearInterval(interval);
    };
  }, [fetchDiscover, fetchNews, isOnline, newsTopic]);

  const handleLiveSearch = useCallback(
    async (overrideFilters?: SearchFilterState) => {
      const active = overrideFilters || filters;
      const hasCriteria =
        active.query.trim().length > 0 ||
        active.genre !== 'All' ||
        active.releaseYear !== 'All' ||
        active.platform !== 'All' ||
        active.region !== 'All';

      if (!hasCriteria) {
        setSearchResults(null);
        return;
      }

      setSearching(true);
      setFeedError(null);
      try {
        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: active.query.trim(),
            mediaType: active.mediaType,
            genre: active.genre,
            releaseYear: active.releaseYear,
            platform: active.platform,
            region: active.region,
          }),
        });
        const data = (await res.json()) as { items?: ReleaseItem[]; notice?: string; error?: string };
        if (!res.ok) {
          throw new Error(data.error || 'Search failed');
        }
        if (data.notice) setFeedNotice(data.notice);
        if (Array.isArray(data.items)) {
          setSearchResults(data.items);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Live search failed';
        setFeedError(msg);
      } finally {
        setSearching(false);
      }
    },
    [filters]
  );

  const handleNavChange = (view: ActiveView) => {
    setActiveView(view);
    if (view === 'discover') {
      setFilters((prev) => ({ ...prev, mediaType: 'all' }));
      setNewsTopic('all');
      fetchNews('all', false);
    } else if (view === 'movies') {
      setFilters((prev) => ({ ...prev, mediaType: 'movie', platform: 'All' }));
      setNewsTopic('movies');
      fetchNews('movies', false);
    } else if (view === 'games') {
      setFilters((prev) => ({ ...prev, mediaType: 'game' }));
      setNewsTopic('games');
      fetchNews('games', false);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleResetFilters = () => {
    const mediaType =
      activeView === 'movies' ? 'movie' : activeView === 'games' ? 'game' : 'all';
    setFilters({ ...DEFAULT_FILTERS, mediaType });
    setSearchResults(null);
    setFeedError(null);
  };

  const handleQuickShortcut = (shortcut: (typeof QUICK_PROMPTS)[number]) => {
    const next: SearchFilterState = {
      ...DEFAULT_FILTERS,
      ...shortcut.patch,
    };
    setFilters(next);
    setActiveView(
      next.mediaType === 'movie' ? 'movies' : next.mediaType === 'game' ? 'games' : 'discover'
    );
    if (shortcut.liveQuery) {
      handleLiveSearch(next);
    } else {
      setSearchResults(null);
    }
  };

  const handleNewsTopicChange = (topic: NewsTopic) => {
    setNewsTopic(topic);
    fetchNews(topic, false);
  };

  const handleFindReleaseFromNews = (article: NewsArticle) => {
    const quoted = article.title.match(/['"‘“]([^'"’”]{2,45})['"’”]/);
    const extractedQuery = quoted
      ? quoted[1].trim()
      : article.title
          .replace(/[:|–—-].*$/, '')
          .split(/\s+/)
          .slice(0, 5)
          .join(' ')
          .trim();

    const nextFilters: SearchFilterState = {
      ...DEFAULT_FILTERS,
      query: extractedQuery || article.title.slice(0, 40),
      mediaType: article.category === 'Games' ? 'game' : 'movie',
      region: article.category === 'Nepali' ? 'Nepali' : 'All',
    };
    setFilters(nextFilters);
    setActiveView(nextFilters.mediaType === 'game' ? 'games' : 'movies');
    handleLiveSearch(nextFilters);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Combine discoverItems and searchResults cleanly without duplicates
  const combinedSourceItems = useMemo(() => {
    if (searchResults) {
      const map = new Map<string, ReleaseItem>();
      for (const item of searchResults) {
        map.set(item.id, item);
      }
      for (const item of discoverItems) {
        if (!map.has(item.id)) {
          map.set(item.id, item);
        }
      }
      return Array.from(map.values());
    }
    return discoverItems;
  }, [discoverItems, searchResults]);

  const displayedReleases = useMemo(() => {
    const baseFiltered = filterReleases(combinedSourceItems, filters);
    return sortReleases(baseFiltered, filters.sortBy);
  }, [combinedSourceItems, filters]);

  const artworkMap = useMemo(
    () => assignUniqueArtworks(displayedReleases),
    [displayedReleases]
  );

  const selectedSavedRecord = useMemo(() => {
    if (!selectedItem) return undefined;
    return savedItems.find((s) => s.id === selectedItem.id);
  }, [selectedItem, savedItems]);

  const isBrowseView = activeView === 'discover' || activeView === 'movies' || activeView === 'games';
  const watchlistCount = savedItems.filter((s) => s.inWatchlist).length;

  return (
    <div className="min-h-screen bg-[#0B0C0F] text-[#F4F5F7] flex flex-col">
      {/* Desktop Top Bar (Strict 3-zone contract: Wordmark — 5 Nav Links — 1 Primary Action) */}
      <header className="hidden md:flex sticky top-0 z-30 bg-[#0B0C0F]/90 backdrop-blur-md border-b border-white/[0.08]">
        <div className="w-full max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => handleNavChange('discover')}
            className="font-display text-lg sm:text-xl font-bold tracking-tight text-[#F4F5F7] whitespace-nowrap shrink-0 cursor-pointer"
          >
            Movies and Games
          </button>

          <nav aria-label="Primary navigation" className="flex items-center gap-7 text-sm font-medium">
            {(
              [
                { id: 'discover', label: 'Discover' },
                { id: 'movies', label: 'Movies' },
                { id: 'games', label: 'Games' },
                { id: 'lists', label: `Watchlist (${watchlistCount})` },
                { id: 'profile', label: user ? profile?.displayName?.split(' ')[0] || 'Profile' : 'Sign In' },
              ] as Array<{ id: ActiveView; label: string }>
            ).map((nav) => {
              const active = activeView === nav.id;
              return (
                <button
                  key={nav.id}
                  type="button"
                  onClick={() => handleNavChange(nav.id)}
                  className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                    active
                      ? 'text-[#F4F5F7] border-[#E5484D]'
                      : 'text-[#9499A6] border-transparent hover:text-[#F4F5F7]'
                  }`}
                >
                  {nav.label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center shrink-0">
            <PWAInstallButton />
          </div>
        </div>
      </header>

      {/* Mobile Top Bar (compact 48px to stay well below 15% sticky height cap) */}
      <header className="md:hidden sticky top-0 z-30 pt-safe bg-[#0B0C0F]/90 backdrop-blur-md border-b border-white/[0.08]">
        <div className="h-12 px-4 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => handleNavChange('discover')}
            className="font-display text-base font-bold tracking-tight text-[#F4F5F7] whitespace-nowrap shrink-0 cursor-pointer"
          >
            Movies and Games
          </button>
          <PWAInstallButton compact />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 pt-5 sm:pt-8 pb-24 md:pb-14 space-y-7">
        {/* Hero Banner on Discover View */}
        {activeView === 'discover' && (
          <section className="relative rounded-2xl overflow-hidden border border-white/[0.08] bg-[#13151B]">
            <div className="relative min-h-[210px] sm:min-h-[250px] flex items-end">
              {!heroImgError ? (
                <img
                  src={heroBannerImg}
                  alt="Cinema screening and gaming lounge"
                  referrerPolicy="no-referrer"
                  onError={() => setHeroImgError(true)}
                  className="absolute inset-0 h-full w-full object-cover object-center"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-[#1C1618] via-[#13151B] to-[#0B0C0F]" />
              )}
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-[#0B0C0F] via-[#0B0C0F]/75 to-[#0B0C0F]/30"
              />
              <div className="relative z-10 w-full p-5 sm:p-8 flex flex-col lg:flex-row lg:items-end justify-between gap-5">
                <div className="max-w-2xl space-y-2">
                  <p className="text-xs font-medium text-[#E5484D]">
                    Worldwide Movies &amp; Video Games · Android, iPhone &amp; Web
                  </p>
                  <h1 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-[#F4F5F7] text-balance leading-[1.15]">
                    Every cinema and game release date in one radar.
                  </h1>
                  <p className="text-sm text-[#C9CDD6] max-w-xl leading-relaxed">
                    Track Nepali films, Hollywood blockbusters, Bollywood, Asian cinema, and upcoming PS5, PC, Xbox, Switch, and mobile game drops.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => newsSectionRef.current?.scrollIntoView({ behavior: 'smooth' })}
                    className="min-h-[44px] px-4 rounded-xl bg-white/10 backdrop-blur-sm text-xs font-medium text-[#F4F5F7] hover:bg-white/15 inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Newspaper className="w-3.5 h-3.5 text-[#E5484D]" />
                    <span>Latest News</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      lastAutoSyncRef.current = Date.now();
                      fetchDiscover(true);
                      fetchNews(newsTopic, true);
                    }}
                    disabled={loadingFeed}
                    className="min-h-[44px] px-4 rounded-xl bg-white/10 backdrop-blur-sm text-xs font-medium text-[#F4F5F7] hover:bg-white/15 inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingFeed ? 'animate-spin' : ''}`} />
                    <span>{loadingFeed ? 'Updating...' : 'Refresh Radar'}</span>
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Section Header for Movies / Games views */}
        {(activeView === 'movies' || activeView === 'games') && (
          <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-2 border-b border-white/[0.08]">
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#F4F5F7]">
                {activeView === 'movies' ? 'Global & Nepali Movies' : 'Upcoming & Recent Games'}
              </h1>
              <p className="mt-1 text-sm text-[#9499A6]">
                {activeView === 'movies'
                  ? 'Theatrical and streaming release dates across Nepali, English, Bollywood, Korean, and world cinema.'
                  : 'Release dates across PS5, PC, Xbox Series X|S, Nintendo Switch 2, iOS, and Android.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => fetchDiscover(true)}
              disabled={loadingFeed}
              className="min-h-[44px] px-4 rounded-xl bg-[#13151B] border border-white/10 text-xs font-medium text-[#F4F5F7] hover:bg-[#1C2029] inline-flex items-center gap-2 self-start sm:self-auto cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingFeed ? 'animate-spin' : ''}`} />
              <span>Refresh Feed</span>
            </button>
          </section>
        )}

        {/* Browse Views: Discover / Movies / Games */}
        {isBrowseView && (
          <>
            <SearchFilterBar
              filters={filters}
              onChange={setFilters}
              onLiveSearch={handleLiveSearch}
              onReset={handleResetFilters}
              isSearching={searching}
              totalMatching={displayedReleases.length}
            />

            {/* Quick Thumb Discovery Bar */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
              {QUICK_PROMPTS.map((shortcut) => (
                <button
                  key={shortcut.label}
                  type="button"
                  onClick={() => handleQuickShortcut(shortcut)}
                  className="min-h-[40px] px-3.5 rounded-xl bg-[#13151B] border border-white/[0.08] text-xs font-medium text-[#C9CDD6] hover:text-white hover:border-white/20 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {shortcut.label}
                </button>
              ))}
            </div>

            {feedNotice && !feedError && (
              <div
                role="status"
                className="rounded-xl bg-[#13151B] border border-white/10 px-4 py-3 flex items-center justify-between gap-3 text-xs text-[#C9CDD6]"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Info className="w-4 h-4 text-[#E5484D] shrink-0" />
                  <span className="leading-relaxed">{feedNotice}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setFeedNotice(null)}
                  aria-label="Dismiss notice"
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#9499A6] hover:text-white cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {feedError && (
              <div
                role="alert"
                className="rounded-2xl bg-[#1C1416] border border-[#E5484D]/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <p className="text-sm text-[#F4F5F7]">{feedError}</p>
                <button
                  type="button"
                  onClick={() => fetchDiscover(true)}
                  className="min-h-[40px] px-4 rounded-xl bg-[#E5484D] text-xs font-medium text-white hover:bg-[#D13B40] self-start sm:self-auto cursor-pointer whitespace-nowrap"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Loading Skeletons */}
            {(loadingFeed || searching) && displayedReleases.length === 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="rounded-2xl bg-[#13151B] border border-white/[0.08] overflow-hidden animate-pulse"
                  >
                    <div className="aspect-[16/10] bg-white/[0.04]" />
                    <div className="p-4 space-y-3">
                      <div className="h-3 w-1/3 bg-white/[0.06] rounded" />
                      <div className="h-5 w-3/4 bg-white/[0.08] rounded" />
                      <div className="h-3 w-full bg-white/[0.05] rounded" />
                      <div className="h-3 w-2/3 bg-white/[0.05] rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : displayedReleases.length === 0 ? (
              <div className="rounded-2xl bg-[#13151B] border border-white/[0.08] p-10 text-center space-y-3">
                <p className="font-display text-lg font-semibold text-[#F4F5F7]">
                  No matching titles in the current view
                </p>
                <p className="text-sm text-[#9499A6] max-w-md mx-auto">
                  Search live across the web to pull release dates for any Nepali movie, world film, or game matching your filters.
                </p>
                <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleLiveSearch()}
                    disabled={searching}
                    className="min-h-[44px] px-5 rounded-xl bg-[#E5484D] text-white text-sm font-medium hover:bg-[#D13B40] transition-colors cursor-pointer"
                  >
                    {searching ? 'Searching...' : 'Search Worldwide Live'}
                  </button>
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="min-h-[44px] px-5 rounded-xl bg-white/[0.08] text-sm font-medium text-[#F4F5F7] hover:bg-white/15 transition-colors cursor-pointer"
                  >
                    Reset Filters
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {displayedReleases.map((item) => (
                  <ReleaseCard
                    key={item.id}
                    item={item}
                    assignedArtwork={artworkMap[item.id]}
                    inWatchlist={isInWatchlist(item.id)}
                    isFavorite={isFavorite(item.id)}
                    onToggleWatchlist={toggleWatchlist}
                    onToggleFavorite={toggleFavorite}
                    onSelect={setSelectedItem}
                  />
                ))}
              </div>
            )}

            {/* Live News Section for Movies, Nepali Cinema & Games */}
            <div ref={newsSectionRef} className="pt-2">
              <NewsFeedSection
                articles={newsArticles}
                loading={loadingNews}
                topic={newsTopic}
                updatedAt={newsUpdatedAt}
                onTopicChange={handleNewsTopicChange}
                onRefresh={() => fetchNews(newsTopic, true)}
                onFindRelease={handleFindReleaseFromNews}
              />
            </div>
          </>
        )}

        {/* Watchlist / Favorites / Profile View */}
        {(activeView === 'lists' || activeView === 'profile') && (
          <ProfileView
            initialListTab={activeView === 'lists' ? 'watchlist' : 'favorites'}
            onSelectRelease={setSelectedItem}
            onExploreClick={() => handleNavChange('discover')}
          />
        )}
      </main>

      {/* Desktop Footer */}
      <footer className="hidden md:block border-t border-white/[0.06] py-6 px-6 text-xs text-[#707584]">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <span>Movies and Games · Global &amp; Nepali Release Dates &amp; News</span>
          <span>Installable on Android &amp; iPhone</span>
        </div>
      </footer>

      {/* Mobile Bottom Thumb-Zone Navigation Bar (h-14 + safe area) */}
      <nav
        aria-label="Mobile bottom navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0B0C0F]/95 backdrop-blur-md border-t border-white/[0.08] pb-safe"
      >
        <div className="grid grid-cols-5 h-14 items-center">
          {(
            [
              { id: 'discover', label: 'Discover', icon: Compass },
              { id: 'movies', label: 'Movies', icon: Film },
              { id: 'games', label: 'Games', icon: Gamepad2 },
              { id: 'lists', label: 'Lists', icon: Bookmark },
              { id: 'profile', label: 'Profile', icon: UserIcon },
            ] as Array<{ id: ActiveView; label: string; icon: React.ComponentType<{ className?: string }> }>
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeView === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleNavChange(tab.id)}
                className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer ${
                  active ? 'text-[#E5484D]' : 'text-[#9499A6]'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium tracking-tight">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Offline Connectivity Banner */}
      {!isOnline && (
        <div
          role="status"
          className="fixed bottom-16 md:bottom-4 left-4 right-4 md:right-auto z-40 inline-flex items-center gap-2 rounded-xl bg-[#1D2029] border border-white/15 px-3.5 py-2 text-xs font-medium text-[#F4F5F7] shadow-lg"
        >
          <WifiOff className="w-3.5 h-3.5 text-[#E5484D] shrink-0" />
          <span>Offline Mode — Showing cached releases &amp; saved lists</span>
        </div>
      )}

      {/* Release Detail Sheet / Modal */}
      <ReleaseDetailSheet
        item={selectedItem}
        assignedArtwork={selectedItem ? artworkMap[selectedItem.id] : undefined}
        inWatchlist={selectedItem ? isInWatchlist(selectedItem.id) : false}
        isFavorite={selectedItem ? isFavorite(selectedItem.id) : false}
        userNotes={selectedSavedRecord?.userNotes || ''}
        onClose={() => setSelectedItem(null)}
        onToggleWatchlist={toggleWatchlist}
        onToggleFavorite={toggleFavorite}
        onSaveNotes={updateItemNotes}
      />
    </div>
  );
}
