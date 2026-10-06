import { Button, Tour, type TourProps } from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { completeTour, fetchOnboarding } from "../../api/onboarding.ts";
import { useAuth } from "../../auth/AuthProvider";
import { useStore } from "../../store";
import { useMedia } from "../../ui/useMedia";
import { TOUR_EVENT, helpRoleFromRoles, navLabelKey, type HelpRole } from "./HelpButton.tsx";
import "./help.css";

/** One tour step: a sidebar menu path, a CSS selector, or nothing (centered). */
type StepDef = { nav?: string; sel?: string; titleKey?: string; descKey: string };

const WELCOME: StepDef = { titleKey: "hp_welcome", descKey: "hp_tour_welcome" };
const HELP: StepDef = { sel: ".cz-help-btn", titleKey: "hp_step_help", descKey: "hp_tour_help" };
const MENU: StepDef = { sel: ".cz-user", titleKey: "hp_step_menu", descKey: "hp_tour_menu" };

const TOURS: Record<HelpRole, StepDef[]> = {
  admin: [
    WELCOME,
    { nav: "/", descKey: "hp_tour_admin_1" },
    { nav: "/exceptions", descKey: "hp_tour_admin_2" },
    { nav: "/reports", descKey: "hp_tour_admin_3" },
    { nav: "/settings", descKey: "hp_tour_admin_4" },
    HELP,
    MENU,
  ],
  sales: [
    WELCOME,
    { nav: "/customers", descKey: "hp_tour_sales_1" },
    { nav: "/rates", descKey: "hp_tour_sales_2" },
    { nav: "/quotations", descKey: "hp_tour_sales_3" },
    { nav: "/pipeline", descKey: "hp_tour_sales_4" },
    HELP,
    MENU,
  ],
  ops: [
    WELCOME,
    { nav: "/jobs", descKey: "hp_tour_ops_1" },
    { nav: "/shipments", descKey: "hp_tour_ops_2" },
    { nav: "/boxes", descKey: "hp_tour_ops_3" },
    { nav: "/docs", descKey: "hp_tour_ops_4" },
    HELP,
    MENU,
  ],
  marketing: [
    WELCOME,
    { nav: "/leads", descKey: "hp_tour_marketing_1" },
    { nav: "/customers", descKey: "hp_tour_marketing_2" },
    { nav: "/quotations", descKey: "hp_tour_marketing_3" },
    { nav: "/reports/marketing", descKey: "hp_tour_marketing_4" },
    HELP,
    MENU,
  ],
  cs: [
    WELCOME,
    { nav: "/cases", descKey: "hp_tour_cs_1" },
    { nav: "/inbox", descKey: "hp_tour_cs_2" },
    { nav: "/jobs", descKey: "hp_tour_cs_3" },
    { nav: "/customers", descKey: "hp_tour_cs_4" },
    HELP,
    MENU,
  ],
  finance: [
    WELCOME,
    { nav: "/invoices", descKey: "hp_tour_finance_1" },
    { nav: "/vendor-bills", descKey: "hp_tour_finance_2" },
    { nav: "/reports", descKey: "hp_tour_finance_3" },
    { nav: "/jobs", descKey: "hp_tour_finance_4" },
    HELP,
    MENU,
  ],
};

/** Server key for a role's tour. Bump the version when a tour changes enough to re-show it. */
const TOUR_VERSION: Partial<Record<HelpRole, number>> = { cs: 2 };
export const tourKeyFor = (role: HelpRole) => (TOUR_VERSION[role] ? `role-${role}-v${TOUR_VERSION[role]}` : `role-${role}`);

/** Element if it is actually on screen (the mobile sidebar drawer is off-canvas when closed). */
function visible(sel: string): HTMLElement | null {
  const el = document.querySelector<HTMLElement>(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0 || r.right <= 0 || r.left >= window.innerWidth) return null;
  return el;
}

/** Automated browsers (E2E, screenshots) don't get the auto-start unless forced with ?tour=1. */
function autoStartAllowed() {
  try {
    if (new URLSearchParams(window.location.search).get("tour") === "1") return true;
  } catch {
    /* ignore */
  }
  return !navigator.webdriver;
}

/**
 * First-run tour per role (antd Tour). Auto-starts once per user (progress stored server-side,
 * so it doesn't re-show on another device); replay via startOnboardingTour().
 */
export function OnboardingTour() {
  const { user } = useAuth();
  const { tx } = useStore();
  const qc = useQueryClient();
  const mobile = useMedia("(max-width: 1024px)");
  const role = helpRoleFromRoles(user?.roles);
  const tourKey = role ? tourKeyFor(role) : null;
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(0);
  const autoStarted = useRef(false);

  const progress = useQuery({
    queryKey: ["onboarding", user?.id],
    queryFn: fetchOnboarding,
    enabled: Boolean(user && role),
    staleTime: Infinity,
    retry: false,
  });

  useEffect(() => {
    if (!tourKey || !progress.data || autoStarted.current) return;
    if (progress.data.completed[tourKey] || !autoStartAllowed()) return;
    const t = window.setTimeout(() => {
      autoStarted.current = true;
      setCurrent(0);
      setOpen(true);
    }, 900);
    return () => window.clearTimeout(t);
  }, [tourKey, progress.data]);

  useEffect(() => {
    const onStart = () => {
      setCurrent(0);
      setOpen(true);
    };
    window.addEventListener(TOUR_EVENT, onStart);
    return () => window.removeEventListener(TOUR_EVENT, onStart);
  }, []);

  function close() {
    setOpen(false);
    if (!tourKey || progress.data?.completed[tourKey]) return;
    completeTour(tourKey)
      .then(() => qc.invalidateQueries({ queryKey: ["onboarding", user?.id] }))
      .catch(() => {
        /* offline — it simply shows again next time */
      });
  }

  const steps: TourProps["steps"] = useMemo(() => {
    if (!role) return [];
    const defs = TOURS[role];
    const roleName = tx(`hp_role_${role}`);
    return defs.map((d, i) => {
      const last = i === defs.length - 1;
      const labelKey = d.nav ? navLabelKey(d.nav) : null;
      const menu = labelKey ? tx(labelKey) : "";
      const title = d.titleKey ? tx(d.titleKey) : menu;
      const navSel = d.nav ? `.cz-nav a[href="${d.nav}"]` : null;
      const desc = tx(d.descKey, { role: roleName });
      return {
        title,
        description:
          navSel && mobile ? (
            <>
              {desc}
              <span className="cz-tour-hint">{tx("hp_tour_mobileNav", { menu })}</span>
            </>
          ) : (
            desc
          ),
        // Menu steps point at the sidebar item; on phones (sidebar closed) at the ☰ button.
        target: () => (navSel ? visible(navSel) ?? visible(".cz-top button[aria-expanded]") : d.sel ? visible(d.sel) : null) as HTMLElement,
        placement: navSel && !mobile ? "right" : "bottom",
        nextButtonProps: { children: last ? tx("hp_done") : tx("hp_next") },
        prevButtonProps: { children: tx("hp_prev") },
      };
    });
  }, [role, tx, mobile]);

  if (!role || !steps?.length) return null;

  return (
    <Tour
      open={open}
      current={current}
      onChange={setCurrent}
      onClose={close}
      steps={steps}
      rootClassName="cz-tour"
      actionsRender={(origin, { current: c, total }) => (
        <>
          {c < total - 1 ? (
            <Button size="small" type="text" className="cz-tour-skip" onClick={close}>
              {tx("hp_skip")}
            </Button>
          ) : null}
          {origin}
        </>
      )}
    />
  );
}
