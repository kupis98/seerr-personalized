import Modal from '@app/components/Common/Modal';
import useSettings from '@app/hooks/useSettings';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { Transition } from '@headlessui/react';
import { FilmIcon } from '@heroicons/react/24/outline';
import type { MovieDetails } from '@server/models/Movie';
import type { TvDetails } from '@server/models/Tv';
import axios from 'axios';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Swipe.SwipeDetailModal', {
  watchtrailer: 'Watch Trailer',
});

interface SwipeDetailModalProps {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  show: boolean;
  onClose: () => void;
}

const SwipeDetailModal = ({
  tmdbId,
  mediaType,
  show,
  onClose,
}: SwipeDetailModalProps) => {
  const intl = useIntl();
  const settings = useSettings();
  const [data, setData] = useState<MovieDetails | TvDetails | null>(null);

  useEffect(() => {
    if (!show) {
      setData(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const response = await axios.get<MovieDetails | TvDetails>(
          `/api/v1/${mediaType}/${tmdbId}`
        );
        if (!cancelled) {
          setData(response.data);
        }
      } catch {
        // Non-fatal: modal just keeps showing its loading state.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [show, tmdbId, mediaType]);

  const title = data ? ('title' in data ? data.title : data.name) : '';

  const trailerVideo = data?.relatedVideos
    ?.filter((v) => v.type === 'Trailer')
    .sort((a, b) => a.size - b.size)
    .pop();
  const trailerUrl =
    trailerVideo?.site === 'YouTube' && settings.currentSettings.youtubeUrl
      ? `${settings.currentSettings.youtubeUrl}${trailerVideo.key}`
      : trailerVideo?.url;

  return (
    <Transition
      as="div"
      enter="transition-opacity duration-300"
      enterFrom="opacity-0"
      enterTo="opacity-100"
      leave="transition-opacity duration-300"
      leaveFrom="opacity-100"
      leaveTo="opacity-0"
      show={show}
    >
      <Modal
        loading={!data}
        title={title}
        subTitle={data?.genres.map((g) => g.name).join(', ')}
        backdrop={
          data?.backdropPath
            ? `https://image.tmdb.org/t/p/w1920_and_h800_multi_faces${data.backdropPath}`
            : undefined
        }
        onCancel={onClose}
        cancelText={intl.formatMessage(globalMessages.close)}
        backgroundClickable
      >
        {data && (
          <div className="mt-2 space-y-4 text-left">
            <p className="text-sm text-gray-300">{data.overview}</p>
            {trailerUrl && (
              <a
                href={trailerUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 font-medium text-red-400 hover:underline"
              >
                <FilmIcon className="h-5 w-5" />
                {intl.formatMessage(messages.watchtrailer)}
              </a>
            )}
          </div>
        )}
      </Modal>
    </Transition>
  );
};

export default SwipeDetailModal;
