import { Drawer } from "antd";
import { PlayCircle, Question, Compass } from "@phosphor-icons/react";
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { useStore } from "../../store";
import { useMedia } from "../../ui/useMedia";
import { departmentFromRoles, v2NavGroups } from "../navConfig.ts";
import "./help.css";

/** The five staff roles that get their own first-run tour and tutorial video. */
export type HelpRole = "admin" | "sales" | "ops" | "cs" | "finance";

/** Department from the signed-in user's roles; customer service gets its own tour (menu = ops). */
export function helpRoleFromRoles(roles: readonly string[] | undefined | null): HelpRole | null {
  const dept = departmentFromRoles(roles);
  if (!dept) return null;
  if (dept === "ops" && roles?.includes("CUSTOMER_SERVICE") && !roles.includes("OPERATIONS")) return "cs";
  return dept;
}

/** Tutorial videos served from public/tutorials (copied from docs/tutorials). */
export const TUTORIAL_VIDEO: Record<HelpRole, string> = {
  admin: "/tutorials/admin.mp4",
  sales: "/tutorials/sales.mp4",
  ops: "/tutorials/ops.mp4",
  cs: "/tutorials/cs.mp4",
  finance: "/tutorials/finance.mp4",
};

/** Fired by the user menu ("แนะนำการใช้งาน") and the help drawer; OnboardingTour listens. */
export const TOUR_EVENT = "cz:onboarding-tour";
export function startOnboardingTour() {
  window.dispatchEvent(new Event(TOUR_EVENT));
}

/** Route → help content key (hp_r_<key>_<n>) and bullet count. */
const HELP_ROUTES: Record<string, { key: string; n: number; nav: string }> = {
  "/": { key: "overview", n: 3, nav: "/" },
  "/exceptions": { key: "exceptions", n: 3, nav: "/exceptions" },
  "/tasks": { key: "tasks", n: 3, nav: "/tasks" },
  "/inbox": { key: "inbox", n: 3, nav: "/inbox" },
  "/calendar": { key: "calendar", n: 3, nav: "/calendar" },
  "/leads": { key: "leads", n: 3, nav: "/leads" },
  "/pipeline": { key: "pipeline", n: 3, nav: "/pipeline" },
  "/customers": { key: "customers", n: 3, nav: "/customers" },
  "/contacts": { key: "contacts", n: 3, nav: "/contacts" },
  "/rates": { key: "rates", n: 4, nav: "/rates" },
  "/quotations": { key: "quotations", n: 3, nav: "/quotations" },
  "/jobs": { key: "jobs", n: 3, nav: "/jobs" },
  "/shipments": { key: "shipments", n: 3, nav: "/shipments" },
  "/boxes": { key: "boxes", n: 3, nav: "/boxes" },
  "/yard": { key: "yard", n: 3, nav: "/yard" },
  "/docs": { key: "docs", n: 3, nav: "/docs" },
  "/invoices": { key: "invoices", n: 3, nav: "/invoices" },
  "/vendor-bills": { key: "vendorbills", n: 3, nav: "/vendor-bills" },
  "/vendors": { key: "vendors", n: 3, nav: "/vendors" },
  "/reports": { key: "reports", n: 3, nav: "/reports" },
  "/automation": { key: "automation", n: 3, nav: "/automation" },
  "/notifications": { key: "notifications", n: 3, nav: "/notifications" },
  "/settings": { key: "settings", n: 3, nav: "/settings" },
};

/** Help entry for a pathname: exact main route, else its first segment (detail pages share the list help). */
export function helpForPath(pathname: string) {
  if (HELP_ROUTES[pathname]) return HELP_ROUTES[pathname];
  const first = "/" + (pathname.split("/")[1] ?? "");
  return HELP_ROUTES[first] ?? null;
}

export function navLabelKey(path: string) {
  for (const g of v2NavGroups) for (const item of g.items) if (item.path === path) return item.labelKey;
  return null;
}

type Props = {
  /** Route to show help for (e.g. "/jobs"); defaults to the current location. */
  helpKey?: string;
};

/** Small "?" button for the page header: opens a drawer with 3–4 how-to bullets, the role video and the tour. */
export function HelpButton({ helpKey }: Props) {
  const { tx } = useStore();
  const { user } = useAuth();
  const location = useLocation();
  const mobile = useMedia("(max-width: 640px)");
  const [open, setOpen] = useState(false);
  const [video, setVideo] = useState(false);

  const help = helpForPath(helpKey ?? location.pathname);
  if (!help || !user) return null;
  const role = helpRoleFromRoles(user.roles);
  const labelKey = navLabelKey(help.nav);
  const bullets = Array.from({ length: help.n }, (_, i) => tx(`hp_r_${help.key}_${i + 1}`));

  return (
    <>
      <button
        type="button"
        className="cz-help-btn"
        onClick={() => setOpen(true)}
        aria-label={tx("hp_btn")}
        title={tx("hp_btn")}
        aria-haspopup="dialog"
      >
        <Question size={18} weight="bold" aria-hidden />
      </button>
      <Drawer
        open={open}
        onClose={() => {
          setOpen(false);
          setVideo(false);
        }}
        width={mobile ? "100%" : 400}
        title={
          <span className="cz-help-title">
            <Question size={18} weight="fill" aria-hidden />
            {tx("hp_drawerTitle")}
            {labelKey ? <em>· {tx(labelKey)}</em> : null}
          </span>
        }
        destroyOnHidden
      >
        <ol className="cz-help-list">
          {bullets.map((b, i) => (
            <li key={i}>
              <span className="cz-help-num" aria-hidden>
                {i + 1}
              </span>
              <span>{b}</span>
            </li>
          ))}
        </ol>

        {role ? (
          <div className="cz-help-video">
            {video ? (
              <video src={TUTORIAL_VIDEO[role]} controls autoPlay playsInline preload="metadata" aria-label={tx("hp_video", { role: tx(`hp_role_${role}`) })} />
            ) : (
              <button type="button" className="cz-help-action" onClick={() => setVideo(true)}>
                <PlayCircle size={22} weight="fill" aria-hidden />
                {tx("hp_video", { role: tx(`hp_role_${role}`) })}
              </button>
            )}
          </div>
        ) : null}

        {role ? (
          <button
            type="button"
            className="cz-help-action is-quiet"
            onClick={() => {
              setOpen(false);
              setVideo(false);
              startOnboardingTour();
            }}
          >
            <Compass size={20} aria-hidden />
            {tx("hp_replay")}
          </button>
        ) : null}
      </Drawer>
    </>
  );
}
