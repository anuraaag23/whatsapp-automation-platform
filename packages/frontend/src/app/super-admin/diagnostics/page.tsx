import { ComingSoon } from '../_components/ComingSoon';

export default function SuperAdminDiagnosticsPage() {
  return (
    <ComingSoon
      title="Diagnostics"
      note="The Health page already covers the DB/Redis/queue/webhook checks this section calls for. A separate Diagnostics page would add recent-error and job-failure drill-down beyond that summary view."
    />
  );
}
