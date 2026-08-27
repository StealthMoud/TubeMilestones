interface ProfileAvatarProps {
  initials: string;
  size?: 'small' | 'large';
}

export function ProfileAvatar({ initials, size = 'small' }: ProfileAvatarProps) {
  return (
    <span className={`profile-avatar profile-avatar--${size}`} aria-hidden="true">
      {initials}
    </span>
  );
}
