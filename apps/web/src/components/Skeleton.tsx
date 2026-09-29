import './skeleton.css';

interface SkeletonProps {
  /** Any CSS length; `ch` units match the figure it stands in for. */
  width: string;
  height?: string;
}

/** A placeholder bar for a figure that is still loading. Its container carries `aria-busy`. */
export function Skeleton({ width, height = '1em' }: SkeletonProps) {
  return <span className="skel" style={{ '--skel-w': width, '--skel-h': height }} aria-hidden="true" />;
}
