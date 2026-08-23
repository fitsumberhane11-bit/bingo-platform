/**
 * Canonical permission keys. This is the single source of truth consumed by:
 *  - the Prisma seed script (creates matching `Permission` rows)
 *  - server-side route guards (`requirePermission(...)`)
 *  - the admin UI (to decide what to render — never the sole enforcement point)
 *
 * Naming convention: "<resource>:<action>".
 */
export const PERMISSIONS = {
  // Users
  USER_VIEW: "user:view",
  USER_SUSPEND: "user:suspend",
  USER_ACTIVATE: "user:activate",
  USER_VIEW_SENSITIVE: "user:view_sensitive", // login history, device fingerprints

  // Games
  GAME_CREATE: "game:create",
  GAME_EDIT: "game:edit",
  GAME_OPEN: "game:open",
  GAME_START: "game:start",
  GAME_PAUSE: "game:pause",
  GAME_RESUME: "game:resume",
  GAME_CANCEL: "game:cancel",
  GAME_CALL_NUMBER: "game:call_number",
  GAME_VIEW: "game:view",

  // Prize / pattern configuration (financial-adjacent, restricted from operators)
  PRIZE_RULE_MANAGE: "prize_rule:manage",
  WINNING_PATTERN_MANAGE: "winning_pattern:manage",

  // Payments / wallet
  PAYMENT_VIEW: "payment:view",
  PAYMENT_RECONCILE: "payment:reconcile",
  PAYMENT_PROVIDER_MANAGE: "payment_provider:manage",
  WALLET_ADJUST: "wallet:adjust",
  WITHDRAWAL_VIEW: "withdrawal:view",
  WITHDRAWAL_APPROVE: "withdrawal:approve",
  WITHDRAWAL_REJECT: "withdrawal:reject",

  // Announcements
  ANNOUNCEMENT_CREATE: "announcement:create",

  // Reports & settings
  REPORTS_VIEW: "reports:view",
  SETTINGS_MANAGE: "settings:manage",
  AUDIT_LOG_VIEW: "audit_log:view",
  ROLE_MANAGE: "role:manage",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN: "ADMIN",
  GAME_OPERATOR: "GAME_OPERATOR",
  FINANCE: "FINANCE",
  SUPPORT: "SUPPORT",
  PLAYER: "PLAYER",
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

/**
 * Default role → permission mapping used by the seed script. SUPER_ADMIN
 * implicitly has every permission (checked separately, not listed here) so
 * that adding a new permission never silently locks super admins out.
 *
 * This is the canonical, finalized permission matrix (approved 2026-08-17):
 *
 * | Permission       | SUPER_ADMIN | ADMIN | GAME_OPERATOR | FINANCE | SUPPORT |
 * |------------------|-------------|-------|----------------|---------|---------|
 * | Manage users     | YES         | YES   | NO             | NO      | View    |
 * | Create games     | YES         | YES   | YES            | NO      | NO      |
 * | Run games        | YES         | YES   | YES            | NO      | NO      |
 * | View payments    | YES         | YES   | NO             | YES     | Limited |
 * | Reconcile        | YES         | NO    | NO             | YES     | NO      |
 * | Withdrawals      | YES         | NO    | NO             | YES     | View    |
 * | Announcements    | YES         | YES   | YES            | NO      | NO      |
 * | System settings  | YES         | NO    | NO             | NO      | NO      |
 *
 * GAME_OPERATOR may create/run games (picking from existing prize rules and
 * winning patterns) but never PRIZE_RULE_MANAGE/WINNING_PATTERN_MANAGE —
 * defining the rules that determine payouts stays out of operator reach.
 * ADMIN deliberately does NOT get SETTINGS_MANAGE or WITHDRAWAL_VIEW —
 * system configuration and moving real money out both stay SUPER_ADMIN/
 * FINANCE-only, even though ADMIN can view deposits (PAYMENT_VIEW).
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<Exclude<RoleName, "SUPER_ADMIN">, PermissionKey[]> = {
  ADMIN: [
    PERMISSIONS.USER_VIEW,
    PERMISSIONS.USER_SUSPEND,
    PERMISSIONS.USER_ACTIVATE,
    PERMISSIONS.USER_VIEW_SENSITIVE,
    PERMISSIONS.GAME_CREATE,
    PERMISSIONS.GAME_EDIT,
    PERMISSIONS.GAME_OPEN,
    PERMISSIONS.GAME_START,
    PERMISSIONS.GAME_PAUSE,
    PERMISSIONS.GAME_RESUME,
    PERMISSIONS.GAME_CANCEL,
    PERMISSIONS.GAME_CALL_NUMBER,
    PERMISSIONS.GAME_VIEW,
    PERMISSIONS.PRIZE_RULE_MANAGE,
    PERMISSIONS.WINNING_PATTERN_MANAGE,
    PERMISSIONS.PAYMENT_VIEW,
    PERMISSIONS.ANNOUNCEMENT_CREATE,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.AUDIT_LOG_VIEW,
    PERMISSIONS.ROLE_MANAGE,
  ],
  GAME_OPERATOR: [
    PERMISSIONS.GAME_CREATE,
    PERMISSIONS.GAME_EDIT,
    PERMISSIONS.GAME_OPEN,
    PERMISSIONS.GAME_VIEW,
    PERMISSIONS.GAME_START,
    PERMISSIONS.GAME_PAUSE,
    PERMISSIONS.GAME_RESUME,
    PERMISSIONS.GAME_CANCEL,
    PERMISSIONS.GAME_CALL_NUMBER,
    PERMISSIONS.ANNOUNCEMENT_CREATE,
  ],
  FINANCE: [
    PERMISSIONS.PAYMENT_VIEW,
    PERMISSIONS.PAYMENT_RECONCILE,
    PERMISSIONS.PAYMENT_PROVIDER_MANAGE,
    PERMISSIONS.WALLET_ADJUST,
    PERMISSIONS.WITHDRAWAL_VIEW,
    PERMISSIONS.WITHDRAWAL_APPROVE,
    PERMISSIONS.WITHDRAWAL_REJECT,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.USER_VIEW,
    PERMISSIONS.AUDIT_LOG_VIEW,
  ],
  SUPPORT: [
    PERMISSIONS.USER_VIEW,
    PERMISSIONS.GAME_VIEW,
    PERMISSIONS.PAYMENT_VIEW,
    PERMISSIONS.WITHDRAWAL_VIEW,
  ],
  PLAYER: [],
};
