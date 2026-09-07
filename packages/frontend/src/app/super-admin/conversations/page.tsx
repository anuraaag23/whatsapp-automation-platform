import { ComingSoon } from '../_components/ComingSoon';

export default function SuperAdminConversationsPage() {
  return (
    <ComingSoon
      title="Conversations"
      note="Would show conversation activity across organizations with careful access controls on message content, per the privacy requirements this needs — deliberately not built without designing that access-control layer properly first, rather than exposing customer message content by default."
    />
  );
}
