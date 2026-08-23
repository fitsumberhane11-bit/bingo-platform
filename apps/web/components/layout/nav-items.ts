import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Gamepad2,
  Ticket,
  History,
  Wallet,
  ArrowDownToLine,
  Receipt,
  Bell,
  User,
  ShieldCheck,
  HelpCircle,
  HeartHandshake,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  enabled: boolean;
  primary?: boolean;
}

// `enabled: false` items are intentionally visible-but-disabled rather than
// broken links or fake placeholder pages — their phases (wallet, tickets,
// game rooms) haven't been built yet.
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, enabled: true, primary: true },
  { href: "/play", label: "Play Bingo", icon: Gamepad2, enabled: true, primary: true },
  { href: "/tickets", label: "My Tickets", icon: Ticket, enabled: false },
  { href: "/games/history", label: "My Games", icon: History, enabled: true },
  { href: "/wallet", label: "Wallet", icon: Wallet, enabled: true },
  { href: "/wallet/withdraw", label: "Withdraw", icon: ArrowDownToLine, enabled: true },
  { href: "/transactions", label: "Transactions", icon: Receipt, enabled: true },
  { href: "/notifications", label: "Notifications", icon: Bell, enabled: true },
  { href: "/profile", label: "Profile", icon: User, enabled: true },
  { href: "/security", label: "Security", icon: ShieldCheck, enabled: true },
  { href: "/responsible-gaming", label: "Responsible Gaming", icon: HeartHandshake, enabled: true },
  { href: "/help", label: "Help", icon: HelpCircle, enabled: false },
];
