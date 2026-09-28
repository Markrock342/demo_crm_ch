import { FileXls } from "@phosphor-icons/react";
import { Button, Tooltip } from "antd";
import { useNavigate } from "react-router-dom";
import type { ImportEntity } from "../../lib/importer.ts";
import { useStore } from "../../store";
import { useCan } from "../hooks/useCan.ts";
import { useMedia } from "../../ui/useMedia";

const PERMS: Record<ImportEntity, string[]> = {
  customers: ["customer.create"],
  contacts: ["customer.edit", "customer.create"],
  rates: ["rate.create"],
  jobs: ["shipment.edit"],
};

/** "Import from Excel" page action → /import?entity=… (hidden without permission; icon-only on phones). */
export function ImportButton({ entity }: { entity: ImportEntity }) {
  const { tx } = useStore();
  const can = useCan();
  const navigate = useNavigate();
  const mobile = useMedia("(max-width: 640px)");
  if (!PERMS[entity].some(can)) return null;
  const label = tx("im_btn");
  const btn = (
    <Button icon={<FileXls size={16} aria-hidden />} aria-label={label} onClick={() => navigate(`/import?entity=${entity}`)}>
      {mobile ? null : label}
    </Button>
  );
  return mobile ? <Tooltip title={label}>{btn}</Tooltip> : btn;
}

/** True when the user may import at least one kind of list. */
export function useCanImport() {
  const can = useCan();
  return Object.values(PERMS).some((ps) => ps.some(can));
}

/** Settings entry to /import, shown when the user may import anything. */
export function ImportLink() {
  const { tx } = useStore();
  const navigate = useNavigate();
  if (!useCanImport()) return null;
  return (
    <div className="fin-setting-row">
      <div>
        <p className="fin-setting-label">{tx("im_btn")}</p>
      </div>
      <div className="fin-setting-value">
        <Button icon={<FileXls size={16} aria-hidden />} onClick={() => navigate("/import")}>
          {tx("im_title")}
        </Button>
      </div>
    </div>
  );
}
