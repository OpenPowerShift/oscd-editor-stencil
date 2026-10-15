/**
 * Whether the user asked for less motion. Dialogs then open and close
 * without animating.
 */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
