/**
 * Epochs are fixed windows of `epochSeconds` counted from the unix epoch. Work is credited to the
 * epoch it is verified in.
 */
export function epochOf(time: Date, epochSeconds: number): number {
  return Math.floor(time.getTime() / 1000 / epochSeconds);
}

export function epochStart(epoch: number, epochSeconds: number): Date {
  return new Date(epoch * epochSeconds * 1000);
}
