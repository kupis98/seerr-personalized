import PlexAPI from '@server/api/plexapi';
import type {
  TmdbMovieResult,
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
const SEED_COUNT = 10;
const HISTORY_SIZE = 200;

interface SeedTitle {
  tmdbId: number;
  mediaType: MediaType;
}

interface CandidateItem {
  tmdbId: number;
  mediaType: MediaType;
  raw: TmdbMovieResult | TmdbTvResult;
  score: number;
}

type MixedResult = MovieResult | TvResult;

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
    stdTtl: POOL_CACHE_TTL_SECONDS,
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

    const candidates = await this.fetchTmdbCandidates(user, seeds);
    const filtered = await this.applyExclusions(user, candidates, seeds);

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

    let history;
    try {
      history = await plexApi.getWatchHistory({
        accountId: user.plexId,
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
  ): Promise<CandidateItem[]> {
    const tmdb = createTmdbWithRegionLanguage(user);
    const scoreByKey = new Map<string, CandidateItem>();

    const fetches = seeds.flatMap((seed) =>
      seed.mediaType === MediaType.MOVIE
        ? [
            tmdb.getMovieRecommendations({ movieId: seed.tmdbId }),
            tmdb.getMovieSimilar({ movieId: seed.tmdbId }),
          ]
        : [
            tmdb.getTvRecommendations({ tvId: seed.tmdbId }),
            tmdb.getTvSimilar({ tvId: seed.tmdbId }),
          ]
    );

    const results = await Promise.allSettled(fetches);
    const seedKeys = new Set(seeds.map((s) => `${s.mediaType}:${s.tmdbId}`));

    results.forEach((result, index) => {
      if (result.status !== 'fulfilled') {
        logger.debug('TMDB candidate fetch failed for a seed title', {
          label: 'Recommendation Engine',
          userId: user.id,
          errorMessage: result.reason?.message,
        });
        return;
      }

      const seed = seeds[Math.floor(index / 2)];

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
      }
    });

    return shuffleWithinScoreBands(Array.from(scoreByKey.values()));
  }

  private async applyExclusions(
    user: User,
    candidates: CandidateItem[],
    seeds: SeedTitle[]
  ): Promise<CandidateItem[]> {
    if (candidates.length === 0) {
      return [];
    }

    const seedKeys = new Set(seeds.map((s) => `${s.mediaType}:${s.tmdbId}`));
    let filtered = candidates.filter(
      (c) => !seedKeys.has(`${c.mediaType}:${c.tmdbId}`)
    );

    const media = await Media.getRelatedMedia(
      user,
      filtered.map((c) => ({ tmdbId: c.tmdbId, mediaType: c.mediaType }))
    );

    const unavailableStatuses = new Set([
      MediaStatus.AVAILABLE,
      MediaStatus.PARTIALLY_AVAILABLE,
      MediaStatus.PROCESSING,
      MediaStatus.PENDING,
      MediaStatus.BLOCKLISTED,
    ]);

    filtered = filtered.filter(
      (c) =>
        !media.some(
          (m) =>
            m.tmdbId === c.tmdbId &&
            m.mediaType === c.mediaType &&
            unavailableStatuses.has(m.status)
        )
    );

    const tmdbIds = filtered.map((c) => c.tmdbId);
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

    const requestedKeys = new Set(
      existingRequests
        .filter((r) => r.media != null)
        .map((r) => `${r.media.mediaType}:${r.media.tmdbId}`)
    );

    filtered = filtered.filter(
      (c) => !requestedKeys.has(`${c.mediaType}:${c.tmdbId}`)
    );

    const dislikedItems = await Swipe.getDislikedTmdbIds(user);
    const dislikedKeys = new Set(
      dislikedItems.map((d) => `${d.mediaType}:${d.tmdbId}`)
    );

    filtered = filtered.filter(
      (c) => !dislikedKeys.has(`${c.mediaType}:${c.tmdbId}`)
    );

    return filtered;
  }
}

const recommendationEngine = new RecommendationEngine();

export default recommendationEngine;
