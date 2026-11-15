import React, { useState } from 'react';
import { ArrowUpDown, Globe, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';
import type { MediaType, RegionOrigin, SearchFilterState, SortOption } from '../types/release';

interface SearchFilterBarProps {
  filters: SearchFilterState;
  onChange: (next: SearchFilterState) => void;
  onLiveSearch: (overrideFilters?: SearchFilterState) => void;
  onReset: () => void;
  isSearching: boolean;
  totalMatching: number;
}

const REGIONS: Array<'All' | RegionOrigin> = [
  'All',
  'Nepali',
  'Hollywood',
  'Bollywood',
  'Asian',
  'European',
  'Global',
];

const GENRES = [
  'All',
  'Action',
  'Drama',
  'Sci-Fi',
  'Thriller',
  'Comedy',
  'Horror',
  'Romance',
  'Adventure',
  'RPG',
  'Animation',
  'Crime',
  'Fantasy',
];

const YEARS = ['All', '2027+', '2027', '2026', '2025', '2024'];

const PLATFORMS = [
  'All',
  'PS5',
  'PC',
  'Xbox Series X|S',
  'Switch 2',
  'iOS',
  'Android',
  'Theaters',
  'Netflix',
  'Prime Video',
];

const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: 'release_asc', label: 'Release Date (Soonest)' },
  { value: 'release_desc', label: 'Release Date (Newest)' },
  { value: 'popularity', label: 'Popularity' },
  { value: 'rating', label: 'User Ratings' },
];

export const SearchFilterBar: React.FC<SearchFilterBarProps> = ({
  filters,
  onChange,
  onLiveSearch,
  onReset,
  isSearching,
  totalMatching,
}) => {
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const activeFilterCount = [
    filters.region !== 'All',
    filters.genre !== 'All',
    filters.releaseYear !== 'All',
    filters.platform !== 'All',
    filters.status !== 'all',
  ].filter(Boolean).length;

  const hasAnyCriteria =
    filters.query.trim().length > 0 ||
    activeFilterCount > 0 ||
    filters.mediaType !== 'all';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLiveSearch();
  };

  const updateField = <K extends keyof SearchFilterState>(
    key: K,
    value: SearchFilterState[K]
  ) => {
    const next = { ...filters, [key]: value };
    onChange(next);
  };

  return (
    <section aria-label="Search and filters" className="space-y-4">
      {/* Search Input Bar */}
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9499A6]"
          />
          <input
            type="search"
            value={filters.query}
            onChange={(e) => updateField('query', e.target.value)}
            placeholder="Search Nepali or world movies, games, genres, studios..."
            aria-label="Search movies and games by title, genre, year, or platform"
            className="w-full min-h-[48px] rounded-xl bg-[#13151B] border border-white/10 pl-10 pr-10 text-sm text-[#F4F5F7] placeholder:text-[#707584] focus:outline-none focus:border-[#E5484D] focus:ring-1 focus:ring-[#E5484D] transition-colors"
          />
          {filters.query && (
            <button
              type="button"
              onClick={() => updateField('query', '')}
              aria-label="Clear search query"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[#9499A6] hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="submit"
            disabled={isSearching}
            className="flex-1 sm:flex-initial min-h-[48px] px-5 rounded-xl bg-[#E5484D] text-white text-sm font-medium inline-flex items-center justify-center gap-2 hover:bg-[#D13B40] disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Globe className="w-4 h-4 shrink-0" />
            <span>{isSearching ? 'Searching...' : 'Search Worldwide'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowMobileFilters((v) => !v)}
            aria-expanded={showMobileFilters}
            className="lg:hidden min-h-[48px] px-4 rounded-xl bg-[#13151B] border border-white/10 text-sm font-medium text-[#F4F5F7] inline-flex items-center justify-center gap-2 hover:bg-[#1B1E26] transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</span>
          </button>
        </div>
      </form>

      {/* Primary Segmented Row: Media Type + Quick Region + Sort */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Media Type Segmented Control */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 md:pb-0">
          <div
            role="group"
            aria-label="Media category"
            className="inline-flex items-center p-1 rounded-xl bg-[#13151B] border border-white/[0.08] shrink-0"
          >
            {(['all', 'movie', 'game'] as Array<'all' | MediaType>).map((type) => {
              const active = filters.mediaType === type;
              const label = type === 'all' ? 'All' : type === 'movie' ? 'Movies' : 'Games';
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => updateField('mediaType', type)}
                  className={`min-h-[38px] px-3.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-[#232733] text-white'
                      : 'text-[#9499A6] hover:text-white'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Quick Region Buttons */}
          <div className="inline-flex items-center gap-1.5 shrink-0">
            {(['All', 'Nepali', 'Hollywood', 'Bollywood', 'Asian'] as const).map((reg) => {
              const active = filters.region === reg;
              return (
                <button
                  key={reg}
                  type="button"
                  onClick={() => updateField('region', reg)}
                  className={`min-h-[40px] px-3.5 rounded-xl text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-[#E5484D]/15 border-[#E5484D] text-[#F4F5F7]'
                      : 'bg-[#13151B] border-white/[0.08] text-[#9499A6] hover:text-white hover:border-white/20'
                  }`}
                >
                  {reg === 'All' ? 'All Regions' : reg}
                </button>
              );
            })}
          </div>
        </div>

        {/* Sort Control */}
        <div className="flex items-center gap-2 shrink-0">
          <label htmlFor="sort-select" className="inline-flex items-center gap-1.5 text-xs text-[#9499A6] whitespace-nowrap">
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span>Sort</span>
          </label>
          <select
            id="sort-select"
            value={filters.sortBy}
            onChange={(e) => updateField('sortBy', e.target.value as SortOption)}
            className="min-h-[42px] rounded-xl bg-[#13151B] border border-white/10 px-3 text-xs font-medium text-[#F4F5F7] focus:outline-none focus:border-[#E5484D] cursor-pointer"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-[#13151B] text-[#F4F5F7]">
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Detailed Filter Grid (always visible on lg+, toggleable on mobile) */}
      <div
        className={`${
          showMobileFilters ? 'grid' : 'hidden lg:grid'
        } grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 p-4 rounded-2xl bg-[#13151B] border border-white/[0.08]`}
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="filter-region" className="text-xs font-medium text-[#9499A6]">
            Region / Industry
          </label>
          <select
            id="filter-region"
            value={filters.region}
            onChange={(e) => updateField('region', e.target.value as 'All' | RegionOrigin)}
            className="min-h-[44px] rounded-xl bg-[#0B0C0F] border border-white/10 px-3 text-xs text-[#F4F5F7] focus:outline-none focus:border-[#E5484D]"
          >
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {r === 'All' ? 'Worldwide (All)' : r}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="filter-genre" className="text-xs font-medium text-[#9499A6]">
            Genre
          </label>
          <select
            id="filter-genre"
            value={filters.genre}
            onChange={(e) => updateField('genre', e.target.value)}
            className="min-h-[44px] rounded-xl bg-[#0B0C0F] border border-white/10 px-3 text-xs text-[#F4F5F7] focus:outline-none focus:border-[#E5484D]"
          >
            {GENRES.map((g) => (
              <option key={g} value={g}>
                {g === 'All' ? 'All Genres' : g}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="filter-year" className="text-xs font-medium text-[#9499A6]">
            Release Year
          </label>
          <select
            id="filter-year"
            value={filters.releaseYear}
            onChange={(e) => updateField('releaseYear', e.target.value)}
            className="min-h-[44px] rounded-xl bg-[#0B0C0F] border border-white/10 px-3 text-xs text-[#F4F5F7] tabular-nums focus:outline-none focus:border-[#E5484D]"
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y === 'All' ? 'Any Year' : y}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="filter-platform" className="text-xs font-medium text-[#9499A6]">
            Platform / Format
          </label>
          <select
            id="filter-platform"
            value={filters.platform}
            onChange={(e) => updateField('platform', e.target.value)}
            className="min-h-[44px] rounded-xl bg-[#0B0C0F] border border-white/10 px-3 text-xs text-[#F4F5F7] focus:outline-none focus:border-[#E5484D]"
          >
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p === 'All' ? 'All Platforms' : p}
              </option>
            ))}
          </select>
        </div>

        <div className="col-span-2 sm:col-span-4 lg:col-span-1 flex items-end gap-2">
          <div className="flex-1 flex flex-col gap-1.5">
            <label htmlFor="filter-status" className="text-xs font-medium text-[#9499A6]">
              Release Status
            </label>
            <select
              id="filter-status"
              value={filters.status}
              onChange={(e) =>
                updateField('status', e.target.value as SearchFilterState['status'])
              }
              className="min-h-[44px] rounded-xl bg-[#0B0C0F] border border-white/10 px-3 text-xs text-[#F4F5F7] focus:outline-none focus:border-[#E5484D]"
            >
              <option value="all">All Statuses</option>
              <option value="Upcoming">Upcoming</option>
              <option value="Released">Released</option>
              <option value="TBA">TBA</option>
            </select>
          </div>

          {hasAnyCriteria && (
            <button
              type="button"
              onClick={onReset}
              aria-label="Reset all filters"
              className="min-h-[44px] min-w-[44px] px-3 rounded-xl bg-white/[0.06] text-xs font-medium text-[#C9CDD6] hover:bg-white/10 hover:text-white inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Active Result Summary Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#9499A6]">
        <p className="tabular-nums">
          Showing <span className="text-[#F4F5F7] font-medium">{totalMatching}</span>{' '}
          {totalMatching === 1 ? 'release' : 'releases'}
          {filters.region !== 'All' ? ` in ${filters.region}` : ''}
          {filters.genre !== 'All' ? ` · ${filters.genre}` : ''}
          {filters.releaseYear !== 'All' ? ` · ${filters.releaseYear}` : ''}
          {filters.platform !== 'All' ? ` · ${filters.platform}` : ''}
        </p>

        {hasAnyCriteria && (
          <button
            type="button"
            onClick={() => onLiveSearch()}
            disabled={isSearching}
            className="text-xs font-medium text-[#E5484D] hover:underline cursor-pointer whitespace-nowrap"
          >
            Fetch fresh results for these filters
          </button>
        )}
      </div>
    </section>
  );
};
