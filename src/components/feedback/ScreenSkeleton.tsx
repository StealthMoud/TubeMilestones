export function ScreenSkeleton() {
  return (
    <div className="screen-skeleton" aria-label="Loading screen" role="status">
      <span className="screen-skeleton__title" />
      <span className="screen-skeleton__hero" />
      <span className="screen-skeleton__row" />
      <span className="screen-skeleton__row" />
    </div>
  );
}
