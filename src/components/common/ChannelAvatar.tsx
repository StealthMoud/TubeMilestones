interface ChannelAvatarProps {
  title: string;
  src: string;
  size?: 'small' | 'medium' | 'large';
}

export function ChannelAvatar({ title, src, size = 'medium' }: ChannelAvatarProps) {
  const initials = title
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();

  return (
    <span className={`channel-avatar channel-avatar--${size}`} aria-hidden="true">
      {src ? (
        <img src={src} alt="" width="96" height="96" loading="lazy" />
      ) : (
        <span>{initials}</span>
      )}
    </span>
  );
}
