import UserSettings from '@app/components/UserProfile/UserSettings';
import UserRecommendationSettings from '@app/components/UserProfile/UserSettings/UserRecommendationSettings';
import type { NextPage } from 'next';

const UserSettingsRecommendationsPage: NextPage = () => {
  return (
    <UserSettings>
      <UserRecommendationSettings />
    </UserSettings>
  );
};

export default UserSettingsRecommendationsPage;
