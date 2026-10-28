/**
 * Names the signed-in account without putting the full Huawei snsUserID on screen.
 * Only the last four characters survive; the shared prefix identifies nobody.
 * @param {unknown} id
 * @returns {string | undefined}
 */
export function maskAccountId(id) {
  if (typeof id !== 'string') return undefined;
  const trimmed = id.trim();
  if (!trimmed) return undefined;
  return `****${trimmed.slice(-4)}`;
}
