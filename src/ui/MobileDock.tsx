import { EnvelopeSimple, Funnel, House, List, ListChecks } from "@phosphor-icons/react";
import { NavLink } from "react-router-dom";
import { useStore } from "../store";

type Props = {
  unread: number;
  openTasks: number;
  onMenu: () => void;
};

const items = [
  { to: "/", key: "navOverview", icon: House, end: true },
  { to: "/pipeline", key: "navPipeline", icon: Funnel },
  { to: "/inbox", key: "navInbox", icon: EnvelopeSimple, badge: "mail" as const },
  { to: "/tasks", key: "navTasks", icon: ListChecks, badge: "tasks" as const },
] as const;

export function MobileDock({ unread, openTasks, onMenu }: Props) {
  const { tx } = useStore();

  return (
    <nav className="mobile-dock" aria-label={tx("mobileNav")}>
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} end={"end" in item ? item.end : false} className="dock-link">
          <item.icon size={22} weight="regular" aria-hidden />
          <span>{tx(item.key)}</span>
          {"badge" in item && item.badge === "mail" && unread > 0 ? (
            <span className="dock-badge">{unread}</span>
          ) : null}
          {"badge" in item && item.badge === "tasks" && openTasks > 0 ? (
            <span className="dock-badge">{openTasks}</span>
          ) : null}
        </NavLink>
      ))}
      <button type="button" className="dock-link dock-menu" onClick={onMenu}>
        <List size={22} weight="bold" aria-hidden />
        <span>{tx("mobileMenu")}</span>
      </button>
    </nav>
  );
}
