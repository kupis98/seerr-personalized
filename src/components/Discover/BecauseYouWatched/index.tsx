import Slider from '@app/components/Slider';
import TitleCard from '@app/components/TitleCard';
import { mediaResultToTitleCardProps } from '@app/utils/mediaResultToTitleCardProps';
import defineMessages from '@app/utils/defineMessages';
import type { MediaType } from '@server/constants/media';
import type { MovieResult, TvResult } from '@server/models/Search';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.Discover.BecauseYouWatched', {
  becauseyouwatched: 'Because you watched {title}',
});

interface Shelf {
  seedTmdbId: number;
  seedMediaType: MediaType;
  seedTitle: string;
  results: (MovieResult | TvResult)[];
}

const BecauseYouWatched = () => {
  const intl = useIntl();
  const { data } = useSWR<{ shelves: Shelf[] }>(
    '/api/v1/recommendations/because-you-watched'
  );

  if (!data || data.shelves.length === 0) {
    return null;
  }

  return (
    <>
      {data.shelves.map((shelf) => (
        <div key={`byw-${shelf.seedMediaType}-${shelf.seedTmdbId}`}>
          <div className="slider-header">
            <div className="slider-title">
              <span>
                {intl.formatMessage(messages.becauseyouwatched, {
                  title: shelf.seedTitle,
                })}
              </span>
            </div>
          </div>
          <Slider
            sliderKey={`byw-${shelf.seedMediaType}-${shelf.seedTmdbId}`}
            isLoading={false}
            items={shelf.results.map((title) => (
              <TitleCard
                key={title.id}
                {...mediaResultToTitleCardProps(title)}
              />
            ))}
          />
        </div>
      ))}
    </>
  );
};

export default BecauseYouWatched;
