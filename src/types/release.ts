export type MediaType = 'movie' | 'game';

export type RegionOrigin =
  | 'Nepali'
  | 'Hollywood'
  | 'Bollywood'
  | 'Asian'
  | 'European'
  | 'Global';

export type ReleaseStatus = 'Upcoming' | 'Released' | 'TBA';

export type SortOption = 'release_asc' | 'release_desc' | 'popularity' | 'rating';

export interface GroundSource {
  title: string;
  uri: string;
}

export interface ReleaseItem {
  id: string;
  title: string;
  originalTitle?: string;
  mediaType: MediaType;
  region: RegionOrigin;
  language: string;
  releaseDate: string; // ISO YYYY-MM-DD, YYYY-MM, YYYY, or TBA
  displayDate: string; // Human-readable e.g. "Nov 20, 2026" or "Kartik 2083 · Nov 2026"
  releaseYear: number | null;
  status: ReleaseStatus;
  genres: string[];
  platforms: string[]; // Games: PS5, PC, Xbox Series X|S, Switch 2, iOS, Android. Movies: Theaters, QFX, Netflix, Prime Video, etc.
  rating: number | null; // Out of 10 (IMDb / Metacritic / OpenCritic normalized)
  popularityScore: number; // 1-100 for popularity sorting
  creator: string; // Director or Developer Studio
  castOrStudio: string[]; // Lead cast or Publisher/Engine
  runtimeOrPlaytime: string;
  synopsis: string;
  releaseNotes: string;
  sources: GroundSource[];
}

export interface ReleaseDetails extends ReleaseItem {
  extendedOverview: string;
  regionalDates: Array<{
    territory: string;
    date: string;
    format: string;
  }>;
  whereToAccess: string[];
  ageRating: string;
  receptionSummary: string;
  trailerQuery: string;
}

export interface SearchFilterState {
  query: string;
  mediaType: 'all' | MediaType;
  region: 'All' | RegionOrigin;
  genre: string;
  releaseYear: string;
  platform: string;
  status: 'all' | ReleaseStatus;
  sortBy: SortOption;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  preferredRegion: 'All' | RegionOrigin;
  favoriteGenres: string[];
  favoritePlatforms: string[];
  bio: string;
}

export interface SavedMediaItem extends ReleaseItem {
  uid: string;
  inWatchlist: boolean;
  isFavorite: boolean;
  userNotes: string;
}

export interface NewsArticle {
  id: string;
  title: string;
  link: string;
  source: string;
  publishedAt: string;
  category: 'Nepali' | 'Movies' | 'Games';
}
