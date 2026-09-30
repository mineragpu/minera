import { useRef, type CSSProperties } from 'react';
import { loopRef } from '../../motion/loopGate.ts';
import { useSentinelTunnel } from '../../motion/useSentinelTunnel.ts';
import '../cluster/cluster.css';
import { BAR, CUBE, DROP, FRAME, FRAME_DEPTH, GATE_Z, ITEMS, TRACK_HALF, TRAY_X } from './timeline.ts';
import './tunnel.css';

/** The scene's sizes, handed to the stylesheet so both read one set of numbers. */
const GEOMETRY: CSSProperties = {
  '--frame': FRAME,
  '--bar': BAR,
  '--depth': FRAME_DEPTH,
  '--cube': CUBE,
  '--track': TRACK_HALF,
  '--drop': DROP,
  '--tray-x': TRAY_X,
};

/** A rig only ever shows these three faces to the camera, since it never turns. */
const RIG_FACES = ['front', 'left', 'top'] as const;
const BOT_FACES = ['front', 'back', 'right', 'left', 'top', 'bottom'] as const;

/** Spreads each face's oil-slick patch and edge hue by fixed steps, so every visit looks the same. */
function faceStyle(seed: number): CSSProperties {
  const at = (step: number) => (seed * step) % 1;
  return {
    '--tpx': `${Math.round(14 + at(0.618) * 72)}%`,
    '--tpy': `${Math.round(14 + at(0.414) * 72)}%`,
    '--tar': (0.5 + at(0.732) * 0.4).toFixed(2),
    '--to': `${Math.round(at(0.303) * 360)}deg`,
    '--eo': `${Math.round(at(0.577) * 360)}deg`,
  };
}

function RigCube({ seed }: { seed: number }) {
  return (
    <div className="tn-item" data-tunnel-item>
      <div className="cube" style={{ '--s': CUBE, '--x': 0, '--y': 0, '--z': 0, '--bw': '1.5px' }}>
        {RIG_FACES.map((side, index) => (
          <div key={side} className={`face f-${side}`} style={faceStyle(seed * 3 + index + 1)} data-tunnel-face>
            <i />
          </div>
        ))}
      </div>
      <span className="tn-flare tn-flare--glint" data-tunnel-flare />
    </div>
  );
}

function BotCube() {
  return (
    <div className="tn-item" data-tunnel-item>
      <div className="tn-bot">
        {BOT_FACES.map((side) => (
          <i key={side} className={`tn-bot__face tn-bot__face--${side}`} data-tunnel-face />
        ))}
      </div>
      <span className="tn-flare tn-flare--alarm" data-tunnel-flare />
    </div>
  );
}

function Gate({ index }: { index: number }) {
  return (
    <div className="tn-gate" style={{ '--gz': GATE_Z[index] ?? 0 }}>
      <i className="tn-gate__side tn-gate__side--out" />
      <i className="tn-gate__side tn-gate__side--in" />
      <i className="tn-gate__cap" />
      <i className="tn-gate__ring" style={{ '--eo': `${index * 72 + 20}deg` }} />
      <i className="tn-gate__film tn-gate__film--pass" data-gate-pass />
      <i className="tn-gate__film tn-gate__film--block" data-gate-block />
      <span className="tn-label tn-gate__label">{String(index + 1).padStart(2, '0')}</span>
    </div>
  );
}

/**
 * Five scanner gates in a row, drawn with CSS 3D. Rigs pass through all five; bots are stopped at
 * one of them and pushed into the quarantine tray beside the track. Decorative: the section around
 * it states the same in words.
 */
export function SentinelTunnel() {
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  useSentinelTunnel(stageRef, sceneRef);

  return (
    <div className="tn-stage" ref={stageRef} aria-hidden="true">
      <div className="tn-view" ref={loopRef} style={GEOMETRY}>
        <div className="tn-scene" ref={sceneRef}>
          <i className="tn-ground" />
          <i className="tn-track tn-track--top" />
          <i className="tn-track tn-track--side" />
          <div className="tn-tray">
            <i className="tn-tray__floor" />
            <i className="tn-tray__wall tn-tray__wall--out" />
            <i className="tn-tray__wall tn-tray__wall--in" />
            <i className="tn-tray__wall tn-tray__wall--far" />
            <i className="tn-tray__wall tn-tray__wall--near" />
            <span className="tn-label tn-tray__label">Quarantine</span>
          </div>
          {GATE_Z.map((_, index) => (
            <Gate key={index} index={index} />
          ))}
          {ITEMS.map((item, index) =>
            item.kind === 'rig' ? <RigCube key={index} seed={index} /> : <BotCube key={index} />,
          )}
        </div>
      </div>
    </div>
  );
}
