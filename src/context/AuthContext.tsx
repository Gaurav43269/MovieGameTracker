import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  sanitizeDocId,
} from '../firebase';
import type { ReleaseItem, SavedMediaItem, UserProfile } from '../types/release';

const GUEST_STORAGE_KEY = 'cue_guest_saved_items_v1';

interface AuthContextValue {
  user: User | null;
  authReady: boolean;
  profile: UserProfile | null;
  savedItems: SavedMediaItem[];
  authLoading: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  updateProfilePreferences: (updates: {
    displayName: string;
    preferredRegion: UserProfile['preferredRegion'];
    favoriteGenres: string[];
    favoritePlatforms: string[];
    bio: string;
  }) => Promise<void>;
  toggleWatchlist: (item: ReleaseItem) => Promise<void>;
  toggleFavorite: (item: ReleaseItem) => Promise<void>;
  updateItemNotes: (itemId: string, notes: string) => Promise<void>;
  isInWatchlist: (id: string) => boolean;
  isFavorite: (id: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function loadGuestItems(): SavedMediaItem[] {
  try {
    const raw = localStorage.getItem(GUEST_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedMediaItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveGuestItems(items: SavedMediaItem[]) {
  try {
    localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Ignore storage quota errors
  }
}

function buildSavedPayload(
  item: ReleaseItem,
  uid: string,
  flags: { inWatchlist: boolean; isFavorite: boolean; userNotes?: string }
) {
  const safeId = sanitizeDocId(item.id);
  const payload: Record<string, unknown> = {
    id: safeId,
    uid,
    title: item.title.slice(0, 200) || 'Untitled',
    mediaType: item.mediaType === 'game' ? 'game' : 'movie',
    region: item.region,
    language: (item.language || 'English').slice(0, 60),
    releaseDate: (item.releaseDate || 'TBA').slice(0, 32),
    displayDate: (item.displayDate || 'TBA').slice(0, 80),
    status: item.status,
    genres: (item.genres || []).slice(0, 5).map((g) => g.slice(0, 60)),
    platforms: (item.platforms || []).slice(0, 6).map((p) => p.slice(0, 60)),
    popularityScore: Math.max(1, Math.min(100, Math.round(item.popularityScore || 75))),
    creator: (item.creator || 'TBA').slice(0, 140),
    castOrStudio: (item.castOrStudio || []).slice(0, 5).map((c) => c.slice(0, 60)),
    runtimeOrPlaytime: (item.runtimeOrPlaytime || 'TBD').slice(0, 60),
    synopsis: (item.synopsis || 'Verified release entry.').slice(0, 800),
    releaseNotes: (item.releaseNotes || '').slice(0, 400),
    inWatchlist: flags.inWatchlist,
    isFavorite: flags.isFavorite,
    userNotes: (flags.userNotes || '').slice(0, 300),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (item.originalTitle) {
    payload.originalTitle = item.originalTitle.slice(0, 200);
  }
  if (typeof item.releaseYear === 'number' && item.releaseYear >= 1900 && item.releaseYear <= 2100) {
    payload.releaseYear = Math.round(item.releaseYear);
  }
  if (typeof item.rating === 'number' && item.rating >= 0 && item.rating <= 10) {
    payload.rating = Math.round(item.rating * 10) / 10;
  }

  return { safeId, payload };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [savedItems, setSavedItems] = useState<SavedMediaItem[]>(() => loadGuestItems());
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (!nextUser) {
        setProfile(null);
        setSavedItems(loadGuestItems());
      }
    });
    return () => unsub();
  }, []);

  // Ensure profile exists & subscribe to profile + savedItems when signed in
  useEffect(() => {
    if (!authReady || !user) return;

    const uid = user.uid;
    const profilePath = `users/${uid}`;
    const profileRef = doc(db, 'users', uid);

    let unsubProfile: (() => void) | undefined;
    let unsubItems: (() => void) | undefined;

    (async () => {
      try {
        const snap = await getDoc(profileRef);
        if (!snap.exists()) {
          const newProfileData: Record<string, unknown> = {
            uid,
            email: (user.email || 'user@cue.app').slice(0, 200),
            displayName: (user.displayName || user.email?.split('@')[0] || 'Member').slice(0, 80),
            preferredRegion: 'All',
            favoriteGenres: [],
            favoritePlatforms: [],
            bio: '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          if (user.photoURL) {
            newProfileData.photoURL = user.photoURL.slice(0, 500);
          }
          await setDoc(profileRef, newProfileData);
        }

        // Sync any guest items saved before sign-in
        const guestItems = loadGuestItems();
        if (guestItems.length > 0) {
          for (const gItem of guestItems) {
            const { safeId, payload } = buildSavedPayload(gItem, uid, {
              inWatchlist: gItem.inWatchlist,
              isFavorite: gItem.isFavorite,
              userNotes: gItem.userNotes,
            });
            const itemRef = doc(db, 'users', uid, 'savedItems', safeId);
            const existingSnap = await getDoc(itemRef);
            if (!existingSnap.exists()) {
              await setDoc(itemRef, payload);
            }
          }
          saveGuestItems([]);
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, profilePath);
      }
    })();

    unsubProfile = onSnapshot(
      profileRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as Partial<UserProfile>;
          setProfile({
            uid: data.uid || uid,
            email: data.email || user.email || '',
            displayName: data.displayName || user.displayName || 'Member',
            photoURL: data.photoURL || user.photoURL || undefined,
            preferredRegion: data.preferredRegion || 'All',
            favoriteGenres: Array.isArray(data.favoriteGenres) ? data.favoriteGenres : [],
            favoritePlatforms: Array.isArray(data.favoritePlatforms) ? data.favoritePlatforms : [],
            bio: data.bio || '',
          });
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, profilePath);
      }
    );

    const itemsPath = `users/${uid}/savedItems`;
    const itemsQuery = query(collection(db, 'users', uid, 'savedItems'), where('uid', '==', uid));

    unsubItems = onSnapshot(
      itemsQuery,
      (snapshot) => {
        const list: SavedMediaItem[] = snapshot.docs.map((d) => {
          const data = d.data() as Partial<SavedMediaItem>;
          return {
            id: d.id,
            uid: data.uid || uid,
            title: data.title || 'Untitled',
            originalTitle: data.originalTitle,
            mediaType: data.mediaType === 'game' ? 'game' : 'movie',
            region: data.region || 'Global',
            language: data.language || 'English',
            releaseDate: data.releaseDate || 'TBA',
            displayDate: data.displayDate || 'TBA',
            releaseYear: typeof data.releaseYear === 'number' ? data.releaseYear : null,
            status: data.status || 'Upcoming',
            genres: Array.isArray(data.genres) ? data.genres : [],
            platforms: Array.isArray(data.platforms) ? data.platforms : [],
            rating: typeof data.rating === 'number' ? data.rating : null,
            popularityScore: typeof data.popularityScore === 'number' ? data.popularityScore : 75,
            creator: data.creator || 'TBA',
            castOrStudio: Array.isArray(data.castOrStudio) ? data.castOrStudio : [],
            runtimeOrPlaytime: data.runtimeOrPlaytime || 'TBD',
            synopsis: data.synopsis || '',
            releaseNotes: data.releaseNotes || '',
            sources: [],
            inWatchlist: Boolean(data.inWatchlist),
            isFavorite: Boolean(data.isFavorite),
            userNotes: data.userNotes || '',
          };
        });
        setSavedItems(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, itemsPath);
      }
    );

    return () => {
      if (unsubProfile) unsubProfile();
      if (unsubItems) unsubItems();
    };
  }, [authReady, user]);

  const signInWithGoogle = useCallback(async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to sign in';
      setAuthError(msg);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const signOutUser = useCallback(async () => {
    await signOut(auth);
  }, []);

  const updateProfilePreferences = useCallback(
    async (updates: {
      displayName: string;
      preferredRegion: UserProfile['preferredRegion'];
      favoriteGenres: string[];
      favoritePlatforms: string[];
      bio: string;
    }) => {
      if (!user) return;
      const path = `users/${user.uid}`;
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          displayName: updates.displayName.trim().slice(0, 80) || 'Member',
          preferredRegion: updates.preferredRegion,
          favoriteGenres: updates.favoriteGenres.slice(0, 8).map((g) => g.slice(0, 60)),
          favoritePlatforms: updates.favoritePlatforms.slice(0, 8).map((p) => p.slice(0, 60)),
          bio: updates.bio.trim().slice(0, 280),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    },
    [user]
  );

  const toggleFlag = useCallback(
    async (item: ReleaseItem, flag: 'inWatchlist' | 'isFavorite') => {
      const safeId = sanitizeDocId(item.id);
      const existing = savedItems.find((s) => s.id === safeId || s.id === item.id);

      const nextFlags = {
        inWatchlist: existing ? existing.inWatchlist : false,
        isFavorite: existing ? existing.isFavorite : false,
      };
      nextFlags[flag] = !nextFlags[flag];

      // Guest local mode when signed out
      if (!user) {
        setSavedItems((prev) => {
          let next: SavedMediaItem[];
          if (!nextFlags.inWatchlist && !nextFlags.isFavorite) {
            next = prev.filter((p) => p.id !== safeId && p.id !== item.id);
          } else if (existing) {
            next = prev.map((p) =>
              p.id === safeId || p.id === item.id ? { ...p, ...nextFlags } : p
            );
          } else {
            next = [
              {
                ...item,
                id: safeId,
                uid: 'guest',
                inWatchlist: nextFlags.inWatchlist,
                isFavorite: nextFlags.isFavorite,
                userNotes: '',
              },
              ...prev,
            ];
          }
          saveGuestItems(next);
          return next;
        });
        return;
      }

      const path = `users/${user.uid}/savedItems/${safeId}`;
      const ref = doc(db, 'users', user.uid, 'savedItems', safeId);

      try {
        if (!nextFlags.inWatchlist && !nextFlags.isFavorite) {
          await deleteDoc(ref);
        } else if (existing) {
          await updateDoc(ref, {
            inWatchlist: nextFlags.inWatchlist,
            isFavorite: nextFlags.isFavorite,
            updatedAt: serverTimestamp(),
          });
        } else {
          const { payload } = buildSavedPayload(item, user.uid, nextFlags);
          await setDoc(ref, payload);
        }
      } catch (err) {
        handleFirestoreError(err, existing ? OperationType.UPDATE : OperationType.CREATE, path);
      }
    },
    [savedItems, user]
  );

  const toggleWatchlist = useCallback(
    (item: ReleaseItem) => toggleFlag(item, 'inWatchlist'),
    [toggleFlag]
  );

  const toggleFavorite = useCallback(
    (item: ReleaseItem) => toggleFlag(item, 'isFavorite'),
    [toggleFlag]
  );

  const updateItemNotes = useCallback(
    async (itemId: string, notes: string) => {
      const safeId = sanitizeDocId(itemId);
      const trimmed = notes.slice(0, 300);

      if (!user) {
        setSavedItems((prev) => {
          const next = prev.map((p) =>
            p.id === safeId || p.id === itemId ? { ...p, userNotes: trimmed } : p
          );
          saveGuestItems(next);
          return next;
        });
        return;
      }

      const path = `users/${user.uid}/savedItems/${safeId}`;
      try {
        await updateDoc(doc(db, 'users', user.uid, 'savedItems', safeId), {
          userNotes: trimmed,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    },
    [user]
  );

  const isInWatchlist = useCallback(
    (id: string) => {
      const safeId = sanitizeDocId(id);
      return savedItems.some((s) => (s.id === safeId || s.id === id) && s.inWatchlist);
    },
    [savedItems]
  );

  const isFavorite = useCallback(
    (id: string) => {
      const safeId = sanitizeDocId(id);
      return savedItems.some((s) => (s.id === safeId || s.id === id) && s.isFavorite);
    },
    [savedItems]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        authReady,
        profile,
        savedItems,
        authLoading,
        authError,
        signInWithGoogle,
        signOutUser,
        updateProfilePreferences,
        toggleWatchlist,
        toggleFavorite,
        updateItemNotes,
        isInWatchlist,
        isFavorite,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
