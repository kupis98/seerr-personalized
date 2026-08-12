import CachedImage from '@app/components/Common/CachedImage';
import globalMessages from '@app/i18n/globalMessages';
import { mediaResultToTitleCardProps } from '@app/utils/mediaResultToTitleCardProps';
import type { MovieResult, TvResult } from '@server/models/Search';
import { useRef, useState } from 'react';
import { useIntl } from 'react-intl';

const SWIPE_THRESHOLD = 120;
const FLY_OUT_DISTANCE = 700;

interface SwipeCardProps {
  title: MovieResult | TvResult;
  onSwiped: (direction: 'like' | 'dislike') => void;
  active: boolean;
  zIndex: number;
}

const SwipeCard = ({ title, onSwiped, active, zIndex }: SwipeCardProps) => {
  const intl = useIntl();
  const cardRef = useRef<HTMLDivElement>(null);
  const dragState = useRef({ startX: 0, startY: 0, dragging: false });
  const [transform, setTransform] = useState({ x: 0, y: 0, rotate: 0 });
  const [transitioning, setTransitioning] = useState(false);

  const props = mediaResultToTitleCardProps(title);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!active) return;
    dragState.current = { startX: e.clientX, startY: e.clientY, dragging: true };
    setTransitioning(false);
    cardRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current.dragging) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setTransform({ x: dx, y: dy, rotate: dx / 12 });
  };

  const finishDrag = () => {
    if (!dragState.current.dragging) return;
    dragState.current.dragging = false;
    setTransitioning(true);

    if (Math.abs(transform.x) > SWIPE_THRESHOLD) {
      const direction = transform.x > 0 ? 'like' : 'dislike';
      setTransform({
        x: direction === 'like' ? FLY_OUT_DISTANCE : -FLY_OUT_DISTANCE,
        y: transform.y,
        rotate: direction === 'like' ? 25 : -25,
      });
      setTimeout(() => onSwiped(direction), 200);
    } else {
      setTransform({ x: 0, y: 0, rotate: 0 });
    }
  };

  return (
    <div
      ref={cardRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      style={{
        transform: `translate(${transform.x}px, ${transform.y}px) rotate(${transform.rotate}deg)`,
        transition: transitioning ? 'transform 0.3s ease' : 'none',
        touchAction: 'none',
        zIndex,
      }}
      className={`absolute inset-0 select-none overflow-hidden rounded-xl bg-gray-800 shadow-lg ring-1 ring-gray-700 ${
        active ? 'cursor-grab active:cursor-grabbing' : ''
      }`}
      data-testid="swipe-card"
    >
      <CachedImage
        type="tmdb"
        alt=""
        src={
          props.image
            ? `https://image.tmdb.org/t/p/w600_and_h900_bestv2${props.image}`
            : `/images/seerr_poster_not_found_logo_top.png`
        }
        fill
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      />
      <div
        className={`pointer-events-none absolute left-3 top-3 rounded-full border px-2 py-1 text-xs font-medium uppercase tracking-wider text-white shadow-md ${
          props.mediaType === 'movie'
            ? 'border-blue-500 bg-blue-600/80'
            : 'border-purple-600 bg-purple-600/80'
        }`}
      >
        {props.mediaType === 'movie'
          ? intl.formatMessage(globalMessages.movie)
          : intl.formatMessage(globalMessages.tvshow)}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-black/90 via-black/70 to-transparent p-4 pt-16">
        <h2 className="truncate text-xl font-bold text-white">
          {props.title}
          {props.year && (
            <span className="ml-2 text-base font-normal text-gray-300">
              ({props.year.slice(0, 4)})
            </span>
          )}
        </h2>
        {props.summary && (
          <p className="line-clamp-4 text-sm text-gray-200">
            {props.summary}
          </p>
        )}
      </div>
      {transform.x > 40 && (
        <div className="pointer-events-none absolute left-4 top-16 -rotate-12 rounded border-4 border-green-500 px-3 py-1 text-xl font-bold text-green-500">
          LIKE
        </div>
      )}
      {transform.x < -40 && (
        <div className="pointer-events-none absolute right-4 top-16 rotate-12 rounded border-4 border-red-500 px-3 py-1 text-xl font-bold text-red-500">
          NOPE
        </div>
      )}
    </div>
  );
};

export default SwipeCard;
