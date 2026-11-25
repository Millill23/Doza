export const OFFLINE_ONLY_VOLUMES = [15, 20, 25];

export function isOfflineOnlyVolume(volumeMl: number): boolean {
  return OFFLINE_ONLY_VOLUMES.includes(volumeMl);
}
