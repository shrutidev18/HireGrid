import PhasePlaceholder from '../components/PhasePlaceholder';
import { useAuth } from '../hooks/useAuth';

export default function Dashboard() {
  const { user } = useAuth();

  return (
    <PhasePlaceholder
      title={`Welcome back, ${user?.name ?? ''}`.trim()}
      description="Summary stats, status funnel, skill gaps and applications needing attention."
      phase="a later phase"
    />
  );
}
