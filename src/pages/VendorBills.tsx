import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  approveVendorBill,
  createVendorBillFromJob,
  fetchJobCharges,
  fetchVendorBills,
  fetchVendors,
  type VendorBillRow,
} from "../api/commercial.ts";
import { useAuth } from "../auth/AuthProvider.tsx";
import { useStore } from "../store.tsx";
import { DemoModuleBanner } from "../ui/DemoModuleBanner.tsx";
import { PageToolbar } from "../ui/PageToolbar.tsx";

type ChargeRow = {
  id: string;
  chargeType: string;
  description: string;
  totalAmount: string;
  invoiced: boolean;
  billed?: boolean;
  vendorId?: string | null;
  currency: string;
};

export function VendorBillsPage() {
  const { tx } = useStore();
  const { mode, user } = useAuth();
  const isDemo = mode === "demo";
  const [params] = useSearchParams();
  const jobId = params.get("jobId");

  const [bills, setBills] = useState<VendorBillRow[]>([]);
  const [charges, setCharges] = useState<ChargeRow[]>([]);
  const [vendors, setVendors] = useState<Array<{ id: string; company: string }>>([]);
  const [vendorId, setVendorId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const vendorMap = useMemo(() => Object.fromEntries(vendors.map((v) => [v.id, v.company])), [vendors]);

  const costCharges = useMemo(
    () => charges.filter((c) => c.chargeType === "COST"),
    [charges],
  );

  const load = useCallback(async () => {
    if (isDemo) {
      setBills([]);
      return;
    }
    if (mode !== "production" || !user) return;
    setBills(await fetchVendorBills(jobId ? { jobId } : undefined));
    setVendors(await fetchVendors());
  }, [isDemo, jobId, mode, user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!jobId || isDemo || mode !== "production") return;
    void fetchJobCharges(jobId).then((rows) => {
      setCharges(rows);
      const firstVendor = rows.find((c) => c.chargeType === "COST" && c.vendorId)?.vendorId;
      if (firstVendor) setVendorId(firstVendor);
      setSelected(rows.filter((c) => c.chargeType === "COST" && !c.billed).map((c) => c.id));
    });
  }, [jobId, isDemo, mode]);

  async function act(fn: () => Promise<unknown>, okKey: string) {
    try {
      await fn();
      setMsg(tx(okKey));
      await load();
      if (jobId) setCharges(await fetchJobCharges(jobId));
    } catch {
      setMsg(tx("errorSave"));
    }
  }

  function toggleCharge(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function createBill() {
    if (!jobId || !vendorId || !selected.length) return;
    await act(
      () => createVendorBillFromJob({ jobId, vendorId, chargeIds: selected }),
      "vendorBillCreated",
    );
  }

  const canCreate = Boolean(user?.permissions.includes("vendor_bill.create"));
  const canApprove = Boolean(user?.permissions.includes("vendor_bill.approve"));

  return (
    <div className="page page--workspace">
      <PageToolbar
        title={tx("vendorBillsTitle")}
        count={bills.length}
        hint={isDemo ? tx("vendorBillsDemoHint") : tx("vendorBillsHint")}
      />
      {isDemo ? <DemoModuleBanner /> : null}
      {msg ? (
        <p className="meta" role="status">
          {msg}
        </p>
      ) : null}

      {!isDemo && jobId ? (
        <section className="panel" aria-labelledby="vb-from-job">
          <h2 id="vb-from-job">{tx("createVendorBillFromJob")}</h2>
          <label className="field">
            <span>{tx("colVendor")}</span>
            <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} required>
              <option value="">{tx("selectVendor")}</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.company}
                </option>
              ))}
            </select>
          </label>
          {costCharges.length === 0 ? (
            <p className="empty">{tx("emptyCostCharges")}</p>
          ) : (
            <ul className="list-plain">
              {costCharges.map((c) => (
                <li key={c.id}>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={selected.includes(c.id)}
                      disabled={Boolean(c.billed)}
                      onChange={() => toggleCharge(c.id)}
                    />
                    <span>
                      {c.description} — {c.totalAmount} {c.currency}
                      {c.billed ? ` (${tx("billed")})` : ""}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {canCreate ? (
            <button type="button" className="btn btn-primary" disabled={!vendorId || !selected.length} onClick={() => void createBill()}>
              {tx("createVendorBill")}
            </button>
          ) : null}
        </section>
      ) : null}

      {bills.length === 0 ? (
        <p className="empty">{tx("emptyVendorBills")}</p>
      ) : (
        <div className="table-shell">
          <table className="data-table ledger">
            <thead>
              <tr>
                <th scope="col">{tx("colBillNumber")}</th>
                <th scope="col">{tx("colVendor")}</th>
                <th scope="col">{tx("navJobs")}</th>
                <th scope="col" className="num">
                  {tx("colTotal")}
                </th>
                <th scope="col">{tx("colStatus")}</th>
                <th scope="col">{tx("colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {bills.map((b) => (
                <tr key={b.id}>
                  <td className="cell-strong">{b.billNumber}</td>
                  <td>{vendorMap[b.vendorId] ?? b.vendorId}</td>
                  <td>
                    {b.jobId ? (
                      <Link to={`/jobs?selected=${b.jobId}`}>{b.jobId}</Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="num">
                    {b.total} {b.currency}
                  </td>
                  <td>
                    <span className="pill pill-yard">{b.status}</span>
                  </td>
                  <td>
                    {b.status === "DRAFT" && canApprove ? (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => void act(() => approveVendorBill(b.id), "vendorBillApproved")}
                      >
                        {tx("approveVendorBill")}
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
