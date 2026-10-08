/* "Photo credits" link → modal listing public/demo/credits.json (several demo photos are CC BY / CC BY-SA). */
import { ArrowSquareOut, Camera } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Button, Modal } from "antd";
import { useState } from "react";
import { useStore } from "../../store";
import type { PhotoCredit } from "../lib/photos.ts";
import { ErrorState, LoadingState } from "./states.tsx";
import "./photos.css";

async function fetchCredits(): Promise<PhotoCredit[]> {
  const res = await fetch("/demo/credits.json");
  if (!res.ok) throw new Error(`credits_${res.status}`);
  return (await res.json()) as PhotoCredit[];
}

export function PhotoCreditsLink({ className }: { className?: string }) {
  const { tx } = useStore();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="link" size="small" className={className} icon={<Camera size={14} />} onClick={() => setOpen(true)}>
        {tx("ph_credits")}
      </Button>
      <Modal open={open} onCancel={() => setOpen(false)} footer={null} title={tx("ph_credits")} width={640} destroyOnHidden>
        <CreditList />
      </Modal>
    </>
  );
}

function CreditList() {
  const { tx } = useStore();
  const q = useQuery({ queryKey: ["demo-photo-credits"], queryFn: fetchCredits, staleTime: Infinity });
  if (q.isLoading) return <LoadingState />;
  if (q.isError || !q.data) return <ErrorState title={tx("inb_error")} />;
  return (
    <ul className="ph-credits">
      {q.data.map((c) => {
        const own = !c.licenseUrl;
        const changes = own ? tx("ph_own_work") : /crop/i.test(c.changes) ? tx("ph_changes_crop") : tx("ph_changes_resize");
        return (
          <li key={c.file} className="ph-credit">
            <img src={`/demo/${c.file}`} alt={c.title} width={64} height={48} loading="lazy" decoding="async" />
            <span className="ph-credit-text">
              <strong title={c.title}>{c.title}</strong>
              <span className="ph-credit-meta">
                <span>{c.author}</span>
                {own ? null : (
                  <a href={c.licenseUrl} target="_blank" rel="noreferrer license">
                    {c.license}
                  </a>
                )}
                <span className="ph-credit-changes">{changes}</span>
              </span>
            </span>
            {c.source ? (
              <a className="ph-credit-src" href={c.source} target="_blank" rel="noreferrer" aria-label={`${tx("ph_source")}: ${c.title}`} title={tx("ph_source")}>
                <ArrowSquareOut size={16} aria-hidden />
              </a>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
