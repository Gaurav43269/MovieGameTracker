import React, { useEffect, useMemo, useState } from 'react';
import {
  Bookmark,
  Check,
  Edit3,
  Heart,
  LogIn,
  LogOut,
  User as UserIcon,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { RegionOrigin, ReleaseItem, SortOption } from '../types/release';
import { assignUniqueArtworks, sortReleases } from '../utils/releaseHelpers';
import { ReleaseCard } from './ReleaseCard';

interface ProfileViewProps {
  initialListTab?: 'watchlist' | 'favorites' | 'all';
  onSelectRelease: (item: ReleaseItem) => void;
  onExploreClick: () => void;
}

const REGION_OPTIONS: Array<'All' | RegionOrigin> = [
  'All',
  'Nepali',
  'Hollywood',
  'Bollywood',
  'Asian',
  'European',
  'Global',
];

const GENRE_CHOICES = [
  'Action',
  'Drama',
  'Sci-Fi',
  'Thriller',
  'Comedy',
  'Horror',
  'Romance',
  'RPG',
  'Adventure',
  'Animation',
];

const PLATFORM_CHOICES = [
  'PS5',
  'PC',
  'Xbox Series X|S',
  'Switch 2',
  'iOS',
  'Android',
  'Theaters',
  'Netflix',
];

export const ProfileView: React.FC<ProfileViewProps> = ({
  initialListTab = 'watchlist',
  onSelectRelease,
  onExploreClick,
}) => {
  const {
    user,
    profile,
    savedItems,
    authLoading,
    authError,
    signInWithGoogle,
    signOutUser,
    updateProfilePreferences,
    toggleWatchlist,
    toggleFavorite,
    isInWatchlist,
    isFavorite,
  } = useAuth();

  const [listTab, setListTab] = useState<'watchlist' | 'favorites' | 'all'>(initialListTab);
  const [mediaFilter, setMediaFilter] = useState<'all' | 'movie' | 'game'>('all');
  const [sortBy, setSortBy] = useState<SortOption>('release_asc');
  const [editingProfile, setEditingProfile] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [preferredRegion, setPreferredRegion] = useState<'All' | RegionOrigin>('All');
  const [favoriteGenres, setFavoriteGenres] = useState<string[]>([]);
  const [favoritePlatforms, setFavoritePlatforms] = useState<string[]>([]);
  const [bio, setBio] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    setListTab(initialListTab);
  }, [initialListTab]);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName);
      setPreferredRegion(profile.preferredRegion);
      setFavoriteGenres(profile.favoriteGenres);
      setFavoritePlatforms(profile.favoritePlatforms);
      setBio(profile.bio);
    }
  }, [profile]);

  const watchlistItems = useMemo(
    () => savedItems.filter((item) => item.inWatchlist),
    [savedItems]
  );
  const favoriteItems = useMemo(
    () => savedItems.filter((item) => item.isFavorite),
    [savedItems]
  );

  const visibleList = useMemo(() => {
    const base =
      listTab === 'watchlist'
        ? watchlistItems
        : listTab === 'favorites'
          ? favoriteItems
          : savedItems;
    const filtered =
      mediaFilter === 'all' ? base : base.filter((i) => i.mediaType === mediaFilter);
    return sortReleases(filtered, sortBy);
  }, [listTab, watchlistItems, favoriteItems, savedItems, mediaFilter, sortBy]);

  const listArtworkMap = useMemo(
    () => assignUniqueArtworks(visibleList),
    [visibleList]
  );

  const toggleSelection = (list: string[], value: string, max: number) => {
    if (list.includes(value)) {
      return list.filter((v) => v !== value);
    }
    if (list.length >= max) return list;
    return [...list, value];
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setSaveSuccess(false);
    try {
      await updateProfilePreferences({
        displayName,
        preferredRegion,
        favoriteGenres,
        favoritePlatforms,
        bio,
      });
      setSaveSuccess(true);
      setEditingProfile(false);
      setTimeout(() => setSaveSuccess(false), 2500);
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Account & Profile Header */}
      {!user ? (
        <section className="rounded-2xl bg-[#13151B] border border-white/[0.08] p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <p className="text-xs font-medium text-[#E5484D]">Movies and Games Profile</p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#F4F5F7] text-balance">
              Register or sign in to sync your Watchlist and Favorites
            </h2>
            <p className="text-sm text-[#9499A6] leading-relaxed">
              Keep your personalized Nepali cinema, world movie, and game lists synced across your iPhone, Android, and desktop browser.
            </p>
            {authError && (
              <p className="text-xs text-[#E5484D] pt-1">{authError}</p>
            )}
          </div>

          <button
            type="button"
            onClick={signInWithGoogle}
            disabled={authLoading}
            className="min-h-[48px] px-6 rounded-xl bg-[#E5484D] text-white text-sm font-medium inline-flex items-center justify-center gap-2.5 hover:bg-[#D13B40] disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <LogIn className="w-4 h-4" />
            <span>{authLoading ? 'Connecting...' : 'Sign In / Register with Google'}</span>
          </button>
        </section>
      ) : (
        <section className="rounded-2xl bg-[#13151B] border border-white/[0.08] p-5 sm:p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              {profile?.photoURL ? (
                <img
                  src={profile.photoURL}
                  alt={profile.displayName}
                  referrerPolicy="no-referrer"
                  className="w-14 h-14 rounded-2xl object-cover border border-white/10 shrink-0"
                />
              ) : (
                <div className="w-14 h-14 rounded-2xl bg-[#1D2029] border border-white/10 flex items-center justify-center shrink-0">
                  <UserIcon className="w-6 h-6 text-[#9499A6]" />
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-xl sm:text-2xl font-bold text-[#F4F5F7] truncate">
                    {profile?.displayName || user.displayName || 'Member'}
                  </h2>
                  {saveSuccess && (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-400 shrink-0">
                      <Check className="w-3.5 h-3.5" /> Saved
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#9499A6] truncate">{profile?.email || user.email}</p>
                <p className="mt-1 text-xs text-[#C9CDD6] tabular-nums">
                  {watchlistItems.length} in Watchlist · {favoriteItems.length} Favorites · Preferred: {profile?.preferredRegion || 'All'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setEditingProfile((v) => !v)}
                className="min-h-[44px] px-4 rounded-xl bg-white/[0.07] text-xs font-medium text-[#F4F5F7] hover:bg-white/15 inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Edit3 className="w-4 h-4" />
                <span>{editingProfile ? 'Cancel Edit' : 'Edit Profile'}</span>
              </button>
              <button
                type="button"
                onClick={signOutUser}
                className="min-h-[44px] px-4 rounded-xl bg-white/[0.05] text-xs font-medium text-[#9499A6] hover:text-white hover:bg-white/10 inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>

          {!editingProfile && (profile?.bio || (profile?.favoriteGenres?.length ?? 0) > 0 || (profile?.favoritePlatforms?.length ?? 0) > 0) && (
            <div className="pt-4 border-t border-white/[0.06] space-y-2 text-xs text-[#9499A6]">
              {profile?.bio && <p className="text-sm text-[#C9CDD6]">{profile.bio}</p>}
              {(profile?.favoriteGenres?.length ?? 0) > 0 && (
                <p>
                  <span className="text-[#F4F5F7] font-medium">Genres:</span>{' '}
                  {profile?.favoriteGenres.join(' · ')}
                </p>
              )}
              {(profile?.favoritePlatforms?.length ?? 0) > 0 && (
                <p>
                  <span className="text-[#F4F5F7] font-medium">Platforms:</span>{' '}
                  {profile?.favoritePlatforms.join(' · ')}
                </p>
              )}
            </div>
          )}

          {/* Profile Preferences Editor */}
          {editingProfile && (
            <form onSubmit={handleSaveProfile} className="pt-5 border-t border-white/[0.08] space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="profile-name" className="text-xs font-medium text-[#9499A6]">
                    Display Name
                  </label>
                  <input
                    id="profile-name"
                    type="text"
                    required
                    maxLength={80}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl bg-[#0B0C0F] border border-white/10 px-3.5 text-sm text-[#F4F5F7] focus:outline-none focus:border-[#E5484D]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="profile-region" className="text-xs font-medium text-[#9499A6]">
                    Default Region Focus
                  </label>
                  <select
                    id="profile-region"
                    value={preferredRegion}
                    onChange={(e) => setPreferredRegion(e.target.value as 'All' | RegionOrigin)}
                    className="w-full min-h-[44px] rounded-xl bg-[#0B0C0F] border border-white/10 px-3.5 text-sm text-[#F4F5F7] focus:outline-none focus:border-[#E5484D]"
                  >
                    {REGION_OPTIONS.map((reg) => (
                      <option key={reg} value={reg}>
                        {reg === 'All' ? 'Worldwide (All)' : reg}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="profile-bio" className="text-xs font-medium text-[#9499A6]">
                  Bio (optional)
                </label>
                <input
                  id="profile-bio"
                  type="text"
                  maxLength={280}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="e.g., Nepali cinema fan & PS5 RPG player"
                  className="w-full min-h-[44px] rounded-xl bg-[#0B0C0F] border border-white/10 px-3.5 text-sm text-[#F4F5F7] placeholder:text-[#707584] focus:outline-none focus:border-[#E5484D]"
                />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-[#9499A6]">
                  Favorite Genres (select up to 8)
                </p>
                <div className="flex flex-wrap gap-2">
                  {GENRE_CHOICES.map((g) => {
                    const active = favoriteGenres.includes(g);
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setFavoriteGenres((prev) => toggleSelection(prev, g, 8))}
                        className={`min-h-[40px] px-3.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#E5484D]/20 border-[#E5484D] text-white'
                            : 'bg-[#0B0C0F] border-white/10 text-[#9499A6] hover:text-white'
                        }`}
                      >
                        {g}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-[#9499A6]">
                  Your Platforms (select up to 8)
                </p>
                <div className="flex flex-wrap gap-2">
                  {PLATFORM_CHOICES.map((p) => {
                    const active = favoritePlatforms.includes(p);
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setFavoritePlatforms((prev) => toggleSelection(prev, p, 8))}
                        className={`min-h-[40px] px-3.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#E5484D]/20 border-[#E5484D] text-white'
                            : 'bg-[#0B0C0F] border-white/10 text-[#9499A6] hover:text-white'
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="min-h-[44px] px-6 rounded-xl bg-[#E5484D] text-white text-sm font-medium hover:bg-[#D13B40] disabled:opacity-60 transition-colors cursor-pointer"
                >
                  {savingProfile ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {/* Personal Watchlist & Favorites Lists */}
      <section aria-label="Personal lists" className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Watchlist vs Favorites Segmented Tabs */}
          <div
            role="tablist"
            aria-label="Personal lists filter"
            className="inline-flex items-center p-1 rounded-xl bg-[#13151B] border border-white/[0.08] self-start"
          >
            <button
              type="button"
              role="tab"
              aria-selected={listTab === 'watchlist'}
              onClick={() => setListTab('watchlist')}
              className={`min-h-[40px] px-4 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                listTab === 'watchlist' ? 'bg-[#232733] text-white' : 'text-[#9499A6] hover:text-white'
              }`}
            >
              <Bookmark className="w-3.5 h-3.5" />
              <span className="tabular-nums">Watchlist ({watchlistItems.length})</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={listTab === 'favorites'}
              onClick={() => setListTab('favorites')}
              className={`min-h-[40px] px-4 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                listTab === 'favorites' ? 'bg-[#232733] text-white' : 'text-[#9499A6] hover:text-white'
              }`}
            >
              <Heart className="w-3.5 h-3.5" />
              <span className="tabular-nums">Favorites ({favoriteItems.length})</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={listTab === 'all'}
              onClick={() => setListTab('all')}
              className={`min-h-[40px] px-4 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
                listTab === 'all' ? 'bg-[#232733] text-white' : 'text-[#9499A6] hover:text-white'
              }`}
            >
              All ({savedItems.length})
            </button>
          </div>

          {/* Media Type + Sort inside Personal Lists */}
          <div className="flex items-center gap-2">
            <select
              aria-label="Filter saved items by type"
              value={mediaFilter}
              onChange={(e) => setMediaFilter(e.target.value as 'all' | 'movie' | 'game')}
              className="min-h-[40px] rounded-xl bg-[#13151B] border border-white/10 px-3 text-xs text-[#F4F5F7] focus:outline-none focus:border-[#E5484D]"
            >
              <option value="all">Movies &amp; Games</option>
              <option value="movie">Movies Only</option>
              <option value="game">Games Only</option>
            </select>

            <select
              aria-label="Sort saved items"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="min-h-[40px] rounded-xl bg-[#13151B] border border-white/10 px-3 text-xs text-[#F4F5F7] focus:outline-none focus:border-[#E5484D]"
            >
              <option value="release_asc">Soonest Release</option>
              <option value="release_desc">Newest Date</option>
              <option value="popularity">Popularity</option>
              <option value="rating">User Ratings</option>
            </select>
          </div>
        </div>

        {visibleList.length === 0 ? (
          <div className="rounded-2xl bg-[#13151B] border border-white/[0.08] p-10 text-center space-y-3">
            <p className="font-display text-lg font-semibold text-[#F4F5F7]">
              {listTab === 'favorites'
                ? 'No favorites marked yet'
                : 'Your watchlist is empty'}
            </p>
            <p className="text-sm text-[#9499A6] max-w-md mx-auto">
              Tap the bookmark or heart icon on any Nepali movie, world film, or upcoming video game to track release dates here.
            </p>
            <button
              type="button"
              onClick={onExploreClick}
              className="mt-2 min-h-[44px] px-5 rounded-xl bg-[#E5484D] text-white text-sm font-medium hover:bg-[#D13B40] transition-colors cursor-pointer"
            >
              Discover Releases
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {visibleList.map((item) => (
              <ReleaseCard
                key={item.id}
                item={item}
                assignedArtwork={listArtworkMap[item.id]}
                inWatchlist={isInWatchlist(item.id)}
                isFavorite={isFavorite(item.id)}
                onToggleWatchlist={toggleWatchlist}
                onToggleFavorite={toggleFavorite}
                onSelect={onSelectRelease}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
