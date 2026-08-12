import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import SwipeButtons from '@app/components/Swipe/SwipeButtons';
import SwipeCard from '@app/components/Swipe/SwipeCard';
import useToasts from '@app/hooks/useToasts';
import defineMessages from '@app/utils/defineMessages';
import type { MediaType } from '@server/constants/media';
import type { MovieResult, TvResult } from '@server/models/Search';
import axios from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';

const RELOAD_THRESHOLD = 5;

const messages = defineMessages('components.Swipe', {
  swipe: 'Swipe',
  empty: 'No more recommendations right now.',
  emptySubtext:
    'Watch a few more things on Plex, or reset your dislikes in settings, and check back later.',
  loadfailed: 'Something went wrong loading recommendations.',
});

const Swipe = () => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [queue, setQueue] = useState<(MovieResult | TvResult)[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchingMore, setFetchingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const seenIds = useRef<Set<number>>(new Set());
  const queueLengthRef = useRef(0);

  useEffect(() => {
    queueLengthRef.current = queue.length;
  }, [queue]);

  const fetchBatch = useCallback(async () => {
    setFetchingMore(true);
    try {
      const exclude = Array.from(seenIds.current).join(',');
      const response = await axios.get<{
        results: (MovieResult | TvResult)[];
      }>('/api/v1/recommendations/swipe', {
        params: exclude ? { exclude } : {},
      });

      const newItems = response.data.results.filter(
        (item) => !seenIds.current.has(item.id)
      );

      newItems.forEach((item) => seenIds.current.add(item.id));

      if (newItems.length === 0) {
        setExhausted(queueLengthRef.current === 0);
      } else {
        setExhausted(false);
      }

      setQueue((prev) => [...prev, ...newItems]);
    } catch {
      // Stop auto-retrying on failure (gated by loadError below) and show
      // a single toast instead of one per retry attempt.
      setLoadError(true);
      addToast(intl.formatMessage(messages.loadfailed), {
        appearance: 'error',
      });
    } finally {
      setLoading(false);
      setFetchingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchBatch();
  }, [fetchBatch]);

  useEffect(() => {
    if (
      !loading &&
      !fetchingMore &&
      !exhausted &&
      !loadError &&
      queue.length <= RELOAD_THRESHOLD
    ) {
      fetchBatch();
    }
  }, [queue.length, loading, fetchingMore, exhausted, loadError, fetchBatch]);

  const handleSwipe = useCallback(
    async (direction: 'like' | 'dislike') => {
      const current = queue[0];
      if (!current) return;

      setQueue((prev) => prev.slice(1));

      try {
        await axios.post('/api/v1/recommendations/swipe', {
          tmdbId: current.id,
          mediaType: current.mediaType as MediaType,
          direction,
        });
      } catch {
        // Non-fatal: the swipe just won't be persisted server-side.
      }
    },
    [queue]
  );

  const handleSkip = useCallback(() => {
    // "I don't know this title" — just move on, no like/dislike recorded,
    // so it isn't excluded from future recommendations.
    setQueue((prev) => prev.slice(1));
  }, []);

  return (
    <>
      <PageTitle title={intl.formatMessage(messages.swipe)} />
      <div className="flex w-full justify-center">
        <div className="flex w-full max-w-sm flex-col items-center">
          <div className="relative aspect-[2/3] w-full">
            {loading ? (
              <div className="flex h-full w-full items-center justify-center">
                <LoadingSpinner />
              </div>
            ) : queue.length === 0 ? (
              <div className="flex h-full w-full flex-col items-center justify-center rounded-xl bg-gray-800 p-6 text-center">
                <p className="text-lg font-semibold">
                  {intl.formatMessage(messages.empty)}
                </p>
                <p className="mt-2 text-sm text-gray-400">
                  {intl.formatMessage(messages.emptySubtext)}
                </p>
              </div>
            ) : (
              queue
                .slice(0, 3)
                .reverse()
                .map((title, index, arr) => (
                  <SwipeCard
                    key={`${title.mediaType}-${title.id}`}
                    title={title}
                    active={index === arr.length - 1}
                    zIndex={index}
                    onSwiped={handleSwipe}
                  />
                ))
            )}
          </div>
          <SwipeButtons
            onSwipe={handleSwipe}
            onSkip={handleSkip}
            disabled={queue.length === 0}
          />
        </div>
      </div>
    </>
  );
};

export default Swipe;
