import {
  Building2,
  Handshake,
  LayoutDashboard,
  LayoutGrid,
  Mail,
  MessageCircle,
  Sparkles,
  Users,
} from "lucide-react";

export const CHAT_NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, hidden: false },
  { id: "ask", label: "Ask Rex", icon: MessageCircle, hidden: false },
  { id: "contacts", label: "Contacts", icon: Users, hidden: false },
  { id: "emails", label: "Emails", icon: Mail, hidden: false },
  {
    id: "organisations",
    label: "Organisations",
    icon: Building2,
    hidden: true,
  },
  { id: "suggestions", label: "Suggestions", icon: Sparkles, hidden: false },
  {
    id: "opportunities",
    label: "Opportunities",
    icon: Handshake,
    hidden: false,
  },
  { id: "pipeline", label: "Pipeline", icon: LayoutGrid, hidden: false },
] as const;

export type ChatNavId = (typeof CHAT_NAV_ITEMS)[number]["id"];

/**
 * Padding-bottom for main shell so content clears the fixed bottom nav +
 * safe-area inset (matches chat-mobile-nav layout).
 */
export const MOBILE_SHELL_BOTTOM_PAD_CLASS =
  "pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))]";

export function chatNavLabel(id: ChatNavId): string {
  const row = CHAT_NAV_ITEMS.find((item) => item.id === id);
  return row?.label ?? id;
}
