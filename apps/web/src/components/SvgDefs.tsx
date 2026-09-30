/**
 * Gradients, the cube symbol and the brand mark's metals that inline icons across the page
 * reference by id. Rendered once, before any icon that uses them.
 */
export function SvgDefs() {
  return (
    <svg className="svg-defs" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="g-iri" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2EE6C8" />
          <stop offset=".3" stopColor="#5A8DFF" />
          <stop offset=".52" stopColor="#8C6BFF" />
          <stop offset=".76" stopColor="#FF4FA3" />
          <stop offset="1" stopColor="#F5C451" />
        </linearGradient>
        <linearGradient id="g-top" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#D2D9E2" />
          <stop offset="1" stopColor="#7D8797" />
        </linearGradient>
        <linearGradient id="g-left" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5E6778" />
          <stop offset="1" stopColor="#3A4250" />
        </linearGradient>
        <linearGradient id="g-right" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#363D4A" />
          <stop offset="1" stopColor="#222832" />
        </linearGradient>
        <linearGradient id="g-rig-lit" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F4F7FA" />
          <stop offset="1" stopColor="#B3BDCA" />
        </linearGradient>
        <linearGradient id="g-rig-steel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#C9D1DC" />
          <stop offset="1" stopColor="#8391A3" />
        </linearGradient>
        <linearGradient id="g-rig-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFE8A6" />
          <stop offset="1" stopColor="#F5C451" />
        </linearGradient>
        <symbol id="cube" viewBox="0 0 40 44">
          <path d="M20 2.5 37 12 20 21.5 3 12Z" fill="url(#g-top)" />
          <path d="M3 12 20 21.5V41.5L3 32Z" fill="url(#g-left)" />
          <path d="M37 12 20 21.5V41.5L37 32Z" fill="url(#g-right)" />
          <path d="M20 2.5 37 12 20 21.5 3 12Z" fill="currentColor" fillOpacity=".34" />
          <path d="M3 12 20 21.5V41.5L3 32Z" fill="currentColor" fillOpacity=".12" />
          <path
            d="M20 2.5 37 12V32L20 41.5 3 32V12Z M3 12 20 21.5 37 12 M20 21.5V41.5"
            fill="none"
            stroke="url(#g-iri)"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        </symbol>
      </defs>
    </svg>
  );
}
