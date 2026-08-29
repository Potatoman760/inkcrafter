/** Injected by Vite from the untracked keyring installed by InkCrafter. */
declare const __INKCRAFTER_RELEASE_KEYS__: Record<string, string>;

export function releasePrivateKey(keyId: string): string | null {
  const key = __INKCRAFTER_RELEASE_KEYS__[keyId];
  return typeof key === "string" && key.length > 0 ? key : null;
}
