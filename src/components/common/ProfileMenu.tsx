import { LogOut, Plus, UserRound } from 'lucide-react';
import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { ProfileAvatar } from './ProfileAvatar';

interface ProfileMenuProps {
  displayName: string;
  initials: string;
  email: string | null;
  onAddYouTubeAccount(): Promise<void>;
  onSignOut(): Promise<void>;
  addDisabled?: boolean;
  signOutDisabled?: boolean;
}

export function ProfileMenu({
  displayName,
  initials,
  email,
  onAddYouTubeAccount,
  onSignOut,
  addDisabled = false,
  signOutDisabled = false,
}: ProfileMenuProps) {
  const details = useRef<HTMLDetailsElement>(null);
  const close = () => details.current?.removeAttribute('open');

  return (
    <details className="profile-menu" ref={details}>
      <summary aria-label={`TubeMilestones profile: ${displayName}`} title="Profile">
        <ProfileAvatar initials={initials} />
      </summary>
      <div className="profile-menu__panel">
        <div className="profile-menu__identity">
          <ProfileAvatar initials={initials} />
          <span>
            <strong>{displayName}</strong>
            <small>{email ?? 'TubeMilestones account'}</small>
          </span>
        </div>
        <Link to="/settings" onClick={close}>
          <UserRound size={17} aria-hidden="true" />
          Profile &amp; settings
        </Link>
        <button
          type="button"
          disabled={addDisabled}
          onClick={() => {
            close();
            void onAddYouTubeAccount();
          }}
        >
          <Plus size={17} aria-hidden="true" />
          Add YouTube account
        </button>
        <button
          type="button"
          disabled={signOutDisabled}
          onClick={() => {
            close();
            void onSignOut();
          }}
        >
          <LogOut size={17} aria-hidden="true" />
          Sign out
        </button>
      </div>
    </details>
  );
}
