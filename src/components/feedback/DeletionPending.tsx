import { Clock3 } from 'lucide-react';
import { useTubeMilestones } from '../../hooks/useTubeMilestones';
import { BrandMark } from '../common/BrandMark';
import { Button } from '../common/Button';

export function DeletionPending() {
  const { signOut } = useTubeMilestones();
  return (
    <main className="deletion-pending">
      <BrandMark size={48} title="TubeMilestones" />
      <div className="deletion-pending__symbol" aria-hidden="true">
        <Clock3 size={24} />
      </div>
      <div>
        <p className="eyebrow">Deletion requested</p>
        <h1>Your saved YouTube data is being removed.</h1>
        <p>
          TubeMilestones has stopped using the connection. Cleanup may continue across
          Supabase, Vault, and the encrypted archive before completion is confirmed.
        </p>
      </div>
      <Button variant="secondary" onClick={() => void signOut()}>
        Sign out
      </Button>
    </main>
  );
}
