import { useRef } from 'react';
import { useBlockCluster } from '../../motion/useBlockCluster.ts';
import { CLUSTER } from './geometry.ts';
import { DegreePlate } from './DegreePlate.tsx';
import './cluster.css';

/** Twelve CSS 3D blocks on a degree plate: each block is one unit of verified work. */
export function BlockCluster() {
  const stageRef = useRef<HTMLDivElement>(null);
  const clusterRef = useRef<HTMLDivElement>(null);
  const assembling = useBlockCluster(stageRef, clusterRef);

  return (
    <div className="specimen__stage" ref={stageRef} aria-hidden="true">
      <div className={assembling ? 'cluster is-assembling' : 'cluster'} ref={clusterRef}>
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
