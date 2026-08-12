import Button from '@app/components/Common/Button';
import defineMessages from '@app/utils/defineMessages';
import {
  HandThumbDownIcon,
  HandThumbUpIcon,
  QuestionMarkCircleIcon,
} from '@heroicons/react/24/solid';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Swipe.SwipeButtons', {
  dislike: 'Dislike',
  like: 'Like',
  skip: "I don't know this title",
});

interface SwipeButtonsProps {
  onSwipe: (direction: 'like' | 'dislike') => void;
  onSkip: () => void;
  disabled?: boolean;
}

const SwipeButtons = ({ onSwipe, onSkip, disabled }: SwipeButtonsProps) => {
  const intl = useIntl();

  return (
    <div className="mt-6 flex items-center justify-center gap-6">
      <Button
        buttonType="danger"
        buttonSize="lg"
        disabled={disabled}
        onClick={() => onSwipe('dislike')}
        className="rounded-full !p-4"
        title={intl.formatMessage(messages.dislike)}
      >
        <HandThumbDownIcon className="h-6 w-6" />
      </Button>
      <Button
        buttonType="default"
        buttonSize="md"
        disabled={disabled}
        onClick={() => onSkip()}
        className="rounded-full !p-3"
        title={intl.formatMessage(messages.skip)}
      >
        <QuestionMarkCircleIcon className="h-5 w-5" />
      </Button>
      <Button
        buttonType="success"
        buttonSize="lg"
        disabled={disabled}
        onClick={() => onSwipe('like')}
        className="rounded-full !p-4"
        title={intl.formatMessage(messages.like)}
      >
        <HandThumbUpIcon className="h-6 w-6" />
      </Button>
    </div>
  );
};

export default SwipeButtons;
