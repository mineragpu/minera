import './sheen-spot.css';

/**
 * A soft light under a card's content. The card's `useSheenFollow` ref moves it under a fine
 * pointer; it shows on hover and while something in the card has focus.
 */
export function SheenSpot() {
  return <span className="sheen-spot" aria-hidden="true" />;
}
