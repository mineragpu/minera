interface CubeGlyphProps {
  /** Tints the top and left faces; any CSS colour, usually a palette token. */
  color: string;
  className?: string;
}

export function CubeGlyph({ color, className }: CubeGlyphProps) {
  return (
    <svg className={className} viewBox="0 0 40 44" aria-hidden="true" focusable="false" style={{ color }}>
      <use href="#cube" />
    </svg>
  );
}
