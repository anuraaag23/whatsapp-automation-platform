import { ComingSoon } from '../_components/ComingSoon';

export default function SuperAdminSettingsPage() {
  return (
    <ComingSoon
      title="Platform Settings"
      note="Needs a persisted platform-settings model (registration toggle, maintenance mode, default limits, etc.) — none exists yet. No raw environment variables or server secrets will ever be shown here when it is built."
    />
  );
}
