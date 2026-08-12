import TitleCard from '@app/components/TitleCard';
import { mediaResultToTitleCardProps } from '@app/utils/mediaResultToTitleCardProps';
import type { MovieResult, TvResult } from '@server/models/Search';
import { useRef, useState } from 'react';

const SWIPE_THRESHOLD = 120;
const FLY_OUT_DISTANCE = 700;

interface SwipeCardProps {
  title: MovieResult | TvResult;
  onSwiped: (direction: 'like' | 'dislike') => void;
  active: boolean;
  zIndex: number;
}

const SwipeCard = ({ title, onSwiped, active, zIndex }: SwipeCardProps) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const dragState = useRef({ startX: 0, startY: 0, dragging: false });
  const [transform, setTransform] = useState({ x: 0, y: 0, rotate: 0 });
  const [transitioning, setTransitioning] = useState(false);

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
      className={`absolute inset-0 ${
        active ? 'cursor-grab active:cursor-grabbing' : ''
      }`}
      data-testid="swipe-card"
    >
      <div className="pointer-events-none h-full w-full">
        <TitleCard {...mediaResultToTitleCardProps(title)} canExpand={false} />
      </div>
      {transform.x > 40 && (
        <div className="absolute left-4 top-4 -rotate-12 rounded border-4 border-green-500 px-3 py-1 text-xl font-bold text-green-500">
          LIKE
        </div>
      )}
      {transform.x < -40 && (
        <div className="absolute right-4 top-4 rotate-12 rounded border-4 border-red-500 px-3 py-1 text-xl font-bold text-red-500">
          NOPE
        </div>
      )}
    </div>
  );
};

export default SwipeCard;
