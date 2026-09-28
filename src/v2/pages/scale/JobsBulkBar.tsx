import { DownloadSimple, UserSwitch, X } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { App, Button, Popover, Radio, Select } from "antd";
import { useState } from "react";
import { JOB_BULK_STATUSES, bulkJobOwner, bulkJobStatus } from "../../../api/lists.ts";
import { useStore } from "../../../store";
import { useCan } from "../../hooks/useCan.ts";
import { userDisplayName, useUserLookup } from "../../hooks/useUserLookup.ts";
import "./scale.css";

/** Selection bar for the jobs list: set status · assign owner · export CSV (permission-gated). */
export function JobsBulkBar({ ids, onClear, exportHref }: { ids: string[]; onClear: () => void; exportHref: string }) {
  const { tx, locale } = useStore();
  const { message, modal } = App.useApp();
  const can = useCan();
  const qc = useQueryClient();
  const { users } = useUserLookup();
  const [busy, setBusy] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [field, setField] = useState<"sales" | "ops">("ops");
  const [person, setPerson] = useState<string | undefined>();
  const edit = can("shipment.edit");

  const done = (n: number) => {
    message.success(tx("sc_updated", { n }));
    void qc.invalidateQueries({ queryKey: ["jobs"] });
    onClear();
  };
  const fail = (e: unknown) => message.error(tx("sc_failed", { err: e instanceof Error ? e.message : "" }));

  const setStatus = (status: (typeof JOB_BULK_STATUSES)[number]) =>
    modal.confirm({
      title: tx("sc_confirmStatus", { n: ids.length, status: tx(`sc_js_${status}`) }),
      okText: tx("sc_apply"),
      cancelText: tx("cancel"),
      onOk: async () => {
        setBusy(true);
        try {
          done((await bulkJobStatus(ids, status)).updated);
        } catch (e) {
          fail(e);
        } finally {
          setBusy(false);
        }
      },
    });

  const assign = async () => {
    setBusy(true);
    try {
      done((await bulkJobOwner(ids, field, person === "__none" ? null : (person ?? null))).updated);
      setAssignOpen(false);
      setPerson(undefined);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sc-bulk" role="region" aria-label={tx("sc_selected", { n: ids.length })}>
      <span className="sc-bulk-n">{tx("sc_selected", { n: ids.length })}</span>
      {edit ? (
        <Select
          value={null}
          placeholder={tx("sc_setStatus")}
          aria-label={tx("sc_setStatus")}
          disabled={busy}
          onChange={(v) => v && setStatus(v)}
          options={JOB_BULK_STATUSES.map((s) => ({ value: s, label: tx(`sc_js_${s}`) }))}
        />
      ) : null}
      {edit ? (
        <Popover
          trigger="click"
          open={assignOpen}
          onOpenChange={setAssignOpen}
          content={
            <div className="sc-assign">
              <Radio.Group
                value={field}
                onChange={(e) => setField(e.target.value as "sales" | "ops")}
                options={[
                  { value: "ops", label: tx("sc_assignOps") },
                  { value: "sales", label: tx("sc_assignSales") },
                ]}
              />
              <Select
                showSearch
                optionFilterProp="label"
                value={person}
                placeholder={tx("sc_pickPerson")}
                onChange={setPerson}
                options={[
                  { value: "__none", label: tx("sc_unassigned") },
                  ...users.map((u) => ({ value: u.id, label: userDisplayName(u, locale) || u.email })),
                ]}
              />
              <Button type="primary" disabled={!person} loading={busy} onClick={() => void assign()}>
                {tx("sc_apply")}
              </Button>
            </div>
          }
        >
          <Button icon={<UserSwitch size={16} aria-hidden />} disabled={busy}>
            {tx("sc_assign")}
          </Button>
        </Popover>
      ) : null}
      <Button icon={<DownloadSimple size={16} aria-hidden />} href={exportHref}>
        {tx("sc_exportSelected")}
      </Button>
      <Button type="text" icon={<X size={16} aria-hidden />} onClick={onClear} aria-label={tx("sc_clear")} />
    </div>
  );
}
