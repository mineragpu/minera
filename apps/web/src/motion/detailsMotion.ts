/** Where the stylesheet animates the open content itself. */
const NATIVE =
  typeof CSS !== 'undefined' &&
  CSS.supports('interpolate-size', 'allow-keywords') &&
  CSS.supports('selector(::details-content)');
const DURATION_MS = 480;
const EASING = 'cubic-bezier(0.16, 1, 0.3, 1)';

function motionAllowed(): boolean {
  return document.documentElement.classList.contains('motion-ok');
}

/**
 * A ref callback for a `<details>` where the stylesheet cannot animate its content: opening and
 * closing animate the element's measured height. The summary still toggles it with a click, Enter
 * or Space, and nothing animates without motion.
 */
export function detailsMotionRef(details: HTMLDetailsElement | null): (() => void) | undefined {
  const summary = details?.querySelector('summary');
  if (!details || !summary || NATIVE || typeof details.animate !== 'function') return undefined;
  let running: Animation | null = null;
  let opening = false;

  // The end height holds until the element takes its new state, so a closing answer never shows
  // its full height for a frame before it closes.
  const settle = (open: boolean) => {
    details.open = open;
    details.style.overflow = '';
    running?.cancel();
    running = null;
  };

  const run = (from: number, to: number, open: boolean) => {
    running?.cancel();
    opening = open;
    details.style.overflow = 'hidden';
    running = details.animate(
      { height: [`${from}px`, `${to}px`] },
      { duration: DURATION_MS, easing: EASING, fill: 'forwards' },
    );
    running.onfinish = () => settle(open);
  };

  const onClick = (event: MouseEvent) => {
    if (!motionAllowed()) return;
    event.preventDefault();
    const from = details.offsetHeight;
    const closed = summary.offsetHeight + details.offsetHeight - details.clientHeight;
    if (!details.open || (running && !opening)) {
      details.open = true;
      running?.cancel();
      run(from, details.offsetHeight, true);
    } else {
      run(from, closed, false);
    }
  };

  summary.addEventListener('click', onClick);
  return () => {
    summary.removeEventListener('click', onClick);
    running?.cancel();
  };
}
