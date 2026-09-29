import { useRef } from 'react';
import { useLatticeParallax } from '../motion/useLatticeParallax.ts';
import './lattice-background.css';

export function LatticeBackground() {
  const gridRef = useRef<HTMLDivElement>(null);
  useLatticeParallax(gridRef);

  return (
    <div className="lattice" aria-hidden="true">
      <div className="lattice__grid" ref={gridRef} />
    </div>
  );
}
