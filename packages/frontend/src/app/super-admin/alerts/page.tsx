import { ComingSoon } from '../_components/ComingSoon';

export default function SuperAdminAlertsPage() {
  return (
    <ComingSoon
      title="Alerts"
      note="Needs a persisted alert/threshold model — none exists yet. The Health and Overview pages already surface the live signals (queue backlog, failed jobs, service status) an alerts system would be built on top of, rather than duplicating those checks."
    />
  );
}
