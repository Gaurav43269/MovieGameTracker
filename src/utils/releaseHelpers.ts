import type { ReleaseItem, SearchFilterState, SortOption } from '../types/release';
import nepaliCinemaImg from '../assets/images/nepali_cinema_still_1794763052438.jpg';
import nepaliFestiveImg from '../assets/images/poster_nepali_festive_1794764838930.jpg';
import nepaliMountainDramaImg from '../assets/images/poster_nepali_mountain_drama_1794764839811.jpg';
import globalCinemaImg from '../assets/images/global_cinema_still_1794763052473.jpg';
import nextgenGameImg from '../assets/images/nextgen_game_cover_1794763052798.jpg';
import actionThrillerImg from '../assets/images/poster_action_thriller_1794764180743.jpg';
import southAsianEpicImg from '../assets/images/poster_south_asian_epic_1794764181451.jpg';
import horrorMysteryImg from '../assets/images/poster_horror_mystery_1794764182726.jpg';
import openWorldGameImg from '../assets/images/cover_openworld_game_1794764182749.jpg';
import scifiSpaceImg from '../assets/images/poster_scifi_space_1794764375181.jpg';
import superheroCosmicImg from '../assets/images/poster_superhero_cosmic_1794764375525.jpg';
import animatedFamilyImg from '../assets/images/poster_animated_family_1794764376921.jpg';
import fantasyRpgGameImg from '../assets/images/cover_fantasy_rpg_1794764376832.jpg';
import espionageGameImg from '../assets/images/cover_stealth_espionage_1794764377158.jpg';
import sportsStadiumImg from '../assets/images/cover_sports_stadium_1794764378444.jpg';
import mythicOdysseyImg from '../assets/images/poster_mythic_odyssey_1794764419389.jpg';
import scifiHorrorImg from '../assets/images/cover_scifi_horror_1794764419966.jpg';
import darkVigilanteImg from '../assets/images/poster_dark_vigilante_1794764839998.jpg';
import spiderMetropolisImg from '../assets/images/poster_spider_metropolis_1794764840051.jpg';
import toyWorkshopImg from '../assets/images/poster_toy_workshop_1794764841113.jpg';
import emeraldFairyImg from '../assets/images/poster_emerald_fairy_1794764841516.jpg';
import tokyoNeonImg from '../assets/images/poster_tokyo_neon_cinema_1794764843597.jpg';
import gothicCastleImg from '../assets/images/cover_gothic_castle_1794764841863.jpg';
import miamiViceSunsetImg from '../assets/images/cover_miami_vice_sunset_1794765039316.jpg';
import supergirlSkyImg from '../assets/images/poster_supergirl_sky_1794765092870.jpg';
import polynesianVoyageImg from '../assets/images/poster_polynesian_voyage_1794765093993.jpg';
import survivalCityImg from '../assets/images/cover_survival_city_1794765094450.jpg';
import wartimeParisImg from '../assets/images/cover_wartime_paris_1794765094666.jpg';

export interface ArtworkResult {
  src: string;
  tint: string;
}

export function parseReleaseTimestamp(releaseDate: string): number | null {
  if (!releaseDate || releaseDate.toUpperCase() === 'TBA') return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) {
    const t = Date.parse(`${releaseDate}T00:00:00Z`);
    return Number.isNaN(t) ? null : t;
  }
  if (/^\d{4}-\d{2}$/.test(releaseDate)) {
    const t = Date.parse(`${releaseDate}-15T00:00:00Z`);
    return Number.isNaN(t) ? null : t;
  }
  if (/^\d{4}$/.test(releaseDate)) {
    const t = Date.parse(`${releaseDate}-07-01T00:00:00Z`);
    return Number.isNaN(t) ? null : t;
  }

  const parsed = Date.parse(releaseDate);
  return Number.isNaN(parsed) ? null : parsed;
}

export function getCountdownLabel(item: ReleaseItem): string {
  if (item.status === 'Released') {
    return item.rating ? `Rated ${item.rating.toFixed(1)}/10` : 'Out Now';
  }
  if (item.releaseDate === 'TBA' || item.status === 'TBA') {
    return item.releaseYear ? `Expected ${item.releaseYear}` : 'Date TBA';
  }

  const ts = parseReleaseTimestamp(item.releaseDate);
  if (ts === null) return item.displayDate;

  if (/^\d{4}-\d{2}-\d{2}$/.test(item.releaseDate)) {
    const now = new Date();
    const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const diffDays = Math.round((ts - todayUtc) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Releases Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays > 1 && diffDays <= 365) return `In ${diffDays} days`;
    if (diffDays > 365) return `In ${Math.round(diffDays / 30)} mos`;
    if (diffDays < 0) return 'Out Now';
  }

  return item.displayDate;
}

export function filterReleases(items: ReleaseItem[], filters: SearchFilterState): ReleaseItem[] {
  const q = filters.query.trim().toLowerCase();

  return items.filter((item) => {
    if (filters.mediaType !== 'all' && item.mediaType !== filters.mediaType) {
      return false;
    }

    if (filters.region !== 'All' && item.region !== filters.region) {
      return false;
    }

    if (filters.status !== 'all' && item.status !== filters.status) {
      return false;
    }

    if (filters.genre !== 'All') {
      const targetGenre = filters.genre.toLowerCase();
      const hasGenre = item.genres.some((g) => g.toLowerCase().includes(targetGenre));
      if (!hasGenre) return false;
    }

    if (filters.releaseYear !== 'All') {
      if (filters.releaseYear === '2027+') {
        if (!item.releaseYear || item.releaseYear < 2027) return false;
      } else {
        const yearNum = Number(filters.releaseYear);
        if (item.releaseYear !== yearNum) return false;
      }
    }

    if (filters.platform !== 'All') {
      const targetPlat = filters.platform.toLowerCase();
      const hasPlat = item.platforms.some((p) => {
        const lp = p.toLowerCase();
        if (targetPlat === 'xbox series x|s') {
          return lp.includes('xbox');
        }
        if (targetPlat === 'switch 2') {
          return lp.includes('switch');
        }
        return lp.includes(targetPlat);
      });
      if (!hasPlat) return false;
    }

    if (q) {
      const haystack = [
        item.title,
        item.originalTitle || '',
        item.creator,
        item.region,
        item.language,
        item.synopsis,
        ...item.genres,
        ...item.platforms,
        ...item.castOrStudio,
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    return true;
  });
}

export function sortReleases(items: ReleaseItem[], sortBy: SortOption): ReleaseItem[] {
  const copy = [...items];

  copy.sort((a, b) => {
    if (sortBy === 'popularity') {
      return b.popularityScore - a.popularityScore;
    }

    if (sortBy === 'rating') {
      const rA = a.rating ?? -1;
      const rB = b.rating ?? -1;
      if (rB !== rA) return rB - rA;
      return b.popularityScore - a.popularityScore;
    }

    const tA = parseReleaseTimestamp(a.releaseDate);
    const tB = parseReleaseTimestamp(b.releaseDate);

    if (sortBy === 'release_asc') {
      const now = new Date();
      const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
      const aIsUpcoming = a.status === 'Upcoming' || (tA !== null && tA >= todayUtc);
      const bIsUpcoming = b.status === 'Upcoming' || (tB !== null && tB >= todayUtc);

      if (aIsUpcoming !== bIsUpcoming) {
        return aIsUpcoming ? -1 : 1;
      }
      if (aIsUpcoming && bIsUpcoming) {
        if (tA === null && tB === null) return b.popularityScore - a.popularityScore;
        if (tA === null) return 1;
        if (tB === null) return -1;
        return tA - tB;
      }
      if (tA === null && tB === null) return b.popularityScore - a.popularityScore;
      if (tA === null) return 1;
      if (tB === null) return -1;
      return tB - tA;
    }

    if (tA === null && tB === null) return b.popularityScore - a.popularityScore;
    if (tA === null) return 1;
    if (tB === null) return -1;
    return tB - tA;
  });

  return copy;
}

const ARTWORK_CATALOG = {
  nepaliVillage: { src: nepaliCinemaImg, tint: 'from-[#231915] via-[#13151B] to-[#0B0C0F]' },
  nepaliFestive: { src: nepaliFestiveImg, tint: 'from-[#281A12] via-[#13151B] to-[#0B0C0F]' },
  nepaliMountain: { src: nepaliMountainDramaImg, tint: 'from-[#18221D] via-[#13151B] to-[#0B0C0F]' },
  southAsianEpic: { src: southAsianEpicImg, tint: 'from-[#241B14] via-[#13151B] to-[#0B0C0F]' },
  globalDrama: { src: globalCinemaImg, tint: 'from-[#1C1B18] via-[#13151B] to-[#0B0C0F]' },
  actionThriller: { src: actionThrillerImg, tint: 'from-[#1D1C20] via-[#13151B] to-[#0B0C0F]' },
  darkVigilante: { src: darkVigilanteImg, tint: 'from-[#171B22] via-[#13151B] to-[#0B0C0F]' },
  spiderMetropolis: { src: spiderMetropolisImg, tint: 'from-[#291B14] via-[#13151B] to-[#0B0C0F]' },
  scifiSpace: { src: scifiSpaceImg, tint: 'from-[#211A14] via-[#13151B] to-[#0B0C0F]' },
  superheroCosmic: { src: superheroCosmicImg, tint: 'from-[#1E1522] via-[#13151B] to-[#0B0C0F]' },
  mythicOdyssey: { src: mythicOdysseyImg, tint: 'from-[#1F1C16] via-[#13151B] to-[#0B0C0F]' },
  animatedHarbor: { src: animatedFamilyImg, tint: 'from-[#261B15] via-[#13151B] to-[#0B0C0F]' },
  toyWorkshop: { src: toyWorkshopImg, tint: 'from-[#261C14] via-[#13151B] to-[#0B0C0F]' },
  emeraldFairy: { src: emeraldFairyImg, tint: 'from-[#14231B] via-[#13151B] to-[#0B0C0F]' },
  tokyoNeon: { src: tokyoNeonImg, tint: 'from-[#23151D] via-[#13151B] to-[#0B0C0F]' },
  horrorMystery: { src: horrorMysteryImg, tint: 'from-[#141D1E] via-[#13151B] to-[#0B0C0F]' },
  openWorldGame: { src: openWorldGameImg, tint: 'from-[#22191C] via-[#13151B] to-[#0B0C0F]' },
  nextgenGame: { src: nextgenGameImg, tint: 'from-[#161E2B] via-[#13151B] to-[#0B0C0F]' },
  fantasyRpg: { src: fantasyRpgGameImg, tint: 'from-[#162219] via-[#13151B] to-[#0B0C0F]' },
  espionageGame: { src: espionageGameImg, tint: 'from-[#122026] via-[#13151B] to-[#0B0C0F]' },
  sportsStadium: { src: sportsStadiumImg, tint: 'from-[#132218] via-[#13151B] to-[#0B0C0F]' },
  scifiHorror: { src: scifiHorrorImg, tint: 'from-[#221712] via-[#13151B] to-[#0B0C0F]' },
  gothicCastle: { src: gothicCastleImg, tint: 'from-[#231419] via-[#13151B] to-[#0B0C0F]' },
  miamiViceSunset: { src: miamiViceSunsetImg, tint: 'from-[#26162B] via-[#13151B] to-[#0B0C0F]' },
  supergirlSky: { src: supergirlSkyImg, tint: 'from-[#141E2B] via-[#13151B] to-[#0B0C0F]' },
  polynesianVoyage: { src: polynesianVoyageImg, tint: 'from-[#162426] via-[#13151B] to-[#0B0C0F]' },
  survivalCity: { src: survivalCityImg, tint: 'from-[#141E20] via-[#13151B] to-[#0B0C0F]' },
  wartimeParis: { src: wartimeParisImg, tint: 'from-[#181B21] via-[#13151B] to-[#0B0C0F]' },
} as const;

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function getArtworkCandidates(item: ReleaseItem): ArtworkResult[] {
  const genresLower = item.genres.join(' ').toLowerCase();
  const titleLower = item.title.toLowerCase();
  const synopsisLower = (item.synopsis || '').toLowerCase();
  const combined = `${titleLower} ${genresLower} ${synopsisLower}`;

  const candidates: ArtworkResult[] = [];
  const push = (art: ArtworkResult) => {
    if (!candidates.some((c) => c.src === art.src)) {
      candidates.push(art);
    }
  };

  if (item.mediaType === 'game') {
    if (combined.includes('football') || combined.includes('soccer') || combined.includes('manager') || combined.includes('sports')) {
      push(ARTWORK_CATALOG.sportsStadium);
    }
    if (combined.includes('007') || combined.includes('bond') || combined.includes('espionage') || combined.includes('spy') || combined.includes('stealth')) {
      push(ARTWORK_CATALOG.espionageGame);
    }
    if (combined.includes('duskbloods') || combined.includes('blood') || combined.includes('vampire') || combined.includes('gothic') || combined.includes('souls')) {
      push(ARTWORK_CATALOG.gothicCastle);
    }
    if (combined.includes('alien') || (combined.includes('space') && combined.includes('horror')) || combined.includes('dead space')) {
      push(ARTWORK_CATALOG.scifiHorror);
    }
    if (combined.includes('resident evil') || genresLower.includes('horror')) {
      push(ARTWORK_CATALOG.survivalCity);
      push(ARTWORK_CATALOG.horrorMystery);
      push(ARTWORK_CATALOG.scifiHorror);
      push(ARTWORK_CATALOG.gothicCastle);
    }
    if (combined.includes('grand theft') || combined.includes('gta') || combined.includes('vice city') || combined.includes('miami') || combined.includes('leonida')) {
      push(ARTWORK_CATALOG.miamiViceSunset);
      push(ARTWORK_CATALOG.openWorldGame);
    }
    if (combined.includes('crime') || combined.includes('racing')) {
      push(ARTWORK_CATALOG.openWorldGame);
      push(ARTWORK_CATALOG.actionThriller);
    }
    if (combined.includes('fable') || combined.includes('kingdom hearts') || genresLower.includes('rpg') || genresLower.includes('fantasy')) {
      push(ARTWORK_CATALOG.fantasyRpg);
      push(ARTWORK_CATALOG.emeraldFairy);
    }
    if (combined.includes('marvel') || combined.includes('hydra') || combined.includes('1943')) {
      push(ARTWORK_CATALOG.wartimeParis);
      push(ARTWORK_CATALOG.superheroCosmic);
    }
    if (genresLower.includes('sci-fi') || combined.includes('cyber') || combined.includes('space')) {
      push(ARTWORK_CATALOG.nextgenGame);
      push(ARTWORK_CATALOG.scifiSpace);
    }
    // Secondary genre-appropriate game backups
    push(ARTWORK_CATALOG.nextgenGame);
    push(ARTWORK_CATALOG.openWorldGame);
    push(ARTWORK_CATALOG.espionageGame);
    push(ARTWORK_CATALOG.fantasyRpg);
    push(ARTWORK_CATALOG.gothicCastle);
    push(ARTWORK_CATALOG.scifiHorror);
    push(ARTWORK_CATALOG.tokyoNeon);
    return candidates;
  }

  // Movies: exact title & regional cinema matches first
  if (item.region === 'Nepali') {
    if (combined.includes('kabaddi') || combined.includes('village') || combined.includes('rural')) {
      push(ARTWORK_CATALOG.nepaliVillage);
    }
    if (combined.includes('pension') || combined.includes('dashain') || combined.includes('festiv') || combined.includes('romance') || combined.includes('comedy')) {
      push(ARTWORK_CATALOG.nepaliFestive);
    }
    if (combined.includes('badal') || combined.includes('aama') || combined.includes('mountain') || genresLower.includes('drama')) {
      push(ARTWORK_CATALOG.nepaliMountain);
    }
    if (genresLower.includes('action') || genresLower.includes('thriller') || genresLower.includes('crime')) {
      push(ARTWORK_CATALOG.actionThriller);
    }
    if (genresLower.includes('horror') || genresLower.includes('mystery')) {
      push(ARTWORK_CATALOG.horrorMystery);
    }
    push(ARTWORK_CATALOG.nepaliVillage);
    push(ARTWORK_CATALOG.nepaliMountain);
    push(ARTWORK_CATALOG.nepaliFestive);
    push(ARTWORK_CATALOG.southAsianEpic);
    push(ARTWORK_CATALOG.globalDrama);
    push(ARTWORK_CATALOG.actionThriller);
    push(ARTWORK_CATALOG.tokyoNeon);
    return candidates;
  }

  if (item.region === 'Bollywood') {
    push(ARTWORK_CATALOG.southAsianEpic);
    push(ARTWORK_CATALOG.nepaliFestive);
    push(ARTWORK_CATALOG.mythicOdyssey);
  }

  if (item.region === 'Asian') {
    push(ARTWORK_CATALOG.tokyoNeon);
  }

  if (combined.includes('batman') || combined.includes('dark knight') || combined.includes('vigilante')) {
    push(ARTWORK_CATALOG.darkVigilante);
  }
  if (combined.includes('spider-man') || combined.includes('spiderman') || combined.includes('brand new day')) {
    push(ARTWORK_CATALOG.spiderMetropolis);
  }
  if (combined.includes('supergirl') || combined.includes('superman')) {
    push(ARTWORK_CATALOG.supergirlSky);
  }
  if (combined.includes('avengers') || combined.includes('doomsday') || combined.includes('marvel')) {
    push(ARTWORK_CATALOG.superheroCosmic);
  }
  if (combined.includes('dune') || (genresLower.includes('sci-fi') && !combined.includes('avengers'))) {
    push(ARTWORK_CATALOG.scifiSpace);
  }
  if (combined.includes('moana') || combined.includes('polynesia') || combined.includes('ocean')) {
    push(ARTWORK_CATALOG.polynesianVoyage);
  }
  if (combined.includes('odyssey') || combined.includes('voyage') || combined.includes('myth')) {
    push(ARTWORK_CATALOG.mythicOdyssey);
  }
  if (combined.includes('toy story') || combined.includes('lego') || combined.includes('toy')) {
    push(ARTWORK_CATALOG.toyWorkshop);
  }
  if (combined.includes('shrek') || combined.includes('fairy') || combined.includes('witch')) {
    push(ARTWORK_CATALOG.emeraldFairy);
  }
  if (combined.includes('gatto') || genresLower.includes('animation') || combined.includes('animated')) {
    push(ARTWORK_CATALOG.animatedHarbor);
    push(ARTWORK_CATALOG.toyWorkshop);
    push(ARTWORK_CATALOG.emeraldFairy);
  }
  if (genresLower.includes('horror') || genresLower.includes('mystery')) {
    push(ARTWORK_CATALOG.horrorMystery);
    push(ARTWORK_CATALOG.gothicCastle);
  }
  if (genresLower.includes('action') || genresLower.includes('thriller') || genresLower.includes('crime')) {
    push(ARTWORK_CATALOG.actionThriller);
    push(ARTWORK_CATALOG.darkVigilante);
    push(ARTWORK_CATALOG.spiderMetropolis);
    push(ARTWORK_CATALOG.espionageGame);
  }

  push(ARTWORK_CATALOG.globalDrama);
  push(ARTWORK_CATALOG.tokyoNeon);
  push(ARTWORK_CATALOG.spiderMetropolis);
  push(ARTWORK_CATALOG.mythicOdyssey);
  push(ARTWORK_CATALOG.actionThriller);
  push(ARTWORK_CATALOG.scifiSpace);
  push(ARTWORK_CATALOG.fantasyRpg);
  push(ARTWORK_CATALOG.animatedHarbor);
  return candidates;
}

const PROCEDURAL_PALETTES = [
  { top: '#1A1324', mid: '#3A1C3E', glow: '#E5484D', ridge1: '#150F1E', ridge2: '#0B0C0F' },
  { top: '#0E1C26', mid: '#1B3D4B', glow: '#38BDF8', ridge1: '#0D1E28', ridge2: '#090D12' },
  { top: '#241612', mid: '#56291A', glow: '#F59E0B', ridge1: '#1C110E', ridge2: '#0D0B0C' },
  { top: '#122119', mid: '#1F4732', glow: '#34D399', ridge1: '#0E1B14', ridge2: '#090E0C' },
  { top: '#23141B', mid: '#4E1D2F', glow: '#FB7185', ridge1: '#1A0F15', ridge2: '#0B0B0E' },
  { top: '#17182B', mid: '#2E3159', glow: '#A78BFA', ridge1: '#131424', ridge2: '#0A0B10' },
  { top: '#211B11', mid: '#4A3A1E', glow: '#FBBF24', ridge1: '#19140D', ridge2: '#0B0B0D' },
  { top: '#111D22', mid: '#1D3B46', glow: '#2DD4BF', ridge1: '#0E171B', ridge2: '#090C0E' },
];

/**
 * Generates a 100% unique, copyright-free widescreen SVG poster data URI
 * themed deterministically to the item's title, region, mediaType, and genres.
 */
function createUniqueProceduralPoster(item: ReleaseItem): ArtworkResult {
  const seed = hashString(`${item.id}:${item.title}:${item.releaseDate}`);
  const pal = PROCEDURAL_PALETTES[seed % PROCEDURAL_PALETTES.length];
  const sunX = 180 + (seed % 440);
  const sunY = 120 + ((seed >> 4) % 110);
  const sunR = 36 + ((seed >> 8) % 34);
  const genresLower = item.genres.join(' ').toLowerCase();

  let sceneLayer = '';

  if (item.region === 'Nepali' || genresLower.includes('drama') || genresLower.includes('adventure')) {
    // Layered Himalayan mountain peaks + warm rising sun + valley mist
    const p1 = 150 + (seed % 45);
    const p2 = 125 + ((seed >> 3) % 55);
    const p3 = 165 + ((seed >> 6) % 40);
    sceneLayer = `
      <circle cx="${sunX}" cy="${sunY}" r="${sunR}" fill="${pal.glow}" opacity="0.72" />
      <circle cx="${sunX}" cy="${sunY}" r="${sunR * 1.9}" fill="${pal.glow}" opacity="0.14" />
      <polygon points="0,450 0,290 ${180 + (seed % 60)},${p1} 390,260 ${560 + (seed % 70)},${p2} 800,250 800,450" fill="${pal.ridge1}" opacity="0.92" />
      <polygon points="0,450 110,320 ${290 + (seed % 50)},${p3} 510,310 ${690 - (seed % 40)},${p1 + 35} 800,300 800,450" fill="${pal.ridge2}" />
      <rect x="0" y="340" width="800" height="110" fill="url(#mist-${seed})" />
    `;
  } else if (genresLower.includes('sci-fi') || genresLower.includes('space')) {
    // Orbital ringed exoplanet + starfield + monolith horizon
    const stars = Array.from({ length: 24 }, (_, idx) => {
      const sx = ((seed * (idx + 7)) % 760) + 20;
      const sy = ((seed * (idx + 13)) % 250) + 15;
      const sr = (idx % 3) * 0.6 + 0.8;
      return `<circle cx="${sx}" cy="${sy}" r="${sr}" fill="#FFFFFF" opacity="${0.35 + (idx % 5) * 0.12}" />`;
    }).join('');
    const tilt = -18 + (seed % 36);
    sceneLayer = `
      ${stars}
      <circle cx="${sunX}" cy="${sunY}" r="${sunR * 1.2}" fill="url(#orb-${seed})" />
      <ellipse cx="${sunX}" cy="${sunY}" rx="${sunR * 2.3}" ry="${sunR * 0.48}" transform="rotate(${tilt} ${sunX} ${sunY})" fill="none" stroke="${pal.glow}" stroke-width="2.5" opacity="0.65" />
      <path d="M0,375 Q400,${310 + (seed % 40)} 800,385 L800,450 L0,450 Z" fill="${pal.ridge2}" />
    `;
  } else {
    // Noir/cyberpunk architectural skyline + diagonal searchlight beam + glowing bokeh
    const towers = Array.from({ length: 14 }, (_, idx) => {
      const w = 36 + ((seed >> (idx % 8)) % 34);
      const x = idx * 58;
      const h = 110 + (((seed >> (idx % 12)) + idx * 37) % 165);
      const y = 450 - h;
      const winY = y + 16;
      return `
        <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${idx % 2 === 0 ? pal.ridge1 : pal.ridge2}" />
        <rect x="${x + 8}" y="${winY}" width="${Math.max(6, w - 16)}" height="3" fill="${pal.glow}" opacity="0.45" />
      `;
    }).join('');
    const beamX = 120 + (seed % 520);
    sceneLayer = `
      <polygon points="${beamX},450 ${beamX - 180},0 ${beamX + 90},0" fill="${pal.glow}" opacity="0.11" />
      <circle cx="${sunX}" cy="${sunY + 25}" r="${sunR * 1.4}" fill="${pal.glow}" opacity="0.24" />
      ${towers}
    `;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" preserveAspectRatio="xMidYMid slice">
    <defs>
      <linearGradient id="sky-${seed}" x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0%" stop-color="${pal.top}" />
        <stop offset="55%" stop-color="${pal.mid}" />
        <stop offset="100%" stop-color="${pal.ridge2}" />
      </linearGradient>
      <linearGradient id="mist-${seed}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${pal.glow}" stop-opacity="0.16" />
        <stop offset="100%" stop-color="${pal.ridge2}" stop-opacity="0.9" />
      </linearGradient>
      <radialGradient id="orb-${seed}" cx="35%" cy="35%" r="65%">
        <stop offset="0%" stop-color="${pal.glow}" stop-opacity="0.95" />
        <stop offset="70%" stop-color="${pal.mid}" stop-opacity="0.9" />
        <stop offset="100%" stop-color="${pal.ridge2}" stop-opacity="1" />
      </radialGradient>
    </defs>
    <rect width="800" height="450" fill="url(#sky-${seed})" />
    ${sceneLayer}
  </svg>`;

  return {
    src: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    tint: 'from-[#1D1C22] via-[#13151B] to-[#0B0C0F]',
  };
}

function getSignatureArtwork(item: ReleaseItem): ArtworkResult | null {
  const t = item.title.toLowerCase();
  if (t.includes('grand theft auto') || t.includes('gta')) return ARTWORK_CATALOG.miamiViceSunset;
  if (t.includes('football manager')) return ARTWORK_CATALOG.sportsStadium;
  if (t.includes('007')) return ARTWORK_CATALOG.espionageGame;
  if (t.includes('duskbloods')) return ARTWORK_CATALOG.gothicCastle;
  if (t.includes('alien')) return ARTWORK_CATALOG.scifiHorror;
  if (t.includes('resident evil')) return ARTWORK_CATALOG.survivalCity;
  if (t.includes('fable')) return ARTWORK_CATALOG.fantasyRpg;
  if (t.includes('kingdom hearts')) return ARTWORK_CATALOG.nextgenGame;
  if (t.includes('marvel 1943')) return ARTWORK_CATALOG.wartimeParis;

  if (t.includes('kabaddi')) return ARTWORK_CATALOG.nepaliVillage;
  if (t.includes('pension patta')) return ARTWORK_CATALOG.nepaliFestive;
  if (t.includes('ek mutthi') || t.includes('aa bata aama')) return ARTWORK_CATALOG.nepaliMountain;
  if (t.includes('ramayana')) return ARTWORK_CATALOG.southAsianEpic;
  if (t.includes('dune')) return ARTWORK_CATALOG.scifiSpace;
  if (t.includes('supergirl')) return ARTWORK_CATALOG.supergirlSky;
  if (t.includes('avengers') || t.includes('doomsday')) return ARTWORK_CATALOG.superheroCosmic;
  if (t.includes('spider-man') || t.includes('spiderman')) return ARTWORK_CATALOG.spiderMetropolis;
  if (t.includes('batman')) return ARTWORK_CATALOG.darkVigilante;
  if (t.includes('moana')) return ARTWORK_CATALOG.polynesianVoyage;
  if (t.includes('odyssey')) return ARTWORK_CATALOG.mythicOdyssey;
  if (t.includes('toy story')) return ARTWORK_CATALOG.toyWorkshop;
  if (t.includes('shrek')) return ARTWORK_CATALOG.emeraldFairy;
  if (t.includes('gatto')) return ARTWORK_CATALOG.animatedHarbor;
  return null;
}

/**
 * Guarantees that no two items in a displayed list share the same poster image.
 * Pass 1 locks exact title-matched signature posters (e.g., Miami sunset for GTA VI)
 * so earlier items cannot claim them. Pass 2 assigns remaining unused curated posters
 * or synthesizes a unique bespoke procedural SVG poster per title.
 */
export function assignUniqueArtworks(items: ReleaseItem[]): Record<string, ArtworkResult> {
  const result: Record<string, ArtworkResult> = {};
  const usedSrcs = new Set<string>();
  const allCatalogValues = Object.values(ARTWORK_CATALOG);

  // Pass 1: Lock signature title-matched posters first
  for (const item of items) {
    const signature = getSignatureArtwork(item);
    if (signature && !usedSrcs.has(signature.src)) {
      result[item.id] = signature;
      usedSrcs.add(signature.src);
    }
  }

  // Pass 2: Assign remaining items without repeating any used poster
  for (const item of items) {
    if (result[item.id]) continue;

    const candidates = getArtworkCandidates(item);
    let chosen: ArtworkResult | null = null;

    for (const candidate of candidates) {
      if (!usedSrcs.has(candidate.src)) {
        chosen = candidate;
        break;
      }
    }

    if (!chosen) {
      const startIdx = hashString(item.id || item.title) % allCatalogValues.length;
      for (let offset = 0; offset < allCatalogValues.length; offset++) {
        const candidate = allCatalogValues[(startIdx + offset) % allCatalogValues.length];
        if (!usedSrcs.has(candidate.src)) {
          chosen = candidate;
          break;
        }
      }
    }

    if (!chosen) {
      chosen = createUniqueProceduralPoster(item);
    }

    usedSrcs.add(chosen.src);
    result[item.id] = chosen;
  }

  return result;
}

export function getArtworkForItem(item: ReleaseItem): ArtworkResult {
  const candidates = getArtworkCandidates(item);
  return candidates[0] || ARTWORK_CATALOG.globalDrama;
}

export function downloadICSReminder(item: ReleaseItem): void {
  const ts = parseReleaseTimestamp(item.releaseDate);
  const dateObj = ts ? new Date(ts) : new Date(Date.now() + 86400000 * 30);
  const y = dateObj.getUTCFullYear();
  const m = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getUTCDate()).padStart(2, '0');
  const startStr = `${y}${m}${d}`;

  const nextDay = new Date(dateObj.getTime() + 86400000);
  const ny = nextDay.getUTCFullYear();
  const nm = String(nextDay.getUTCMonth() + 1).padStart(2, '0');
  const nd = String(nextDay.getUTCDate()).padStart(2, '0');
  const endStr = `${ny}${nm}${nd}`;

  const cleanTitle = item.title.replace(/[\r\n,;]/g, ' ');
  const cleanDesc = `${item.region} ${item.mediaType === 'game' ? 'Game' : 'Movie'} (${item.genres.join(', ')}) — ${item.platforms.join(', ')}. ${item.synopsis}`.replace(
    /[\r\n]/g,
    ' '
  );

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Movies and Games//EN',
    'BEGIN:VEVENT',
    `UID:${item.id}@cue-radar`,
    `DTSTAMP:${startStr}T090000Z`,
    `DTSTART;VALUE=DATE:${startStr}`,
    `DTEND;VALUE=DATE:${endStr}`,
    `SUMMARY:Release: ${cleanTitle}`,
    `DESCRIPTION:${cleanDesc}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${item.id}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
