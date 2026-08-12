import PlexAPI from '@server/api/plexapi';
import type {
  TmdbMovieResult,
  TmdbSearchMovieResponse,
  TmdbSearchTvResponse,
  TmdbTvResult,
} from '@server/api/themoviedb/interfaces';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import { Swipe } from '@server/entity/Swipe';
import { User } from '@server/entity/User';
import logger from '@server/logger';
import type { MovieResult, TvResult } from '@server/models/Search';
import { mapMovieResult, mapTvResult } from '@server/models/Search';
import { createTmdbWithRegionLanguage } from '@server/routes/discover';
import NodeCache from 'node-cache';

const POOL_CACHE_TTL_SECONDS = 60 * 15;
const SEED_COUNT = 25;
const HISTORY_SIZE = 300;
const CANDIDATE_PAGES_PER_ENDPOINT = 2;
const SHELF_COUNT = 6;
const ITEMS_PER_SHELF = 20;
const MIN_SHELF_ITEMS = 4;

interface SeedTitle {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
}

interface CandidateItem {
  tmdbId: number;
  mediaType: MediaType;
  raw: TmdbMovieResult | TmdbTvResult;
  score: number;
}

interface CandidatesBySeed {
  flattened: CandidateItem[];
  bySeed: Map<string, { seed: SeedTitle; items: CandidateItem[] }>;
}

export interface BecauseYouWatchedShelf {
  seedTmdbId: number;
  seedMediaType: MediaType;
  seedTitle: string;
  results: MixedResult[];
}

type MixedResult = MovieResult | TvResult;

function seedKey(seed: { tmdbId: number; mediaType: MediaType }): string {
  return `${seed.mediaType}:${seed.tmdbId}`;
}

function shuffleWithinScoreBands(items: CandidateItem[]): CandidateItem[] {
  const bands = new Map<number, CandidateItem[]>();

  for (const item of items) {
    const band = bands.get(item.score) ?? [];
    band.push(item);
    bands.set(item.score, band);
  }

  const sortedScores = Array.from(bands.keys()).sort((a, b) => b - a);
  const result: CandidateItem[] = [];

  for (const score of sortedScores) {
    const band = bands.get(score) as CandidateItem[];
    for (let i = band.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [band[i], band[j]] = [band[j], band[i]];
    }
    result.push(...band);
  }

  return result;
}

class RecommendationEngine {
  private poolCache = new NodeCache({
    stdTTL: POOL_CACHE_TTL_SECONDS,
    checkperiod: 120,
  });

  private shelfCache = new NodeCache({
    stdTTL: POOL_CACHE_TTL_SECONDS,
    checkperiod: 120,
  });

  public async getSliderPage(
    user: User,
    page: number,
    pageSize = 20
  ): Promise<{
    page: number;
    totalPages: number;
    totalResults: number;
    results: MixedResult[];
  }> {
    const pool = await this.getCandidatePool(user);
    const start = (page - 1) * pageSize;
    const pageItems = pool.slice(start, start + pageSize);

    return {
      page,
      totalPages: Math.max(1, Math.ceil(pool.length / pageSize)),
      totalResults: pool.length,
      results: pageItems.map((c) => this.toResult(c)),
    };
  }

  public async getSwipeBatch(
    user: User,
    { excludeIds = [], count = 20 }: { excludeIds?: number[]; count?: number }
  ): Promise<MixedResult[]> {
    let pool = await this.getCandidatePool(user);
    let available = pool.filter((c) => !excludeIds.includes(c.tmdbId));

    if (available.length < count) {
      pool = await this.getCandidatePool(user, { forceRefresh: true });
      available = pool.filter((c) => !excludeIds.includes(c.tmdbId));
    }

    return available.slice(0, count).map((c) => this.toResult(c));
  }

  public async getBecauseYouWatchedShelves(
    user: User,
    {
      shelfCount = SHELF_COUNT,
      itemsPerShelf = ITEMS_PER_SHELF,
    }: { shelfCount?: number; itemsPerShelf?: number } = {}
  ): Promise<BecauseYouWatchedShelf[]> {
    const cacheKey = `shelves:${user.id}`;
    const cached = this.shelfCache.get<BecauseYouWatchedShelf[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const seeds = await this.getSeedTitles(user);
    if (seeds.length === 0) {
      this.shelfCache.set(cacheKey, []);
      return [];
    }

    const { bySeed } = await this.fetchTmdbCandidates(user, seeds);
    const seedKeys = new Set(seeds.map(seedKey));

    const allCandidates = Array.from(bySeed.values())
      .flatMap((group) => group.items)
      .filter((c) => !seedKeys.has(seedKey(c)));
    const exclusionKeys = await this.getExclusionKeys(user, allCandidates);

    const shelves: BecauseYouWatchedShelf[] = [];

    for (const seed of seeds) {
      if (shelves.length >= shelfCount) {
        break;
      }

      const group = bySeed.get(seedKey(seed));
      if (!group) {
        continue;
      }

      const filtered = group.items.filter(
        (c) => !seedKeys.has(seedKey(c)) && !exclusionKeys.has(seedKey(c))
      );

      if (filtered.length < MIN_SHELF_ITEMS) {
        continue;
      }

      shelves.push({
        seedTmdbId: seed.tmdbId,
        seedMediaType: seed.mediaType,
        seedTitle: seed.title,
        results: filtered.slice(0, itemsPerShelf).map((c) => this.toResult(c)),
      });
    }

    this.shelfCache.set(cacheKey, shelves);
    return shelves;
  }

  private toResult(candidate: CandidateItem): MixedResult {
    return candidate.mediaType === MediaType.MOVIE
      ? mapMovieResult(candidate.raw as TmdbMovieResult)
      : mapTvResult(candidate.raw as TmdbTvResult);
  }

  private async getCandidatePool(
    user: User,
    { forceRefresh = false }: { forceRefresh?: boolean } = {}
  ): Promise<CandidateItem[]> {
    const cacheKey = `pool:${user.id}`;

    if (!forceRefresh) {
      const cached = this.poolCache.get<CandidateItem[]>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const seeds = await this.getSeedTitles(user);

    if (seeds.length === 0) {
      this.poolCache.set(cacheKey, []);
      return [];
    }

    const { flattened } = await this.fetchTmdbCandidates(user, seeds);
    const filtered = await this.applyExclusions(user, flattened, seeds);

    this.poolCache.set(cacheKey, filtered);
    return filtered;
  }

  private async getSeedTitles(user: User): Promise<SeedTitle[]> {
    if (!user.plexId) {
      return [];
    }

    const userRepository = getRepository(User);
    const admin = await userRepository.findOne({
      select: { id: true, plexToken: true },
      where: { id: 1 },
    });

    if (!admin?.plexToken) {
      return [];
    }

    const plexApi = new PlexAPI({ plexToken: admin.plexToken });

    // Plex's local history API tags the server owner's own history with the
    // local sentinel accountID 1, not their real plex.tv global id (which is
    // what User.plexId stores) — only shared/managed users get their real
    // global id in the accountID field. Seerr's own convention is that the
    // first-created user (id 1) is always the Plex server owner, so detect
    // that case and use the sentinel instead of user.plexId.
    const accountId = user.id === admin.id ? 1 : user.plexId;

    let history;
    try {
      history = await plexApi.getWatchHistory({
        accountId,
        size: HISTORY_SIZE,
      });
    } catch (e) {
      logger.warn('Failed to fetch Plex watch history for recommendations', {
        label: 'Recommendation Engine',
        userId: user.id,
        errorMessage: e.message,
      });
      return [];
    }

    const relevant = history.filter(
      (item) => item.type === 'movie' || item.type === 'episode'
    );

    const seenKeys = new Set<string>();
    const uniqueRatingKeys: { key: string; isShow: boolean }[] = [];

    for (const item of relevant) {
      const key =
        item.type === 'episode' ? item.grandparentRatingKey : item.ratingKey;

      if (!key || seenKeys.has(key)) {
        continue;
      }
      seenKeys.add(key);
      uniqueRatingKeys.push({ key, isShow: item.type === 'episode' });

      if (uniqueRatingKeys.length >= SEED_COUNT) {
        break;
      }
    }

    const seeds: SeedTitle[] = [];

    for (const { key } of uniqueRatingKeys) {
      try {
        const metadata = await plexApi.getMetadata(key);
        const tmdbGuid = metadata.Guid?.find((g) => g.id.startsWith('tmdb'));

        if (tmdbGuid) {
          seeds.push({
            tmdbId: Number(tmdbGuid.id.split('//')[1]),
            mediaType:
              metadata.type === 'show' ? MediaType.TV : MediaType.MOVIE,
            title: metadata.title,
          });
        }
      } catch (e) {
        logger.debug(
          'Failed to resolve Plex metadata for recommendation seed',
          {
            label: 'Recommendation Engine',
            ratingKey: key,
            errorMessage: e.message,
          }
        );
      }
    }

    return seeds;
  }

  private async fetchTmdbCandidates(
    user: User,
    seeds: SeedTitle[]
  ): Promise<CandidatesBySeed> {
    const tmdb = createTmdbWithRegionLanguage(user);
    const scoreByKey = new Map<string, CandidateItem>();
    const bySeed = new Map<
      string,
      { seed: SeedTitle; items: CandidateItem[] }
    >();

    const pages = Array.from(
      { length: CANDIDATE_PAGES_PER_ENDPOINT },
      (_, i) => i + 1
    );

    const tasks: {
      seed: SeedTitle;
      promise: Promise<TmdbSearchMovieResponse | TmdbSearchTvResponse>;
    }[] = seeds.flatMap((seed) => {
      const promises =
        seed.mediaType === MediaType.MOVIE
          ? pages.flatMap((page) => [
              tmdb.getMovieRecommendations({ movieId: seed.tmdbId, page }),
              tmdb.getMovieSimilar({ movieId: seed.tmdbId, page }),
            ])
          : pages.flatMap((page) => [
              tmdb.getTvRecommendations({ tvId: seed.tmdbId, page }),
              tmdb.getTvSimilar({ tvId: seed.tmdbId, page }),
            ]);

      return promises.map((promise) => ({ seed, promise }));
    });

    const results = await Promise.allSettled(tasks.map((t) => t.promise));
    const seedKeys = new Set(seeds.map(seedKey));

    results.forEach((result, index) => {
      if (result.status !== 'fulfilled') {
        logger.debug('TMDB candidate fetch failed for a seed title', {
          label: 'Recommendation Engine',
          userId: user.id,
          errorMessage: result.reason?.message,
        });
        return;
      }

      const seed = tasks[index].seed;
      const seedGroupKey = seedKey(seed);
      let group = bySeed.get(seedGroupKey);
      if (!group) {
        group = { seed, items: [] };
        bySeed.set(seedGroupKey, group);
      }

      for (const raw of result.value.results) {
        const key = `${seed.mediaType}:${raw.id}`;

        if (seedKeys.has(key)) {
          continue;
        }

        const existing = scoreByKey.get(key);
        if (existing) {
          existing.score += 1;
        } else {
          scoreByKey.set(key, {
            tmdbId: raw.id,
            mediaType: seed.mediaType,
            raw,
            score: 1,
          });
        }

        if (!group.items.some((i) => i.tmdbId === raw.id)) {
          group.items.push({
            tmdbId: raw.id,
            mediaType: seed.mediaType,
            raw,
            score: 1,
          });
        }
      }
    });

    return {
      flattened: shuffleWithinScoreBands(Array.from(scoreByKey.values())),
      bySeed,
    };
  }

  private async getExclusionKeys(
    user: User,
    candidates: CandidateItem[]
  ): Promise<Set<string>> {
    const exclusionKeys = new Set<string>();

    if (candidates.length === 0) {
      return exclusionKeys;
    }

    const media = await Media.getRelatedMedia(
      user,
      candidates.map((c) => ({ tmdbId: c.tmdbId, mediaType: c.mediaType }))
    );

    const unavailableStatuses = new Set([
      MediaStatus.AVAILABLE,
      MediaStatus.PARTIALLY_AVAILABLE,
      MediaStatus.PROCESSING,
      MediaStatus.PENDING,
      MediaStatus.BLOCKLISTED,
    ]);

    media
      .filter((m) => unavailableStatuses.has(m.status))
      .forEach((m) => exclusionKeys.add(`${m.mediaType}:${m.tmdbId}`));

    const tmdbIds = candidates.map((c) => c.tmdbId);
    const requestRepository = getRepository(MediaRequest);
    const existingRequests =
      tmdbIds.length > 0
        ? await requestRepository
            .createQueryBuilder('request')
            .leftJoinAndSelect('request.media', 'media')
            .where('request.requestedBy = :userId', { userId: user.id })
            .andWhere('media.tmdbId IN (:...tmdbIds)', { tmdbIds })
            .getMany()
        : [];

    existingRequests
      .filter((r) => r.media != null)
      .forEach((r) =>
        exclusionKeys.add(`${r.media.mediaType}:${r.media.tmdbId}`)
      );

    // Excludes both directions: dislikes must never resurface, and likes
    // have already been judged (they live on in the Liked rubric instead).
    const swipedItems = await Swipe.getSwipedTmdbIds(user);
    swipedItems.forEach((s) =>
      exclusionKeys.add(`${s.mediaType}:${s.tmdbId}`)
    );

    return exclusionKeys;
  }

  private async applyExclusions(
    user: User,
    candidates: CandidateItem[],
    seeds: SeedTitle[]
  ): Promise<CandidateItem[]> {
    if (candidates.length === 0) {
      return [];
    }

    const seedKeys = new Set(seeds.map(seedKey));
    const filtered = candidates.filter((c) => !seedKeys.has(seedKey(c)));
    const exclusionKeys = await this.getExclusionKeys(user, filtered);

    return filtered.filter((c) => !exclusionKeys.has(seedKey(c)));
  }
}

const recommendationEngine = new RecommendationEngine();

export default recommendationEngine;
