import Button from '@app/components/Common/Button';
import { HandThumbDownIcon, HandThumbUpIcon } from '@heroicons/react/24/solid';

interface SwipeButtonsProps {
  onSwipe: (direction: 'like' | 'dislike') => void;
  disabled?: boolean;
}

const SwipeButtons = ({ onSwipe, disabled }: SwipeButtonsProps) => (
  <div className="mt-6 flex items-center justify-center gap-6">
    <Button
      buttonType="danger"
      buttonSize="lg"
      disabled={disabled}
      onClick={() => onSwipe('dislike')}
      className="rounded-full !p-4"
    >
      <HandThumbDownIcon className="h-6 w-6" />
    </Button>
    <Button
      buttonType="success"
      buttonSize="lg"
      disabled={disabled}
      onClick={() => onSwipe('like')}
      className="rounded-full !p-4"
    >
      <HandThumbUpIcon className="h-6 w-6" />
    </Button>
  </div>
);

export default SwipeButtons;
