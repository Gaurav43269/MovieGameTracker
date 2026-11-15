import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type { GroundSource, NewsArticle, ReleaseDetails, ReleaseItem } from './src/types/release.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

interface CacheEntry<T> {
  data: T;
  source: 'gemini' | 'public_live';
  notice?: string;
  expiresAt: number;
}

const discoverCache = new Map<string, CacheEntry<ReleaseItem[]>>();
const searchCache = new Map<string, CacheEntry<ReleaseItem[]>>();
const detailCache = new Map<string, CacheEntry<ReleaseDetails>>();
const newsCache = new Map<string, CacheEntry<NewsArticle[]> & { updatedAt: string }>();

// In-flight deduplication prevents React StrictMode or rapid taps from firing duplicate API calls
const inFlightDiscover = new Map<string, Promise<CacheEntry<ReleaseItem[]>>>();
const inFlightSearch = new Map<string, Promise<CacheEntry<ReleaseItem[]>>>();
const inFlightDetails = new Map<string, Promise<CacheEntry<ReleaseDetails>>>();
const inFlightNews = new Map<string, Promise<CacheEntry<NewsArticle[]> & { updatedAt: string }>>();

const CACHE_TTL_MS = 1000 * 60 * 5; // 5 minutes so releases & news stay continuously updated

const WIKI_HEADERS = {
  'User-Agent': 'CueReleaseRadar/1.0 (https://cue.app)',
  Accept: 'application/json',
};

function getTodayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isQuotaOrRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('quota') ||
    msg.includes('rate limit')
  );
}

function extractGroundingSources(response: unknown): GroundSource[] {
  const res = response as {
    candidates?: Array<{
      groundingMetadata?: {
        groundingChunks?: Array<{
          web?: { uri?: string; title?: string };
        }>;
      };
    }>;
  };
  const chunks = res?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const seen = new Set<string>();
  const sources: GroundSource[] = [];
  for (const chunk of chunks) {
    const uri = chunk?.web?.uri;
    const title = chunk?.web?.title;
    if (uri && !seen.has(uri)) {
      seen.add(uri);
      sources.push({
        uri,
        title: title || new URL(uri).hostname.replace(/^www\./, ''),
      });
    }
    if (sources.length >= 4) break;
  }
  return sources;
}

function extractJsonText(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    return fenced[1].trim();
  }
  const firstBracket = raw.indexOf('[');
  const firstBrace = raw.indexOf('{');
  let start = -1;
  let end = -1;

  if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
    start = firstBracket;
    end = raw.lastIndexOf(']');
  } else if (firstBrace !== -1) {
    start = firstBrace;
    end = raw.lastIndexOf('}');
  }

  if (start !== -1 && end > start) {
    return raw.slice(start, end + 1);
  }
  return raw.trim();
}

function sanitizeReleaseItem(
  raw: Partial<ReleaseItem>,
  index: number,
  fallbackSources: GroundSource[]
): ReleaseItem {
  const mediaType = raw.mediaType === 'game' ? 'game' : 'movie';
  const validRegions = ['Nepali', 'Hollywood', 'Bollywood', 'Asian', 'European', 'Global'] as const;
  const region = validRegions.includes(raw.region as (typeof validRegions)[number])
    ? (raw.region as ReleaseItem['region'])
    : 'Global';
  const validStatuses = ['Upcoming', 'Released', 'TBA'] as const;
  const status = validStatuses.includes(raw.status as (typeof validStatuses)[number])
    ? (raw.status as ReleaseItem['status'])
    : 'Upcoming';

  const title = (raw.title || 'Untitled Release').trim();
  const releaseYear =
    typeof raw.releaseYear === 'number' && Number.isFinite(raw.releaseYear)
      ? raw.releaseYear
      : raw.releaseDate && /^\d{4}/.test(raw.releaseDate)
        ? Number(raw.releaseDate.slice(0, 4))
        : null;

  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return {
    id: raw.id || `${mediaType}-${slug || index}-${releaseYear ?? 'tba'}`,
    title,
    originalTitle: raw.originalTitle || undefined,
    mediaType,
    region,
    language: raw.language || (region === 'Nepali' ? 'Nepali' : 'English'),
    releaseDate: raw.releaseDate || (releaseYear ? `${releaseYear}` : 'TBA'),
    displayDate: raw.displayDate || raw.releaseDate || 'TBA',
    releaseYear,
    status,
    genres:
      Array.isArray(raw.genres) && raw.genres.length > 0
        ? raw.genres.slice(0, 3)
        : [mediaType === 'game' ? 'Action' : 'Drama'],
    platforms:
      Array.isArray(raw.platforms) && raw.platforms.length > 0
        ? raw.platforms.slice(0, 5)
        : [mediaType === 'game' ? 'PC' : 'Theaters'],
    rating:
      typeof raw.rating === 'number' && raw.rating > 0 && raw.rating <= 10
        ? Math.round(raw.rating * 10) / 10
        : null,
    popularityScore:
      typeof raw.popularityScore === 'number' && Number.isFinite(raw.popularityScore)
        ? Math.max(1, Math.min(100, Math.round(raw.popularityScore)))
        : 75,
    creator: raw.creator || 'TBA',
    castOrStudio: Array.isArray(raw.castOrStudio) ? raw.castOrStudio.slice(0, 4) : [],
    runtimeOrPlaytime: raw.runtimeOrPlaytime || 'TBD',
    synopsis: raw.synopsis || 'Release details verified via web search.',
    releaseNotes: raw.releaseNotes || '',
    sources: Array.isArray(raw.sources) && raw.sources.length > 0 ? raw.sources : fallbackSources,
  };
}

// ============================================================================
// Live Public Media API Fallback Engine (Wikipedia + Wikidata + Steam Store)
// ============================================================================

interface WikiSummary {
  title?: string;
  description?: string;
  extract?: string;
  wikibase_item?: string;
  content_urls?: { desktop?: { page?: string } };
}

function parseWikidataTime(rawTime: string): { iso: string; display: string; year: number } | null {
  const m = rawTime.match(/^\+?(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(year) || year < 1900 || year > 2100) return null;

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const display = `${monthNames[month - 1]} ${day}, ${year}`;
    return { iso, display, year };
  }
  if (month >= 1 && month <= 12) {
    const iso = `${year}-${String(month).padStart(2, '0')}`;
    const display = `${monthNames[month - 1]} ${year}`;
    return { iso, display, year };
  }
  return { iso: `${year}`, display: `${year}`, year };
}

async function fetchWikidataReleaseDate(qid?: string): Promise<{ iso: string; display: string; year: number } | null> {
  if (!qid) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const res = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(qid)}.json`, {
      headers: WIKI_HEADERS,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      entities?: Record<
        string,
        {
          claims?: {
            P577?: Array<{ mainsnak?: { datavalue?: { value?: { time?: string } } } }>;
          };
        }
      >;
    };
    const p577 = data.entities?.[qid]?.claims?.P577;
    if (!Array.isArray(p577) || p577.length === 0) return null;

    const parsedDates = p577
      .map((c) => c.mainsnak?.datavalue?.value?.time)
      .filter((t): t is string => Boolean(t))
      .map(parseWikidataTime)
      .filter((d): d is { iso: string; display: string; year: number } => Boolean(d));

    if (parsedDates.length === 0) return null;
    // Prefer full YYYY-MM-DD dates, and take the most recent/current scheduled release date
    const exactDates = parsedDates.filter((d) => d.iso.length === 10);
    const pool = exactDates.length > 0 ? exactDates : parsedDates;
    pool.sort((a, b) => a.iso.localeCompare(b.iso));
    return pool[pool.length - 1];
  } catch {
    return null;
  }
}

function formatParsedDate(year: number, month?: number, day?: number): { iso: string; display: string; year: number } | null {
  if (!Number.isFinite(year) || year < 1900 || year > 2100) return null;
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (month && month >= 1 && month <= 12 && day && day >= 1 && day <= 31) {
    return {
      iso: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      display: `${monthNames[month - 1]} ${day}, ${year}`,
      year,
    };
  }
  if (month && month >= 1 && month <= 12) {
    return {
      iso: `${year}-${String(month).padStart(2, '0')}`,
      display: `${monthNames[month - 1]} ${year}`,
      year,
    };
  }
  return { iso: `${year}`, display: `${year}`, year };
}

function parseTextDate(text: string): { iso: string; display: string; year: number } | null {
  const months: Record<string, number> = {
    january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3,
    april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7,
    august: 8, aug: 8, september: 9, sep: 9, sept: 9, october: 10, oct: 10,
    november: 11, nov: 11, december: 12, dec: 12,
  };

  // "19 November 2026" or "23 February 2027"
  const dmy = text.match(/\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(20\d{2})\b/i);
  if (dmy) {
    return formatParsedDate(Number(dmy[3]), months[dmy[2].toLowerCase()], Number(dmy[1]));
  }

  // "November 19, 2026" or "July 31, 2026"
  const mdy = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(20\d{2})\b/i);
  if (mdy) {
    return formatParsedDate(Number(mdy[3]), months[mdy[1].toLowerCase()], Number(mdy[2]));
  }

  // "November 2026"
  const my = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/i);
  if (my) {
    return formatParsedDate(Number(my[2]), months[my[1].toLowerCase()]);
  }

  return null;
}

function extractWikiReleaseDate(wikitext: string, extract: string): { iso: string; display: string; year: number } | null {
  // 1. Parse {{Film date|...}} or {{Start date|...}} templates
  const templateMatch = wikitext.match(/\{\{\s*(?:Film date|Start date|vgrelease)[^}]+\}\}/i);
  if (templateMatch) {
    const rawTpl = templateMatch[0];
    // Match YYYY|M|D inside template
    const numTriple = rawTpl.match(/\|(20\d{2})\|(\d{1,2})\|(\d{1,2})\b/);
    if (numTriple) {
      const parsed = formatParsedDate(Number(numTriple[1]), Number(numTriple[2]), Number(numTriple[3]));
      if (parsed) return parsed;
    }
    const textInTpl = parseTextDate(rawTpl);
    if (textInTpl) return textInTpl;
  }

  // 2. Parse | released = ... or | release = ... in infobox
  const infoboxReleased = wikitext.match(/\|\s*(?:released|release_date|release)\s*=\s*([^\n|]+)/i)?.[1];
  if (infoboxReleased) {
    const parsedInfobox = parseTextDate(infoboxReleased);
    if (parsedInfobox) return parsedInfobox;
  }

  // 3. Parse release sentences from Wikipedia extract
  const sentenceMatch = extract.match(/(?:released|scheduled to be released|set to be released|slated for release|premiered)\s+(?:theatrically\s+)?(?:in\s+[^,]+?\s+)?(?:on|in)\s+([^.;]+)/i);
  if (sentenceMatch) {
    const parsedSentence = parseTextDate(sentenceMatch[1]);
    if (parsedSentence) return parsedSentence;
  }

  return parseTextDate(extract);
}

function inferFromWikiExtract(
  summary: WikiSummary,
  wdDate: { iso: string; display: string; year: number } | null,
  hint?: { region?: ReleaseItem['region']; mediaType?: 'movie' | 'game'; platforms?: string[]; rating?: number | null; popularity?: number },
  wikitext = ''
): ReleaseItem | null {
  const title = (summary.title || '').trim();
  const extract = (summary.extract || '').trim();
  const desc = (summary.description || '').toLowerCase();
  if (!title || !extract) return null;

  const lower = `${desc} ${extract.slice(0, 260).toLowerCase()}`;
  const isGame =
    hint?.mediaType === 'game' ||
    /\b(video game|action-adventure game|role-playing game|rpg|platformer|shooter|metroidvania|survival horror)\b/.test(lower);
  const isMovie =
    hint?.mediaType === 'movie' ||
    /\b(film|movie|feature|animated|cinema|cinema|documentary)\b/.test(lower);

  if (!isGame && !isMovie) return null;

  const mediaType: 'movie' | 'game' = isGame ? 'game' : 'movie';

  let region: ReleaseItem['region'] = hint?.region || 'Global';
  if (!hint?.region) {
    if (/\b(nepalese|nepali)\b/.test(lower)) region = 'Nepali';
    else if (/\b(indian|hindi|tamil|telugu|malayalam|kannada|marathi|bollywood)\b/.test(lower)) region = 'Bollywood';
    else if (/\b(japanese|korean|south korean|chinese|hong kong|taiwanese|anime)\b/.test(lower)) region = 'Asian';
    else if (/\b(french|german|british|spanish|italian|swedish|danish|polish)\b/.test(lower)) region = 'European';
    else if (/\b(american|hollywood)\b/.test(lower)) region = 'Hollywood';
  }

  let language = 'English';
  if (region === 'Nepali') language = 'Nepali';
  else if (region === 'Bollywood') language = 'Hindi';
  else if (/\bjapanese\b/.test(lower)) language = 'Japanese';
  else if (/\b(korean|south korean)\b/.test(lower)) language = 'Korean';

  // Prefer exact Wikipedia infobox/text date (YYYY-MM-DD) over year-only Wikidata
  const wikiParsedDate = extractWikiReleaseDate(wikitext, extract);
  const bestDate =
    wikiParsedDate && (!wdDate || wikiParsedDate.iso.length >= wdDate.iso.length)
      ? wikiParsedDate
      : wdDate;

  const yearMatch = extract.match(/\b(202[0-9]|2030)\b/);
  const fallbackYear = yearMatch ? Number(yearMatch[1]) : null;
  const releaseDate = bestDate?.iso || (fallbackYear ? `${fallbackYear}` : 'TBA');
  const displayDate = bestDate?.display || (fallbackYear ? `${fallbackYear}` : 'TBA');
  const releaseYear = bestDate?.year ?? fallbackYear;

  const todayIso = getTodayIso();
  let status: ReleaseItem['status'] = 'Upcoming';
  if (releaseDate === 'TBA') {
    status = 'TBA';
  } else if (/\b(is an upcoming|scheduled to be released|slated for|due to be released|expected to be released)\b/.test(lower)) {
    status = 'Upcoming';
  } else if (releaseDate.length === 10) {
    status = releaseDate <= todayIso ? 'Released' : 'Upcoming';
  } else if (releaseYear && releaseYear < Number(todayIso.slice(0, 4))) {
    status = 'Released';
  }

  // Extract genres
  const genreDict = [
    ['Science fiction', 'Sci-Fi'],
    ['sci-fi', 'Sci-Fi'],
    ['action-adventure', 'Action'],
    ['action', 'Action'],
    ['social-drama', 'Drama'],
    ['drama', 'Drama'],
    ['thriller', 'Thriller'],
    ['horror', 'Horror'],
    ['comedy', 'Comedy'],
    ['romance', 'Romance'],
    ['romantic', 'Romance'],
    ['role-playing', 'RPG'],
    ['metroidvania', 'Adventure'],
    ['adventure', 'Adventure'],
    ['superhero', 'Action'],
    ['animation', 'Animation'],
    ['animated', 'Animation'],
    ['anime', 'Animation'],
    ['fantasy', 'Fantasy'],
    ['crime', 'Crime'],
    ['mystery', 'Thriller'],
  ] as const;

  const genres: string[] = [];
  for (const [needle, label] of genreDict) {
    if (lower.includes(needle) && !genres.includes(label)) {
      genres.push(label);
    }
    if (genres.length >= 3) break;
  }
  if (genres.length === 0) {
    genres.push(mediaType === 'game' ? 'Action' : 'Drama');
  }

  // Extract director or developer
  let creator = 'TBA';
  const dirMatch = extract.match(/directed by ([^,.;(]+)/i);
  const devMatch = extract.match(/developed (?:and published )?by ([^,.;(]+)/i);
  if (dirMatch && dirMatch[1]) creator = dirMatch[1].trim();
  else if (devMatch && devMatch[1]) creator = devMatch[1].trim();

  // Extract platforms
  const platforms: string[] = hint?.platforms ? [...hint.platforms] : [];
  if (platforms.length === 0) {
    if (mediaType === 'game') {
      if (/playstation 5|\bps5\b/i.test(extract)) platforms.push('PS5');
      if (/xbox series/i.test(extract)) platforms.push('Xbox Series X|S');
      if (/windows|pc\b|steam/i.test(extract)) platforms.push('PC');
      if (/switch 2|nintendo switch/i.test(extract)) platforms.push('Switch 2');
      if (/\bios\b/i.test(extract)) platforms.push('iOS');
      if (/\bandroid\b/i.test(extract)) platforms.push('Android');
      if (platforms.length === 0) platforms.push('PS5', 'Xbox Series X|S', 'PC');
    } else {
      platforms.push(region === 'Nepali' ? 'QFX Cinemas' : 'Theaters');
      if (status === 'Released') platforms.push('Digital / OTT');
    }
  }

  const pageUrl = summary.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;

  const cleanTitle = title.replace(/\s*\((?:\d{4}\s+)?(?:film|video game)\)$/i, '').trim();

  return sanitizeReleaseItem(
    {
      title: cleanTitle,
      mediaType,
      region,
      language,
      releaseDate,
      displayDate,
      releaseYear,
      status,
      genres,
      platforms,
      rating: hint?.rating ?? (status === 'Released' ? 7.8 : null),
      popularityScore: hint?.popularity ?? (status === 'Upcoming' ? 88 : 82),
      creator,
      castOrStudio: [],
      runtimeOrPlaytime: mediaType === 'game' ? 'Full Release' : 'Feature Film',
      synopsis: extract.split(/(?<=[.!?])\s+/).slice(0, 2).join(' '),
      releaseNotes:
        region === 'Nepali'
          ? 'Nepali cinema release tracked via Wikipedia & Wikidata.'
          : 'Release metadata verified via Wikipedia & Wikidata.',
      sources: [{ title: `Wikipedia — ${cleanTitle}`, uri: pageUrl }],
    },
    0,
    [{ title: 'Wikipedia', uri: pageUrl }]
  );
}

async function fetchWikiEntry(
  wikiTitle: string,
  hint?: { region?: ReleaseItem['region']; mediaType?: 'movie' | 'game'; platforms?: string[]; rating?: number | null; popularity?: number }
): Promise<ReleaseItem | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5500);
    const [summaryRes, infoboxRes] = await Promise.all([
      fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`,
        { headers: WIKI_HEADERS, signal: controller.signal }
      ),
      fetch(
        `https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&rvsection=0&redirects=1&titles=${encodeURIComponent(
          wikiTitle
        )}&format=json&origin=*`,
        { headers: WIKI_HEADERS, signal: controller.signal }
      ),
    ]);
    clearTimeout(timer);
    if (!summaryRes.ok) return null;
    const summary = (await summaryRes.json()) as WikiSummary;
    let wikitext = '';
    if (infoboxRes.ok) {
      const infoJson = (await infoboxRes.json()) as {
        query?: { pages?: Record<string, { revisions?: Array<{ '*': string }> }> };
      };
      const firstPage = Object.values(infoJson.query?.pages || {})[0];
      wikitext = firstPage?.revisions?.[0]?.['*'] || '';
    }
    const quickWikiDate = extractWikiReleaseDate(wikitext, summary.extract || '');
    const wdDate =
      quickWikiDate && quickWikiDate.iso.length === 10
        ? quickWikiDate
        : await fetchWikidataReleaseDate(summary.wikibase_item);
    return inferFromWikiExtract(summary, wdDate, hint, wikitext);
  } catch {
    return null;
  }
}

async function fetchSteamGames(term: string, limit = 6): Promise<ReleaseItem[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&l=english&cc=US`,
      { headers: WIKI_HEADERS, signal: controller.signal }
    );
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      items?: Array<{
        id: number;
        name: string;
        metascore?: string;
        platforms?: { windows?: boolean; mac?: boolean; linux?: boolean };
      }>;
    };
    const top = (data.items || []).slice(0, limit);
    const detailed = await Promise.all(
      top.map(async (item, idx) => {
        try {
          const dRes = await fetch(`https://store.steampowered.com/api/appdetails?appids=${item.id}`, {
            headers: WIKI_HEADERS,
          });
          const dJson = (await dRes.json()) as Record<
            string,
            {
              success?: boolean;
              data?: {
                name?: string;
                short_description?: string;
                developers?: string[];
                publishers?: string[];
                genres?: Array<{ description: string }>;
                release_date?: { coming_soon?: boolean; date?: string };
                metacritic?: { score?: number };
                platforms?: { windows?: boolean; mac?: boolean; linux?: boolean };
              };
            }
          >;
          const app = dJson[String(item.id)]?.data;
          if (!app) return null;

          const rawDate = app.release_date?.date || 'TBA';
          const parsedTs = Date.parse(rawDate);
          let iso = 'TBA';
          let year: number | null = null;
          if (!Number.isNaN(parsedTs)) {
            const dt = new Date(parsedTs);
            iso = dt.toISOString().slice(0, 10);
            year = dt.getUTCFullYear();
          } else {
            const ym = rawDate.match(/\b(202[0-9]|2030)\b/);
            if (ym) {
              year = Number(ym[1]);
              iso = `${year}`;
            }
          }

          const platforms = ['PC'];
          if (app.platforms?.mac) platforms.push('macOS');

          const score = app.metacritic?.score
            ? Math.round((app.metacritic.score / 10) * 10) / 10
            : null;

          return sanitizeReleaseItem(
            {
              title: app.name || item.name,
              mediaType: 'game',
              region: 'Global',
              language: 'English',
              releaseDate: iso,
              displayDate: rawDate,
              releaseYear: year,
              status: app.release_date?.coming_soon ? 'Upcoming' : 'Released',
              genres: (app.genres || []).slice(0, 3).map((g) => g.description),
              platforms,
              rating: score,
              popularityScore: 86 - idx * 3,
              creator: app.developers?.[0] || 'Steam Developer',
              castOrStudio: app.publishers || [],
              runtimeOrPlaytime: 'PC / Digital',
              synopsis: app.short_description || 'Listed on Steam.',
              releaseNotes: 'Verified via Steam Store catalog.',
              sources: [
                {
                  title: `Steam — ${app.name || item.name}`,
                  uri: `https://store.steampowered.com/app/${item.id}`,
                },
              ],
            },
            idx,
            [{ title: 'Steam Store', uri: `https://store.steampowered.com/app/${item.id}` }]
          );
        } catch {
          return null;
        }
      })
    );
    return detailed.filter((x): x is ReleaseItem => Boolean(x));
  } catch {
    return [];
  }
}

async function fetchWikiCategoryTitles(category: string, limit = 8): Promise<string[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=categorymembers&cmtitle=${encodeURIComponent(
        category
      )}&cmtype=page&cmsort=timestamp&cmdir=desc&cmlimit=${limit}&format=json&origin=*`,
      { headers: WIKI_HEADERS, signal: controller.signal }
    );
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      query?: { categorymembers?: Array<{ title: string }> };
    };
    return (data.query?.categorymembers || [])
      .map((m) => m.title)
      .filter((t) => !t.startsWith('List of') && !t.startsWith('Category:'));
  } catch {
    return [];
  }
}

async function fetchPublicDiscover(mediaFilter: string, regionFilter: string): Promise<ReleaseItem[]> {
  const [nepali2026, upcomingFilms, upcomingGames2026, upcomingGames2027] = await Promise.all([
    fetchWikiCategoryTitles('Category:2026_Nepalese_films', 4),
    fetchWikiCategoryTitles('Category:Upcoming_films', 2),
    fetchWikiCategoryTitles('Category:Upcoming_video_games_scheduled_for_2026', 2),
    fetchWikiCategoryTitles('Category:Upcoming_video_games_scheduled_for_2027', 2),
  ]);

  type SeedEntry = {
    wikiTitle: string;
    region?: ReleaseItem['region'];
    mediaType?: 'movie' | 'game';
    platforms?: string[];
    rating?: number | null;
    popularity?: number;
  };

  const curatedRecentAndUpcoming: SeedEntry[] = [
    // New & Upcoming Nepali Cinema (2026-2027)
    { wikiTitle: 'Kabaddi_5:_After_the_Final_Match', region: 'Nepali', mediaType: 'movie', platforms: ['QFX Cinemas', 'Theaters'], popularity: 95 },
    ...nepali2026.map((t) => ({ wikiTitle: t, region: 'Nepali' as const, mediaType: 'movie' as const, platforms: ['QFX Cinemas', 'Theaters'], popularity: 90 })),

    // New & Upcoming Global / Hollywood / Bollywood / Asian Cinema (2026-2027)
    { wikiTitle: 'Avengers:_Doomsday', region: 'Hollywood', mediaType: 'movie', platforms: ['Theaters', 'IMAX'], rating: null, popularity: 98 },
    { wikiTitle: 'Dune:_Part_Three', region: 'Hollywood', mediaType: 'movie', platforms: ['Theaters', 'IMAX'], rating: null, popularity: 96 },
    { wikiTitle: 'Spider-Man:_Brand_New_Day', region: 'Hollywood', mediaType: 'movie', platforms: ['Theaters', 'IMAX'], rating: null, popularity: 95 },
    { wikiTitle: 'The_Odyssey_(2026_film)', region: 'Hollywood', mediaType: 'movie', platforms: ['Theaters', 'IMAX'], rating: null, popularity: 94 },
    { wikiTitle: 'Supergirl_(2026_film)', region: 'Hollywood', mediaType: 'movie', platforms: ['Theaters', 'IMAX'], rating: null, popularity: 90 },
    { wikiTitle: 'Toy_Story_5', region: 'Hollywood', mediaType: 'movie', platforms: ['Theaters'], rating: null, popularity: 91 },
    { wikiTitle: 'Moana_(2026_film)', region: 'Hollywood', mediaType: 'movie', platforms: ['Theaters'], rating: null, popularity: 89 },
    { wikiTitle: 'The_Batman:_Part_II', region: 'Hollywood', mediaType: 'movie', platforms: ['Theaters', 'IMAX'], rating: null, popularity: 95 },
    { wikiTitle: 'Shrek_5', region: 'Hollywood', mediaType: 'movie', platforms: ['Theaters'], rating: null, popularity: 90 },
    { wikiTitle: 'Ramayana_(2026_film)', region: 'Bollywood', mediaType: 'movie', platforms: ['Theaters', 'IMAX'], rating: null, popularity: 92 },
    { wikiTitle: 'Gatto_(film)', region: 'Hollywood', mediaType: 'movie', platforms: ['Theaters'], rating: null, popularity: 88 },
    ...upcomingFilms.slice(0, 2).map((t) => ({ wikiTitle: t, mediaType: 'movie' as const, popularity: 84 })),

    // New & Upcoming Video Games (2026-2027)
    { wikiTitle: 'Grand_Theft_Auto_VI', region: 'Global', mediaType: 'game', platforms: ['PS5', 'Xbox Series X|S'], rating: null, popularity: 99 },
    { wikiTitle: 'Fable_(2027_video_game)', region: 'Global', mediaType: 'game', platforms: ['Xbox Series X|S', 'PC'], rating: null, popularity: 92 },
    { wikiTitle: 'Resident_Evil_Requiem', region: 'Asian', mediaType: 'game', platforms: ['PS5', 'Xbox Series X|S', 'PC'], rating: null, popularity: 93 },
    { wikiTitle: '007_First_Light', region: 'Global', mediaType: 'game', platforms: ['PS5', 'Xbox Series X|S', 'PC'], rating: null, popularity: 91 },
    { wikiTitle: 'The_Duskbloods', region: 'Asian', mediaType: 'game', platforms: ['Switch 2'], rating: null, popularity: 91 },
    { wikiTitle: 'Alien:_Isolation_2', region: 'Global', mediaType: 'game', platforms: ['PS5', 'Xbox Series X|S', 'PC'], rating: null, popularity: 90 },
    { wikiTitle: 'Football_Manager_27', region: 'Global', mediaType: 'game', platforms: ['PC', 'PS5', 'Xbox Series X|S', 'iOS', 'Android'], rating: null, popularity: 88 },
    { wikiTitle: 'Marvel_1943:_Rise_of_Hydra', region: 'Global', mediaType: 'game', platforms: ['PS5', 'Xbox Series X|S', 'PC'], rating: null, popularity: 89 },
    { wikiTitle: 'Kingdom_Hearts_IV', region: 'Asian', mediaType: 'game', platforms: ['PS5', 'Xbox Series X|S', 'PC'], rating: null, popularity: 91 },
    ...upcomingGames2026.slice(0, 1).map((t) => ({ wikiTitle: t, mediaType: 'game' as const, popularity: 83 })),
    ...upcomingGames2027.slice(0, 2).map((t) => ({ wikiTitle: t, mediaType: 'game' as const, popularity: 85 })),
  ];

  // Deduplicate by normalized title and apply pre-filters
  const seenTitles = new Set<string>();
  const filteredSeeds = curatedRecentAndUpcoming.filter((e) => {
    const norm = e.wikiTitle.toLowerCase().replace(/_/g, ' ');
    if (seenTitles.has(norm)) return false;
    seenTitles.add(norm);
    if (mediaFilter !== 'all' && e.mediaType && e.mediaType !== mediaFilter) return false;
    if (regionFilter !== 'All' && e.region && e.region !== regionFilter) return false;
    return true;
  });

  // Batch Wikipedia/Wikidata fetches in groups of 5 to avoid rate limiting
  const collected: ReleaseItem[] = [];
  for (let i = 0; i < filteredSeeds.length; i += 5) {
    const batch = filteredSeeds.slice(i, i + 5);
    const settled = await Promise.allSettled(
      batch.map((entry) =>
        fetchWikiEntry(entry.wikiTitle, {
          region: entry.region,
          mediaType: entry.mediaType,
          platforms: entry.platforms,
          rating: entry.rating,
          popularity: entry.popularity,
        })
      )
    );
    for (const res of settled) {
      if (res.status === 'fulfilled' && res.value) {
        if (res.value.releaseYear === null || res.value.releaseYear >= 2025) {
          collected.push(res.value);
        }
      }
    }
  }

  return collected.slice(0, 28);
}

async function fetchPublicSearch(params: {
  query: string;
  mediaType: string;
  genre: string;
  releaseYear: string;
  platform: string;
  region: string;
}): Promise<ReleaseItem[]> {
  const parts: string[] = [];
  if (params.query) parts.push(params.query);
  if (params.region && params.region !== 'All') {
    parts.push(params.region === 'Nepali' ? 'Nepalese' : params.region);
  }
  if (params.genre && params.genre !== 'All') parts.push(params.genre);
  if (params.releaseYear && params.releaseYear !== 'All') parts.push(params.releaseYear.replace('+', ''));
  if (params.platform && params.platform !== 'All') parts.push(params.platform);
  if (params.mediaType === 'movie') parts.push('film');
  else if (params.mediaType === 'game') parts.push('video game');

  const searchTerm = parts.join(' ').trim() || 'upcoming film video game 2026';

  const wikiSearchPromise = (async () => {
    try {
      const res = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
          searchTerm
        )}&srlimit=10&format=json&origin=*`,
        { headers: WIKI_HEADERS }
      );
      if (!res.ok) return [];
      const data = (await res.json()) as {
        query?: { search?: Array<{ title: string }> };
      };
      const titles = (data.query?.search || []).map((s) => s.title).slice(0, 8);
      const hydrated = await Promise.all(
        titles.map((t) =>
          fetchWikiEntry(t, {
            mediaType: params.mediaType === 'game' ? 'game' : params.mediaType === 'movie' ? 'movie' : undefined,
          })
        )
      );
      return hydrated.filter((item): item is ReleaseItem => Boolean(item));
    } catch {
      return [];
    }
  })();

  const steamPromise =
    params.mediaType === 'movie'
      ? Promise.resolve([])
      : fetchSteamGames(params.query || `${params.genre !== 'All' ? params.genre : ''} ${params.releaseYear !== 'All' ? params.releaseYear : ''}`.trim() || 'upcoming', 5);

  const [wikiItems, steamItems] = await Promise.all([wikiSearchPromise, steamPromise]);

  const dedup = new Map<string, ReleaseItem>();
  for (const item of [...wikiItems, ...steamItems]) {
    const key = item.title.toLowerCase();
    if (!dedup.has(key)) {
      dedup.set(key, item);
    }
  }
  return Array.from(dedup.values());
}

// ============================================================================
// Gemini Query Functions with Model Fallback & Quota Detection
// ============================================================================

async function generateWithGeminiFallback(prompt: string): Promise<{
  text: string;
  sources: GroundSource[];
}> {
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });
    return {
      text: response.text ?? '',
      sources: extractGroundingSources(response),
    };
  } catch (primaryErr) {
    if (!isQuotaOrRateLimitError(primaryErr)) {
      throw primaryErr;
    }

    // Brief backoff and fallback to lighter high-throughput model with grounding
    await new Promise((r) => setTimeout(r, 400));
    const fallbackRes = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      },
    });
    return {
      text: fallbackRes.text ?? '',
      sources: extractGroundingSources(fallbackRes),
    };
  }
}

async function runDiscover(mediaFilter: string, regionFilter: string): Promise<CacheEntry<ReleaseItem[]>> {
  const today = getTodayIso();
  const focusClause =
    regionFilter === 'Nepali'
      ? 'Focus heavily on NEW 2026 and UPCOMING 2026/2027 Nepali movies (e.g., Kabaddi 5: After the Final Match, Aa Bata Aama, Ek Mutthi Badal, Pension Patta, and upcoming late-2026/2027 Nepali releases with Bikram Sambat & Gregorian dates) plus current games.'
      : 'Include a fresh 2026-2027 global slate: at least 5 NEW/UPCOMING 2026-2027 Nepali movies, 6 NEW/UPCOMING late-2026 & 2027 Hollywood/English movies, 3 Bollywood/Asian 2026-2027 movies, and 7 NEW/UPCOMING late-2026 & 2027 video games across PS5, Xbox Series X|S, PC, Switch 2, iOS, and Android.';

  const mediaClause =
    mediaFilter === 'movie'
      ? 'Return ONLY movies (no games).'
      : mediaFilter === 'game'
        ? 'Return ONLY video games (no movies).'
        : 'Return both movies and video games.';

  const prompt = `Today's date is ${today}. Use Google Search to gather ONLY NEW and UPCOMING real movies and video games releasing in late 2025, 2026, or 2027. DO NOT include older movies or games released before 2025, and DO NOT invent fictional titles.
${focusClause}
${mediaClause}

Return ONLY a valid JSON array of 16 to 22 items. Each object MUST strictly match these keys:
{
  "title": string,
  "originalTitle": string (optional),
  "mediaType": "movie" | "game",
  "region": "Nepali" | "Hollywood" | "Bollywood" | "Asian" | "European" | "Global",
  "language": string,
  "releaseDate": string (ISO "YYYY-MM-DD" if exact date is known, "YYYY-MM" if month known, "YYYY" if year known, or "TBA"),
  "displayDate": string,
  "releaseYear": number | null,
  "status": "Upcoming" | "Released" | "TBA",
  "genres": string[],
  "platforms": string[],
  "rating": number | null,
  "popularityScore": number (1 to 100),
  "creator": string,
  "castOrStudio": string[],
  "runtimeOrPlaytime": string,
  "synopsis": string (1-2 sentences),
  "releaseNotes": string
}
Output pure JSON array.`;

  try {
    const { text, sources } = await generateWithGeminiFallback(prompt);
    const parsed = JSON.parse(extractJsonText(text || '[]')) as Partial<ReleaseItem>[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('Empty Gemini discover response');
    }
    const sanitized = parsed
      .map((item, idx) => sanitizeReleaseItem(item, idx, sources))
      .filter((item) => item.releaseYear === null || item.releaseYear >= 2025);

    if (sanitized.length === 0) {
      throw new Error('No recent 2025-2027 items returned');
    }

    return {
      data: sanitized,
      source: 'gemini',
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
  } catch (err) {
    const quotaHit = isQuotaOrRateLimitError(err);
    const items = await fetchPublicDiscover(mediaFilter, regionFilter);
    return {
      data: items,
      source: 'public_live',
      notice: quotaHit
        ? 'Showing live 2026–2027 release data from Wikipedia, Wikidata, and Steam because your Gemini API key quota is exhausted (you can update or upgrade your key in Settings > Secrets).'
        : undefined,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
  }
}

async function runSearch(params: {
  query: string;
  mediaType: string;
  genre: string;
  releaseYear: string;
  platform: string;
  region: string;
}): Promise<CacheEntry<ReleaseItem[]>> {
  const today = getTodayIso();
  const criteria: string[] = [];
  if (params.query) criteria.push(`Title / Keyword: "${params.query}"`);
  if (params.mediaType && params.mediaType !== 'all') {
    criteria.push(`Media Type: ${params.mediaType === 'game' ? 'Video Games only' : 'Movies only'}`);
  }
  if (params.region && params.region !== 'All') criteria.push(`Region / Cinema Industry: ${params.region}`);
  if (params.genre && params.genre !== 'All') criteria.push(`Genre: ${params.genre}`);
  if (params.releaseYear && params.releaseYear !== 'All') criteria.push(`Release Year: ${params.releaseYear}`);
  if (params.platform && params.platform !== 'All') criteria.push(`Platform: ${params.platform}`);

  const prompt = `Today's date is ${today}. Find real, verified movies and/or video games matching the user's exact search and filter criteria:
${criteria.join('\n')}

Return ONLY a valid JSON array of 4 to 12 real results where each item has:
{
  "title": string,
  "originalTitle": string (optional),
  "mediaType": "movie" | "game",
  "region": "Nepali" | "Hollywood" | "Bollywood" | "Asian" | "European" | "Global",
  "language": string,
  "releaseDate": string (ISO "YYYY-MM-DD", "YYYY-MM", "YYYY", or "TBA"),
  "displayDate": string,
  "releaseYear": number | null,
  "status": "Upcoming" | "Released" | "TBA",
  "genres": string[],
  "platforms": string[],
  "rating": number | null,
  "popularityScore": number (1-100),
  "creator": string,
  "castOrStudio": string[],
  "runtimeOrPlaytime": string,
  "synopsis": string,
  "releaseNotes": string
}
Output pure JSON array only.`;

  try {
    const { text, sources } = await generateWithGeminiFallback(prompt);
    const parsed = JSON.parse(extractJsonText(text || '[]')) as Partial<ReleaseItem>[];
    if (!Array.isArray(parsed)) {
      throw new Error('Invalid search JSON');
    }
    return {
      data: parsed.map((item, idx) => sanitizeReleaseItem(item, idx, sources)),
      source: 'gemini',
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
  } catch (err) {
    const quotaHit = isQuotaOrRateLimitError(err);
    const items = await fetchPublicSearch(params);
    return {
      data: items,
      source: 'public_live',
      notice: quotaHit
        ? 'Showing live search results from Wikipedia, Wikidata, and Steam because your Gemini API key quota is exhausted.'
        : undefined,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
  }
}

async function runDetails(params: {
  title: string;
  mediaType: string;
  region?: string;
  releaseYear?: number | null;
}): Promise<CacheEntry<ReleaseDetails>> {
  const today = getTodayIso();
  const prompt = `Today's date is ${today}. Retrieve verified, comprehensive release information for:
Title: "${params.title}"
Type: ${params.mediaType}
${params.region ? `Region: ${params.region}` : ''}
${params.releaseYear ? `Year: ${params.releaseYear}` : ''}

Return ONLY a valid JSON object matching:
{
  "title": string,
  "originalTitle": string (optional),
  "mediaType": "movie" | "game",
  "region": "Nepali" | "Hollywood" | "Bollywood" | "Asian" | "European" | "Global",
  "language": string,
  "releaseDate": string,
  "displayDate": string,
  "releaseYear": number | null,
  "status": "Upcoming" | "Released" | "TBA",
  "genres": string[],
  "platforms": string[],
  "rating": number | null,
  "popularityScore": number,
  "creator": string,
  "castOrStudio": string[],
  "runtimeOrPlaytime": string,
  "synopsis": string,
  "releaseNotes": string,
  "extendedOverview": string,
  "regionalDates": [{ "territory": string, "date": string, "format": string }],
  "whereToAccess": string[],
  "ageRating": string,
  "receptionSummary": string,
  "trailerQuery": string
}
Output pure JSON object only.`;

  try {
    const { text, sources } = await generateWithGeminiFallback(prompt);
    const parsed = JSON.parse(extractJsonText(text || '{}')) as Partial<ReleaseDetails>;
    const base = sanitizeReleaseItem(parsed, 0, sources);
    return {
      data: {
        ...base,
        extendedOverview: parsed.extendedOverview || base.synopsis,
        regionalDates: Array.isArray(parsed.regionalDates) ? parsed.regionalDates.slice(0, 5) : [],
        whereToAccess: Array.isArray(parsed.whereToAccess) ? parsed.whereToAccess.slice(0, 6) : base.platforms,
        ageRating: parsed.ageRating || 'Unrated',
        receptionSummary: parsed.receptionSummary || 'Tracking live global release updates.',
        trailerQuery: parsed.trailerQuery || `${base.title} official trailer`,
      },
      source: 'gemini',
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
  } catch {
    // Public fallback via Wikipedia REST + Wikidata
    const wikiMatches = await fetchPublicSearch({
      query: params.title,
      mediaType: params.mediaType,
      genre: 'All',
      releaseYear: params.releaseYear ? String(params.releaseYear) : 'All',
      platform: 'All',
      region: params.region || 'All',
    });
    const best = wikiMatches[0] || sanitizeReleaseItem({
      title: params.title,
      mediaType: params.mediaType === 'game' ? 'game' : 'movie',
      region: (params.region as ReleaseItem['region']) || 'Global',
      releaseYear: params.releaseYear ?? null,
    }, 0, []);

    return {
      data: {
        ...best,
        extendedOverview: best.synopsis,
        regionalDates: [
          {
            territory: best.region === 'Nepali' ? 'Nepal' : 'Worldwide',
            date: best.displayDate,
            format: best.platforms[0] || (best.mediaType === 'game' ? 'Digital' : 'Theaters'),
          },
        ],
        whereToAccess: best.platforms,
        ageRating: 'Unrated',
        receptionSummary: best.rating
          ? `Rated ${best.rating.toFixed(1)}/10 across tracked sources.`
          : 'Tracking upcoming release schedule.',
        trailerQuery: `${best.title} ${best.releaseYear ?? ''} official trailer`,
      },
      source: 'public_live',
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
  }
}

// ============================================================================
// Live News Wire Engine (Google News RSS across Nepali, Global Movies & Games)
// ============================================================================

function decodeXmlEntities(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .trim();
}

function extractXmlTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = block.match(re);
  return match ? decodeXmlEntities(match[1]) : '';
}

async function fetchRssNews(
  rssUrl: string,
  category: NewsArticle['category'],
  limit: number
): Promise<NewsArticle[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'CueReleaseRadar/1.0 (https://cue.app)',
        Accept: 'application/rss+xml, application/xml, text/xml',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return [];

    const xml = await res.text();
    const itemMatches = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];
    const articles: NewsArticle[] = [];

    for (let i = 0; i < itemMatches.length && articles.length < limit; i++) {
      const block = itemMatches[i];
      let title = extractXmlTag(block, 'title');
      const link = extractXmlTag(block, 'link');
      const pubDate = extractXmlTag(block, 'pubDate');
      const source = extractXmlTag(block, 'source') || 'Entertainment Wire';

      if (!title || !link) continue;

      // Google News titles often end with " - Source Name"
      const suffix = ` - ${source}`;
      if (title.endsWith(suffix)) {
        title = title.slice(0, -suffix.length).trim();
      }

      const parsedTs = Date.parse(pubDate);
      const publishedAt = Number.isNaN(parsedTs)
        ? new Date().toISOString()
        : new Date(parsedTs).toISOString();

      const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 48);

      articles.push({
        id: `${category.toLowerCase()}-${slug || i}-${publishedAt.slice(0, 10)}`,
        title,
        link,
        source,
        publishedAt,
        category,
      });
    }

    return articles;
  } catch {
    return [];
  }
}

async function runNews(params: {
  topic: string;
  query?: string;
}): Promise<CacheEntry<NewsArticle[]> & { updatedAt: string }> {
  const cleanQuery = (params.query || '').trim();
  const nowIso = new Date().toISOString();

  if (cleanQuery) {
    const qUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(
      `${cleanQuery} release OR trailer OR update`
    )}&hl=en-US&gl=US&ceid=US:en`;
    const category: NewsArticle['category'] =
      params.topic === 'games' ? 'Games' : params.topic === 'nepali' ? 'Nepali' : 'Movies';
    const items = await fetchRssNews(qUrl, category, 6);
    items.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
    return {
      data: items,
      source: 'public_live',
      updatedAt: nowIso,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
  }

  const nepaliUrl =
    'https://news.google.com/rss/search?q=Nepali+movie+release+date+OR+Nepali+cinema&hl=en-US&gl=NP&ceid=NP:en';
  const moviesUrl =
    'https://news.google.com/rss/search?q=upcoming+movie+release+date+OR+trailer+2026+2027&hl=en-US&gl=US&ceid=US:en';
  const gamesUrl =
    'https://news.google.com/rss/search?q=video+game+release+date+news+OR+announcement+2026+2027&hl=en-US&gl=US&ceid=US:en';

  let combined: NewsArticle[] = [];
  if (params.topic === 'nepali') {
    combined = await fetchRssNews(nepaliUrl, 'Nepali', 10);
  } else if (params.topic === 'movies') {
    combined = await fetchRssNews(moviesUrl, 'Movies', 10);
  } else if (params.topic === 'games') {
    combined = await fetchRssNews(gamesUrl, 'Games', 10);
  } else {
    const [nepali, movies, games] = await Promise.all([
      fetchRssNews(nepaliUrl, 'Nepali', 5),
      fetchRssNews(moviesUrl, 'Movies', 6),
      fetchRssNews(gamesUrl, 'Games', 6),
    ]);
    combined = [...nepali, ...movies, ...games];
  }

  const seen = new Set<string>();
  const deduped = combined.filter((article) => {
    const key = article.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  deduped.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));

  return {
    data: deduped.slice(0, 15),
    source: 'public_live',
    updatedAt: nowIso,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, hasApiKey: Boolean(process.env.GEMINI_API_KEY) });
  });

  app.get('/api/discover', async (req: Request, res: Response) => {
    const mediaType = String(req.query.mediaType || 'all');
    const region = String(req.query.region || 'All');
    const refresh = req.query.refresh === 'true';
    const cacheKey = `${mediaType}:${region}`;

    const cached = discoverCache.get(cacheKey);
    if (!refresh && cached && cached.expiresAt > Date.now()) {
      res.json({
        items: cached.data,
        source: cached.source,
        notice: cached.notice,
        cached: true,
      });
      return;
    }

    try {
      let pending = inFlightDiscover.get(cacheKey);
      if (!pending || refresh) {
        pending = runDiscover(mediaType, region);
        inFlightDiscover.set(cacheKey, pending);
      }
      const result = await pending;
      inFlightDiscover.delete(cacheKey);
      discoverCache.set(cacheKey, result);
      res.json({
        items: result.data,
        source: result.source,
        notice: result.notice,
        cached: false,
      });
    } catch (err) {
      inFlightDiscover.delete(cacheKey);
      console.error('Discover API error:', err);
      const message = err instanceof Error ? err.message : 'Failed to load releases';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/search', async (req: Request, res: Response) => {
    const body = (req.body || {}) as {
      query?: string;
      mediaType?: string;
      genre?: string;
      releaseYear?: string;
      platform?: string;
      region?: string;
    };

    const params = {
      query: (body.query || '').trim(),
      mediaType: body.mediaType || 'all',
      genre: body.genre || 'All',
      releaseYear: body.releaseYear || 'All',
      platform: body.platform || 'All',
      region: body.region || 'All',
    };

    if (
      !params.query &&
      params.genre === 'All' &&
      params.releaseYear === 'All' &&
      params.platform === 'All' &&
      params.region === 'All'
    ) {
      res.status(400).json({ error: 'Provide at least a search term or filter.' });
      return;
    }

    const cacheKey = JSON.stringify(params);
    const cached = searchCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.json({
        items: cached.data,
        source: cached.source,
        notice: cached.notice,
        cached: true,
      });
      return;
    }

    try {
      let pending = inFlightSearch.get(cacheKey);
      if (!pending) {
        pending = runSearch(params);
        inFlightSearch.set(cacheKey, pending);
      }
      const result = await pending;
      inFlightSearch.delete(cacheKey);
      searchCache.set(cacheKey, result);
      res.json({
        items: result.data,
        source: result.source,
        notice: result.notice,
        cached: false,
      });
    } catch (err) {
      inFlightSearch.delete(cacheKey);
      console.error('Search API error:', err);
      const message = err instanceof Error ? err.message : 'Search failed';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/details', async (req: Request, res: Response) => {
    const body = (req.body || {}) as {
      title?: string;
      mediaType?: string;
      region?: string;
      releaseYear?: number | null;
    };

    if (!body.title) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }

    const cacheKey = `${body.mediaType || 'movie'}:${body.title}:${body.releaseYear ?? ''}`;
    const cached = detailCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.json({ details: cached.data, source: cached.source, cached: true });
      return;
    }

    try {
      let pending = inFlightDetails.get(cacheKey);
      if (!pending) {
        pending = runDetails({
          title: body.title,
          mediaType: body.mediaType || 'movie',
          region: body.region,
          releaseYear: body.releaseYear,
        });
        inFlightDetails.set(cacheKey, pending);
      }
      const result = await pending;
      inFlightDetails.delete(cacheKey);
      detailCache.set(cacheKey, result);
      res.json({ details: result.data, source: result.source, cached: false });
    } catch (err) {
      inFlightDetails.delete(cacheKey);
      console.error('Details API error:', err);
      const message = err instanceof Error ? err.message : 'Failed to fetch release details';
      res.status(500).json({ error: message });
    }
  });

  app.get('/api/news', async (req: Request, res: Response) => {
    const topic = String(req.query.topic || 'all').toLowerCase();
    const query = String(req.query.q || '').trim();
    const refresh = req.query.refresh === 'true';
    const cacheKey = `${topic}:${query.toLowerCase()}`;

    const cached = newsCache.get(cacheKey);
    if (!refresh && cached && cached.expiresAt > Date.now()) {
      res.json({
        articles: cached.data,
        updatedAt: cached.updatedAt,
        cached: true,
      });
      return;
    }

    try {
      let pending = inFlightNews.get(cacheKey);
      if (!pending || refresh) {
        pending = runNews({ topic, query });
        inFlightNews.set(cacheKey, pending);
      }
      const result = await pending;
      inFlightNews.delete(cacheKey);
      newsCache.set(cacheKey, result);
      res.json({
        articles: result.data,
        updatedAt: result.updatedAt,
        cached: false,
      });
    } catch (err) {
      inFlightNews.delete(cacheKey);
      console.error('News API error:', err);
      const message = err instanceof Error ? err.message : 'Failed to load news';
      res.status(500).json({ error: message });
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Cue server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
