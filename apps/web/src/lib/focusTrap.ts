const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface TabKeyEvent {
  shiftKey: boolean;
  preventDefault(): void;
}

/** Keeps Tab and Shift+Tab cycling inside `container`. Call it for Tab key presses only. */
export function trapTab(event: TabKeyEvent, container: HTMLElement): void {
  const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE);
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) return;
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !container.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !container.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}
