import { useEffect, useRef } from 'react';

export function useDismissibleDetails() {
  const details = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const close = (restoreFocus = false) => {
      const element = details.current;
      if (!element?.open) return;
      element.open = false;
      if (restoreFocus) {
        element.querySelector<HTMLElement>('summary')?.focus();
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      const element = details.current;
      if (element?.open && !element.contains(event.target as Node)) close();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !details.current?.open) return;
      event.preventDefault();
      close(true);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return details;
}
