import React, { useState } from 'react';
import { Bookmark, Film, Gamepad2, Heart, Star } from 'lucide-react';
import type { ReleaseItem } from '../types/release';
import { type ArtworkResult, getArtworkForItem, getCountdownLabel } from '../utils/releaseHelpers';

interface ReleaseCardProps {
  item: ReleaseItem;
  assignedArtwork?: ArtworkResult;
  inWatchlist: boolean;
  isFavorite: boolean;
  onToggleWatchlist: (item: ReleaseItem) => void;
  onToggleFavorite: (item: ReleaseItem) => void;
  onSelect: (item: ReleaseItem) => void;
}

export const ReleaseCard: React.FC<ReleaseCardProps> = ({
  item,
  assignedArtwork,
  inWatchlist,
  isFavorite,
  onToggleWatchlist,
  onToggleFavorite,
  onSelect,
}) => {
  const [imgError, setImgError] = useState(false);
  const artwork = assignedArtwork || getArtworkForItem(item);
  const countdown = getCountdownLabel(item);
  const genresText = item.genres.slice(0, 2).join(' / ');
  const platformsText = item.platforms.slice(0, 3).join(' · ');

  return (
    <article className="group relative flex flex-col rounded-2xl bg-[#13151B] border border-white/[0.08] overflow-hidden transition-colors duration-150 hover:border-white/20">
      {/* Visual Frame */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#0F1116]">
        {!imgError ? (
          <img
            src={artwork.src}
            alt={`${item.title} ${item.mediaType === 'game' ? 'key art' : 'cinema still'}`}
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="h-full w-full object-cover object-center transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className={`h-full w-full bg-gradient-to-br ${artwork.tint} flex items-center justify-center`}>
            {item.mediaType === 'game' ? (
              <Gamepad2 className="w-10 h-10 text-white/25" />
            ) : (
              <Film className="w-10 h-10 text-white/25" />
            )}
          </div>
        )}

        {/* Measured contrast scrim */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-[#13151B] via-[#13151B]/35 to-black/25"
        />

        {/* Quick List Actions (top-right, 44x44px hitboxes) */}
        <div className="absolute top-2 right-2 flex items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(item);
            }}
            aria-label={isFavorite ? `Remove ${item.title} from favorites` : `Add ${item.title} to favorites`}
            aria-pressed={isFavorite}
            className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5484D] ${
              isFavorite
                ? 'bg-[#E5484D] text-white'
                : 'bg-[#0B0C0F]/75 text-[#F4F5F7] hover:bg-[#0B0C0F]'
            }`}
          >
            <Heart className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`} />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleWatchlist(item);
            }}
            aria-label={inWatchlist ? `Remove ${item.title} from watchlist` : `Add ${item.title} to watchlist`}
            aria-pressed={inWatchlist}
            className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5484D] ${
              inWatchlist
                ? 'bg-[#F4F5F7] text-[#0B0C0F]'
                : 'bg-[#0B0C0F]/75 text-[#F4F5F7] hover:bg-[#0B0C0F]'
            }`}
          >
            <Bookmark className={`w-4 h-4 ${inWatchlist ? 'fill-current' : ''}`} />
          </button>
        </div>

        {/* Bottom scrim countdown / rating text (unboxed typography) */}
        <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between gap-3">
          <span className="font-mono text-xs font-medium tracking-tight text-[#F4F5F7] tabular-nums">
            {countdown}
          </span>
          {item.rating !== null && (
            <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-[#F4F5F7] tabular-nums">
              <Star className="w-3.5 h-3.5 text-[#F5A623] fill-[#F5A623]" />
              {item.rating.toFixed(1)}
            </span>
          )}
        </div>
      </div>

      {/* Card Body */}
      <button
        type="button"
        onClick={() => onSelect(item)}
        className="flex flex-1 flex-col justify-between p-4 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#E5484D]"
      >
        <div>
          <div className="flex items-center gap-1.5 text-xs text-[#9499A6] truncate">
            <span className="text-[#E5484D] font-medium shrink-0">{item.region}</span>
            <span aria-hidden="true">·</span>
            <span className="shrink-0">{item.mediaType === 'game' ? 'Game' : 'Movie'}</span>
            {genresText && (
              <>
                <span aria-hidden="true">·</span>
                <span className="truncate">{genresText}</span>
              </>
            )}
          </div>

          <h3 className="mt-1.5 font-display text-lg font-semibold leading-snug text-[#F4F5F7] line-clamp-1 group-hover:text-white">
            {item.title}
          </h3>
          {item.originalTitle && item.originalTitle !== item.title && (
            <p className="text-xs text-[#9499A6] truncate">{item.originalTitle}</p>
          )}

          <p className="mt-2 text-sm leading-relaxed text-[#9499A6] line-clamp-2">
            {item.synopsis}
          </p>
        </div>

        <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-xs font-medium text-[#F4F5F7] tabular-nums truncate">
              {item.displayDate}
            </p>
            <p className="text-xs text-[#9499A6] truncate mt-0.5">{item.creator}</p>
          </div>
          <div className="text-right shrink-0 max-w-[46%]">
            <p className="text-xs text-[#C9CDD6] truncate">{platformsText}</p>
            <p className="text-[11px] text-[#9499A6] tabular-nums mt-0.5">{item.status}</p>
          </div>
        </div>
      </button>
    </article>
  );
};
