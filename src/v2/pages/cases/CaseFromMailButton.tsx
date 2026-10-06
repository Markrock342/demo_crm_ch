import { Lifebuoy } from "@phosphor-icons/react";
import { Button } from "antd";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../../../store";
import { useCan } from "../../hooks/useCan.ts";
import { CaseCreateDrawer } from "./CaseCreateDrawer.tsx";

/** Inbox action: open a case prefilled from the mail (subject, body, customer, sender's contact). */
export function CaseFromMailButton({
  mail,
}: {
  mail: { id: string; subject: string; body: string; customerId?: string | null; from?: string | null };
}) {
  const { tx } = useStore();
  const can = useCan();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  if (!can("case.edit")) return null;
  const fromEmail = mail.from?.match(/[^\s<>()]+@[^\s<>()]+/)?.[0];
  return (
    <>
      <Button icon={<Lifebuoy size={16} />} onClick={() => setOpen(true)}>
        {tx("cs_from_mail")}
      </Button>
      <CaseCreateDrawer
        open={open}
        onClose={() => setOpen(false)}
        prefill={{
          subject: mail.subject,
          description: mail.body,
          customerId: mail.customerId ?? undefined,
          fromEmail,
          sourceMailId: /^[\w-]+$/.test(mail.id) ? mail.id : undefined,
          channel: "email",
        }}
        onCreated={(c) => navigate(`/cases/${c.id}`)}
      />
    </>
  );
}
