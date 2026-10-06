import { Gear, House, LockSimple } from "@phosphor-icons/react";
import { Button } from "antd";
import { useNavigate } from "react-router-dom";
import type { ModuleKey } from "../../api/modules.ts";
import { useAuth } from "../../auth/AuthProvider";
import { useStore } from "../../store";
import { IconBadge } from "../components";
import { MODULE_LOOK } from "../lib/moduleLook.ts";
import "../../pages/settings/modules.css";

/** Shown instead of a page whose module the company has turned off. Admins get a link to Settings › Modules. */
export function ModuleOffPage({ module }: { module: ModuleKey }) {
  const { tx } = useStore();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = Boolean(user && (user.roles.includes("SUPER_ADMIN") || user.permissions.includes("user.manage")));
  const look = MODULE_LOOK[module];

  return (
    <div className="md-offpage">
      <div className="md-offcard" role="status">
        <span className="md-officon">
          <IconBadge icon={look.icon} tone="neutral" size={72} />
          <span className="md-offlock" aria-hidden>
            <LockSimple size={15} weight="bold" />
          </span>
        </span>
        <h1>{tx("md_off_title")}</h1>
        <p>{tx("md_off_desc", { module: tx(`md_name_${module}`) })}</p>
        {!isAdmin ? <p className="md-card-desc">{tx("md_off_ask")}</p> : null}
        <div className="md-offactions">
          {isAdmin ? (
            <Button type="primary" icon={<Gear size={16} aria-hidden />} onClick={() => navigate("/settings#settings-modules")}>
              {tx("md_off_open")}
            </Button>
          ) : null}
          <Button icon={<House size={16} aria-hidden />} onClick={() => navigate("/")}>
            {tx("md_off_home")}
          </Button>
        </div>
      </div>
    </div>
  );
}
