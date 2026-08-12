import ConfirmButton from '@app/components/Common/ConfirmButton';
import PageTitle from '@app/components/Common/PageTitle';
import useToasts from '@app/hooks/useToasts';
import { useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { ArrowPathIcon } from '@heroicons/react/24/solid';
import axios from 'axios';
import { useIntl } from 'react-intl';

const messages = defineMessages(
  'components.UserProfile.UserSettings.UserRecommendationSettings',
  {
    recommendations: 'Recommendations',
    recommendationsettingsdescription:
      'Manage your personalized recommendations (For You, Swipe, and Liked).',
    resetdislikes: 'Reset Dislikes',
    resetdislikeshint:
      'Titles you swiped left on are permanently excluded from future recommendations. Resetting makes them eligible again.',
    resetsuccess:
      '{count, plural, one {# dislike} other {# dislikes}} reset successfully!',
    resetfailed: 'Something went wrong resetting your dislikes.',
  }
);

const UserRecommendationSettings = () => {
  const intl = useIntl();
  const { user } = useUser();
  const { addToast } = useToasts();

  const resetDislikes = async () => {
    try {
      const { data } = await axios.post<{ removed: number }>(
        '/api/v1/recommendations/reset-dislikes'
      );

      addToast(
        intl.formatMessage(messages.resetsuccess, { count: data.removed }),
        { appearance: 'success' }
      );
    } catch {
      addToast(intl.formatMessage(messages.resetfailed), {
        appearance: 'error',
      });
    }
  };

  return (
    <>
      <PageTitle
        title={[
          intl.formatMessage(messages.recommendations),
          intl.formatMessage(globalMessages.usersettings),
          user?.displayName ?? '',
        ]}
      />
      <div className="mb-6">
        <h3 className="heading">
          {intl.formatMessage(messages.recommendations)}
        </h3>
        <p className="description">
          {intl.formatMessage(messages.recommendationsettingsdescription)}
        </p>
      </div>
      <div className="section">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="description max-w-xl">
            {intl.formatMessage(messages.resetdislikeshint)}
          </p>
          <ConfirmButton
            onClick={() => resetDislikes()}
            confirmText={intl.formatMessage(globalMessages.areyousure)}
            className="w-full sm:w-auto"
          >
            <ArrowPathIcon />
            <span>{intl.formatMessage(messages.resetdislikes)}</span>
          </ConfirmButton>
        </div>
      </div>
    </>
  );
};

export default UserRecommendationSettings;
