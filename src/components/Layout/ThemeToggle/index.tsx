import { useTheme } from '@app/hooks/useTheme';
import defineMessages from '@app/utils/defineMessages';
import { MoonIcon, SunIcon } from '@heroicons/react/24/outline';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Layout.ThemeToggle', {
  switchtolight: 'Switch to light mode',
  switchtodark: 'Switch to dark mode',
});

const ThemeToggle = () => {
  const intl = useIntl();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={intl.formatMessage(
        isDark ? messages.switchtolight : messages.switchtodark
      )}
      aria-label={intl.formatMessage(
        isDark ? messages.switchtolight : messages.switchtodark
      )}
      className="mx-2 flex items-center gap-2 rounded-lg p-2 text-xs text-gray-300 ring-1 ring-gray-700 transition duration-300 hover:bg-gray-800 hover:text-white"
    >
      {isDark ? (
        <SunIcon className="h-5 w-5" />
      ) : (
        <MoonIcon className="h-5 w-5" />
      )}
      <span>
        {intl.formatMessage(
          isDark ? messages.switchtolight : messages.switchtodark
        )}
      </span>
    </button>
  );
};

export default ThemeToggle;
