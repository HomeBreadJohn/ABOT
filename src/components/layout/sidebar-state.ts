export const SIDEBAR_STATE_COOKIE_NAME = "sidebar_state";
export const SIDEBAR_STATE_COOKIE_MAX_AGE = 31_536_000;
export const SIDEBAR_STATE_DEFAULT = "expanded" as const;

export type SidebarState = "expanded" | "collapsed";

/**
 * The sidebar preference is non-sensitive UI state. Unknown or missing values
 * intentionally fall back to the expanded layout.
 */
export function parseSidebarState(value: unknown): SidebarState {
  return value === "collapsed" ? "collapsed" : SIDEBAR_STATE_DEFAULT;
}

/**
 * Keep the client-written cookie aligned with the server's documented
 * defaults: root scope, one-year persistence, and lax same-site behavior.
 */
export function serializeSidebarStateCookie(state: SidebarState): string {
  return `${SIDEBAR_STATE_COOKIE_NAME}=${state}; Max-Age=${SIDEBAR_STATE_COOKIE_MAX_AGE}; Path=/; SameSite=Lax`;
}
