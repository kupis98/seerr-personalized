import type { MovieResult, TvResult } from '@server/models/Search';

export function mediaResultToTitleCardProps(title: MovieResult | TvResult) {
  return title.mediaType === 'movie'
    ? {
        id: title.id,
        isAddedToWatchlist: title.mediaInfo?.watchlists?.length ?? 0,
        image: title.posterPath,
        status: title.mediaInfo?.status,
        summary: title.overview,
        title: title.title,
        userScore: title.voteAverage,
        year: title.releaseDate,
        mediaType: title.mediaType,
        inProgress: (title.mediaInfo?.downloadStatus ?? []).length > 0,
      }
    : {
        id: title.id,
        isAddedToWatchlist: title.mediaInfo?.watchlists?.length ?? 0,
        image: title.posterPath,
        status: title.mediaInfo?.status,
        summary: title.overview,
        title: title.name,
        userScore: title.voteAverage,
        year: title.firstAirDate,
        mediaType: title.mediaType,
        inProgress: (title.mediaInfo?.downloadStatus ?? []).length > 0,
      };
}
