/** Reads layout, then returns the writes to make once every task has read. */
type FrameTask = () => (() => void) | void;

const tasks = new Set<FrameTask>();
let frame = 0;

function run(): void {
  frame = 0;
  const writes: (() => void)[] = [];
  for (const task of tasks) {
    const write = task();
    if (write) writes.push(write);
  }
  for (const write of writes) write();
}

/** Asks for one frame; any number of scroll events before it collapse into it. */
export function requestScrollFrame(): void {
  if (!frame && tasks.size > 0) frame = requestAnimationFrame(run);
}

/**
 * Runs `task` in the next animation frame after each scroll or resize. One passive listener serves
 * every task, the listener itself reads nothing, and each frame reads for all tasks before any task
 * writes, so the frame never alternates reads and writes.
 */
export function onScrollFrame(task: FrameTask): () => void {
  if (tasks.size === 0) {
    window.addEventListener('scroll', requestScrollFrame, { passive: true });
    window.addEventListener('resize', requestScrollFrame, { passive: true });
  }
  tasks.add(task);
  requestScrollFrame();
  return () => {
    tasks.delete(task);
    if (tasks.size > 0) return;
    window.removeEventListener('scroll', requestScrollFrame);
    window.removeEventListener('resize', requestScrollFrame);
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  };
}
