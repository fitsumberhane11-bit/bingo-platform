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
  GAME_END: "game:end",
  GAME_PRIZE_SET: "game:prize_set", // set the per-game operator-authoritative prize amount — distinct from PRIZE_RULE_MANAGE (defining reusable rule templates)
  GAME_RULES_SET: "game:rules_set", // configure a game's winning stage(s) from existing patterns — distinct from WINNING_PATTERN_MANAGE (defining new pattern shapes)
  GAME_CLAIM_CONFIRM: "game:claim_confirm", // confirm/reject a player's BINGO claim

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
 * This is the canonical, finalized permission matrix (approved 2026-08-26):
 *
 * | Permission       | SUPER_ADMIN | ADMIN | GAME_OPERATOR | FINANCE | SUPPORT |
 * |------------------|-------------|-------|----------------|---------|---------|
 * | Manage users     | YES         | YES   | NO             | NO      | View    |
 * | Create/run games | YES         | NO    | YES            | NO      | NO      |
 * | View games       | YES         | YES   | YES            | NO      | View    |
 * | View payments    | YES         | YES   | NO             | YES     | Limited |
 * | Reconcile        | YES         | NO    | NO             | YES     | NO      |
 * | Withdrawals      | YES         | NO    | NO             | YES     | View    |
 * | Announcements    | YES         | NO    | YES            | NO      | NO      |
 * | Define prize/pattern rules | YES | YES | NO           | NO      | NO      |
 * | System settings  | YES         | NO    | NO             | NO      | NO      |
 *
 * GAME_OPERATOR is the exclusive day-to-day game-runner (approved
 * 2026-08-26): only GAME_OPERATOR and SUPER_ADMIN can create, configure, or
 * run a live game (open/start/pause/resume/cancel/end/call numbers/set a
 * game's prize or stages/confirm BINGO claims) or send player
 * announcements. ADMIN is back-office only — user management, defining the
 * *reusable* prize-rule/winning-pattern templates operators pick from
 * (PRIZE_RULE_MANAGE/WINNING_PATTERN_MANAGE — distinct from actually
 * running a game), viewing payments/reports/audit log, and role
 * management. This is a deliberate separation of duties: whoever can touch
 * a live game floor should not also be the one editing user accounts, and
 * vice versa.
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
    PERMISSIONS.GAME_VIEW,
    PERMISSIONS.PRIZE_RULE_MANAGE,
    PERMISSIONS.WINNING_PATTERN_MANAGE,
    PERMISSIONS.PAYMENT_VIEW,
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
    PERMISSIONS.GAME_END,
    PERMISSIONS.GAME_PRIZE_SET,
    PERMISSIONS.GAME_RULES_SET,
    PERMISSIONS.GAME_CLAIM_CONFIRM,
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
