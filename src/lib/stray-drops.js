/**
 * Files dropped where nothing takes them would make the browser open the file instead of the app — leaving
 * the page (and stopping uploads or recordings). Brave shows that as "about:blank#blocked".
 *
 * <DropGuard> stops that everywhere. A screen that wants files from anywhere on the page (an open chat)
 * registers here, and stray drops go to it.
 */

const targets = [];

/** Takes files dropped anywhere on the page while registered. The latest registration wins. Returns an unregister. */
export function acceptStrayDrops(target) {
  targets.push(target);
  return () => {
    const at = targets.lastIndexOf(target);
    if (at >= 0) targets.splice(at, 1);
  };
}

export const strayTarget = () => targets.at(-1) ?? null;
