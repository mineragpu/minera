import { CLUSTER } from './geometry.ts';
import { DegreePlate } from './DegreePlate.tsx';
import './cluster.css';

/** Twelve CSS 3D blocks on a degree plate: each block is one unit of verified work. */
export function BlockCluster() {
  return (
    <div className="specimen__stage" aria-hidden="true">
      <div className="cluster">
        <DegreePlate />
        {CLUSTER.map((cube) => (
          <div key={cube.key} className="cube" style={cube.style}>
            {cube.faces.map((face) => (
              <div key={face.side} className={`face f-${face.side}`} style={face.style}>
                <i />
                {face.inset && <b />}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
