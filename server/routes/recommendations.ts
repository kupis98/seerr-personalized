import type {
  TmdbMovieDetails,
  TmdbMovieResult,
  TmdbTvDetails,
  TmdbTvResult,
} from '@server/api/themoviedb/interfaces';
import { MediaType } from '@server/constants/media';
import { Swipe } from '@server/entity/Swipe';
import recommendationEngine from '@server/lib/recommendationEngine';
import logger from '@server/logger';
import { mapMovieResult, mapTvResult } from '@server/models/Search';
import { createTmdbWithRegionLanguage } from '@server/routes/discover';
import { Router } from 'express';
import { z } from 'zod';

const recommendationsRoutes = Router();

function movieDetailsToResult(details: TmdbMovieDetails): TmdbMovieResult {
  return {
    id: details.id,
    media_type: 'movie',
    adult: details.adult,
    popularity: details.popularity,
    poster_path: details.poster_path,
    backdrop_path: details.backdrop_path,
    vote_count: details.vote_count,
    vote_average: details.vote_average,
    genre_ids: details.genres.map((g) => g.id),
    overview: details.overview ?? '',
    original_language: details.original_language,
    title: details.title,
    original_title: details.original_title,
    release_date: details.release_date,
    video: details.video,
  };
}

function tvDetailsToResult(details: TmdbTvDetails): TmdbTvResult {
  return {
    id: details.id,
    media_type: 'tv',
    popularity: details.popularity,
    poster_path: details.poster_path,
    backdrop_path: details.backdrop_path,
    vote_count: details.vote_count,
    vote_average: details.vote_average,
    genre_ids: details.genres.map((g) => g.id),
    overview: details.overview,
    original_language: details.original_language,
    name: details.name,
    original_name: details.original_name,
    origin_country: details.origin_country,
    first_air_date: details.first_air_date,
  };
}

recommendationsRoutes.get('/because-you-watched', async (req, res, next) => {
  if (!req.user) {
    return next({ status: 401, message: 'You must be logged in.' });
  }

  try {
    const shelves = await recommendationEngine.getBecauseYouWatchedShelves(
      req.user
    );

    return res.status(200).json({ shelves });
  } catch (e) {
    logger.error('Failed to retrieve because-you-watched shelves', {
      label: 'API',
      errorMessage: e.message,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve because-you-watched shelves.',
    });
  }
});

recommendationsRoutes.get('/foryou', async (req, res, next) => {
  if (!req.user) {
    return next({ status: 401, message: 'You must be logged in.' });
  }

  try {
    const page = Number(req.query.page) || 1;
    const data = await recommendationEngine.getSliderPage(req.user, page);

    return res.status(200).json(data);
  } catch (e) {
    logger.error('Failed to retrieve personalized recommendations', {
      label: 'API',
      errorMessage: e.message,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve personalized recommendations.',
    });
  }
});

recommendationsRoutes.get('/liked', async (req, res, next) => {
  if (!req.user) {
    return next({ status: 401, message: 'You must be logged in.' });
  }

  try {
    const page = Number(req.query.page) || 1;
    const pageSize = 20;

    const [likes, totalResults] = await Swipe.getLikes(req.user, {
      offset: (page - 1) * pageSize,
      limit: pageSize,
    });

    const tmdb = createTmdbWithRegionLanguage(req.user);

    const results = await Promise.all(
      likes.map(async (like) => {
        try {
          if (like.mediaType === MediaType.MOVIE) {
            const movie = await tmdb.getMovie({ movieId: like.tmdbId });
            return mapMovieResult(movieDetailsToResult(movie));
          }
          const tv = await tmdb.getTvShow({ tvId: like.tmdbId });
          return mapTvResult(tvDetailsToResult(tv));
        } catch (e) {
          logger.debug('Failed to hydrate a liked title from TMDB', {
            label: 'API',
            tmdbId: like.tmdbId,
            errorMessage: e.message,
          });
          return null;
        }
      })
    );

    return res.status(200).json({
      page,
      totalPages: Math.max(1, Math.ceil(totalResults / pageSize)),
      totalResults,
      results: results.filter((r) => r !== null),
    });
  } catch (e) {
    logger.error('Failed to retrieve liked titles', {
      label: 'API',
      errorMessage: e.message,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve liked titles.',
    });
  }
});

recommendationsRoutes.get('/swipe', async (req, res, next) => {
  if (!req.user) {
    return next({ status: 401, message: 'You must be logged in.' });
  }

  try {
    const excludeIds = z
      .string()
      .optional()
      .parse(req.query.exclude)
      ?.split(',')
      .map(Number)
      .filter((n) => !Number.isNaN(n));

    const results = await recommendationEngine.getSwipeBatch(req.user, {
      excludeIds,
    });

    return res.status(200).json({ results });
  } catch (e) {
    logger.error('Failed to retrieve swipe pool', {
      label: 'API',
      errorMessage: e.message,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve swipe pool.',
    });
  }
});

const SwipeBodySchema = z.object({
  tmdbId: z.number(),
  mediaType: z.nativeEnum(MediaType),
  direction: z.enum(['like', 'dislike']),
});

recommendationsRoutes.post('/swipe', async (req, res, next) => {
  if (!req.user) {
    return next({ status: 401, message: 'You must be logged in.' });
  }

  try {
    const body = SwipeBodySchema.parse(req.body);

    const swipe = await Swipe.recordSwipe({
      user: req.user,
      ...body,
    });

    return res.status(200).json(swipe);
  } catch (e) {
    logger.error('Failed to record swipe', {
      label: 'API',
      errorMessage: e.message,
    });
    return next({
      status: 500,
      message: 'Unable to record swipe.',
    });
  }
});

recommendationsRoutes.post('/reset-dislikes', async (req, res, next) => {
  if (!req.user) {
    return next({ status: 401, message: 'You must be logged in.' });
  }

  try {
    const removed = await Swipe.resetDislikes(req.user);

    return res.status(200).json({ removed });
  } catch (e) {
    logger.error('Failed to reset dislikes', {
      label: 'API',
      errorMessage: e.message,
    });
    return next({
      status: 500,
      message: 'Unable to reset dislikes.',
    });
  }
});

export default recommendationsRoutes;
