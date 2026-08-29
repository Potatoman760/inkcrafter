/**
 * The branch a `switch` over a union should never reach.
 *
 * Several switches in the player are statements rather than expressions — they
 * apply side effects and return nothing — and TypeScript has no way to insist a
 * statement switch is exhaustive. Adding a member to `TagCommand` would
 * therefore compile cleanly and silently do nothing, which is the worst shape a
 * bug can take in a tag pipeline: a story writes a tag, and the game ignores it.
 * A `default` calling this turns that into a compile error.
 */
export function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(value)}`);
}
