import {
  CalendarBlank,
  ChatCircleText,
  Copy,
  CreditCard,
  EnvelopeSimple,
  Globe,
  IdentificationCard,
  Key,
  MapPin,
  Megaphone,
  Note,
  Package,
  Phone,
  ShieldCheck,
  Snowflake,
  Star,
  Tag,
  Trash,
  Wallet,
  Warning,
  WechatLogo,
} from "@phosphor-icons/react";
import { Alert, Button, Modal, Popconfirm, Tooltip, message } from "antd";
import { useState, type ReactNode } from "react";
import { issuePortalAccessCode, revokePortalAccess, type CustomerDetail } from "../../api/crm.ts";
import { EmailPortalCodeButton } from "./EmailPortalCodeButton.tsx";
import type { Contact } from "../../crm";
import { useStore } from "../../store";
import { Flag, IconBadge, Panel, PersonAvatar, RouteTrack, StatusTag } from "../components";
import { fmtDate } from "../lib/format.ts";
import { BUSINESS_ICON, CURRENCY_FLAG, STATUS_TONE } from "./CustomerForm.tsx";
import { fmtAmount, portName } from "./salesUtil.ts";
import "./customer-form.css";

type Fact = { icon: ReactNode; label: string; value: ReactNode };

function Facts({ items }: { items: Fact[] }) {
  return (
    <dl className="cp-facts">
      {items.map((f) => (
        <div key={f.label} className="cp-fact">
          {f.icon}
          <dt>{f.label}</dt>
          <dd>{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function copy(text: string, done: string) {
  void navigator.clipboard?.writeText(text).then(
    () => message.success(done),
    () => undefined,
  );
}

function CopyValue({ value, mono }: { value: string; mono?: boolean }) {
  const { tx } = useStore();
  return (
    <span className="cp-copy">
      <span className={mono ? "cz-mono" : undefined}>{value}</span>
      <Tooltip title={tx("cust_copy")}>
        <Button type="text" size="small" icon={<Copy size={14} />} aria-label={tx("cust_copy")} onClick={() => copy(value, tx("cust_copied"))} />
      </Tooltip>
    </span>
  );
}

const has = (v: unknown) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0);

/** Status + business type + industry / source / website / notes. */
export function CompanyPanel({ c }: { c: CustomerDetail }) {
  const { tx, locale } = useStore();
  const BizIcon = c.businessType ? BUSINESS_ICON[c.businessType] : undefined;
  const items: Fact[] = [];
  if (c.industry) items.push({ icon: <Tag size={18} aria-hidden />, label: tx("cust_industry"), value: c.industry });
  if (c.leadSource) items.push({ icon: <Megaphone size={18} aria-hidden />, label: tx("cust_leadSource"), value: tx(`cust_src_${c.leadSource}`) });
  if (c.website) {
    const href = /^https?:\/\//i.test(c.website) ? c.website : `https://${c.website}`;
    items.push({
      icon: <Globe size={18} aria-hidden />,
      label: tx("cust_website"),
      value: (
        <a href={href} target="_blank" rel="noreferrer noopener">
          {c.website.replace(/^https?:\/\//i, "")}
        </a>
      ),
    });
  }
  if (c.notes) items.push({ icon: <Note size={18} aria-hidden />, label: tx("cust_notes"), value: <span className="cp-pre">{c.notes}</span> });
  if (c.createdAt) items.push({ icon: <CalendarBlank size={18} aria-hidden />, label: tx("cust_sinceLabel"), value: fmtDate(c.createdAt, locale) });
  return (
    <Panel
      title={tx("cust_secCompany")}
      extra={c.status && c.status !== "active" ? <StatusTag status={c.status} label={tx(`cust_st_${c.status}`)} tone={STATUS_TONE[c.status]} /> : undefined}
    >
      {BizIcon ? (
        <div className="cp-fact" style={{ marginBottom: 12 }}>
          <span className="cp-fact-icon">
            <IconBadge icon={BizIcon} tone="primary" size={28} />
          </span>
          <dt>{tx("cust_businessType")}</dt>
          <dd>
            <strong>{tx(`cust_bt_${c.businessType}`)}</strong>
          </dd>
        </div>
      ) : null}
      <Facts items={items} />
    </Panel>
  );
}

/** Tax ID, office, billing address, currency, credit, payment, billing email. */
export function BillingPanel({ c, onEdit }: { c: CustomerDetail; onEdit?: () => void }) {
  const { tx, locale } = useStore();
  const items: Fact[] = [];
  const country = c.country ?? undefined;
  if (c.taxId) {
    items.push({
      icon: country && country !== "OTHER" ? <Flag code={country} size={20} /> : <IdentificationCard size={18} aria-hidden />,
      label: tx("cust_taxId"),
      value: (
        <>
          <CopyValue value={c.taxId} mono />
          <div className="cp-badges">
            <span className="cp-chip">{c.branchNo ? tx("cust_branchLabel", { no: c.branchNo }) : tx("cust_headOffice")}</span>
          </div>
        </>
      ),
    });
  }
  if (c.billingAddress) {
    items.push({ icon: <MapPin size={18} aria-hidden />, label: tx("cust_billingAddress"), value: <span className="cp-pre">{c.billingAddress}</span> });
  }
  if (has(c.creditTermDays) || has(c.creditLimit) || c.currency) {
    const cur = c.currency ?? "THB";
    items.push({
      icon: <Wallet size={18} aria-hidden />,
      label: tx("cust_creditTerm"),
      value: (
        <div className="cp-badges">
          {c.currency ? (
            <span className="cp-chip is-strong">
              <Flag code={CURRENCY_FLAG[c.currency]} size={14} />
              {c.currency}
            </span>
          ) : null}
          {has(c.creditTermDays) ? <span className="cp-chip is-strong">{c.creditTermDays === 0 ? tx("cust_cash") : tx("cust_daysN", { n: c.creditTermDays! })}</span> : null}
          {has(c.creditLimit) ? (
            <Tooltip title={tx("cust_creditLimit")}>
              <span className="cp-chip">{fmtAmount(c.creditLimit, cur, locale)}</span>
            </Tooltip>
          ) : null}
        </div>
      ),
    });
  }
  if (c.paymentMethod) items.push({ icon: <CreditCard size={18} aria-hidden />, label: tx("cust_paymentMethod"), value: tx(`cust_pm_${c.paymentMethod}`) });
  if (c.billingEmail) {
    items.push({
      icon: <EnvelopeSimple size={18} aria-hidden />,
      label: tx("cust_billingEmail"),
      value: <a href={`mailto:${c.billingEmail}`}>{c.billingEmail}</a>,
    });
  }
  return (
    <Panel title={tx("cust_secBilling")}>
      {items.length ? (
        <Facts items={items} />
      ) : (
        <div className="cp-empty">
          <span>{tx("cust_emptyBilling")}</span>
          {onEdit ? (
            <Button size="small" onClick={onEdit}>
              {tx("cust_addDetails")}
            </Button>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

/** Usual lanes with flags, container chips, commodities, Incoterms, customs, handling. */
export function ShippingPanel({ c, onEdit }: { c: CustomerDetail; onEdit?: () => void }) {
  const { tx, locale } = useStore();
  const lanes = c.preferredLanes ?? [];
  const items: Fact[] = [];
  if (c.containerTypes?.length) {
    items.push({
      icon: <Package size={18} aria-hidden />,
      label: tx("cust_containerTypes"),
      value: (
        <div className="cp-badges">
          {c.containerTypes.map((t) => (
            <span key={t} className="cp-chip is-strong">
              {t.includes("RF") ? <Snowflake size={12} aria-hidden /> : null}
              {t}
            </span>
          ))}
        </div>
      ),
    });
  }
  if (c.commodities?.length) {
    items.push({
      icon: <Tag size={18} aria-hidden />,
      label: tx("cust_commodities"),
      value: (
        <div className="cp-badges">
          {c.commodities.map((t) => (
            <span key={t} className="cp-chip">
              {t}
            </span>
          ))}
        </div>
      ),
    });
  }
  if (c.incoterms || c.customsBroker !== null) {
    items.push({
      icon: <ShieldCheck size={18} aria-hidden />,
      label: [c.incoterms ? tx("cust_incoterms") : null, c.customsBroker !== null ? tx("cust_customsBroker") : null].filter(Boolean).join(" · "),
      value: (
        <div className="cp-badges">
          {c.incoterms ? <span className="cp-chip is-strong">{c.incoterms}</span> : null}
          {c.customsBroker !== null && c.customsBroker !== undefined ? (
            <span className={`cp-chip${c.customsBroker ? " is-strong" : ""}`}>{c.customsBroker ? tx("cust_yes") : tx("cust_no")}</span>
          ) : null}
        </div>
      ),
    });
  }
  if (c.handlingNotes) {
    items.push({
      icon: <Warning size={18} weight="fill" style={{ color: "var(--warning)" }} aria-hidden />,
      label: tx("cust_handling"),
      value: <span className="cp-pre">{c.handlingNotes}</span>,
    });
  }
  const empty = !lanes.length && !items.length;
  return (
    <Panel title={tx("cust_secShipping")}>
      {empty ? (
        <div className="cp-empty">
          <span>{tx("cust_emptyShipping")}</span>
          {onEdit ? (
            <Button size="small" onClick={onEdit}>
              {tx("cust_addDetails")}
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="cz-stack" style={{ gap: 14 }}>
          {lanes.length ? (
            <div className="cp-lanes" aria-label={tx("cust_lanes")}>
              {lanes.map((l) => (
                <div key={`${l.pol}-${l.pod}`} className="cp-lane">
                  <RouteTrack from={l.pol} to={l.pod} fromName={portName(l.pol, locale)} toName={portName(l.pod, locale)} progress={null} size="sm" />
                </div>
              ))}
            </div>
          ) : null}
          {items.length ? <Facts items={items} /> : null}
        </div>
      )}
    </Panel>
  );
}

/** Contact cards with call / email / copy WeChat & LINE, make-primary and delete. */
export function ContactCards({
  contacts,
  canEdit,
  onSetPrimary,
  onDelete,
  footer,
}: {
  contacts: Contact[];
  canEdit: boolean;
  onSetPrimary: (p: Contact) => void;
  onDelete: (p: Contact) => void;
  footer?: ReactNode;
}) {
  const { tx } = useStore();
  return (
    <>
      <div className="cp-contacts">
        {contacts.map((p) => (
          <article key={p.id} className={`cp-contact${p.primary ? " is-primary" : ""}`} aria-label={p.name}>
            <div className="cp-contact-head">
              <PersonAvatar name={p.name} size={36} />
              <div className="cp-contact-name">
                <strong>
                  {p.name}
                  {p.primary ? <Star size={14} weight="fill" className="sales-primary-star" aria-label={tx("cust_primary")} /> : null}
                </strong>
                <span>{p.title || (p.primary ? tx("cust_primary") : "—")}</span>
              </div>
              <span className="sales-grow" />
              {canEdit && !p.primary ? (
                <Tooltip title={tx("cust_setPrimary")}>
                  <Button type="text" size="small" icon={<Star size={16} />} aria-label={tx("cust_setPrimary")} onClick={() => onSetPrimary(p)} />
                </Tooltip>
              ) : null}
              {canEdit ? (
                <Popconfirm title={tx("cust_deleteContactConfirm", { name: p.name })} okText={tx("cust_delete")} cancelText={tx("cust_cancel")} okButtonProps={{ danger: true }} onConfirm={() => onDelete(p)}>
                  <Button type="text" size="small" className="cf-icon-btn" icon={<Trash size={16} />} aria-label={tx("cust_removeContact")} />
                </Popconfirm>
              ) : null}
            </div>
            <div className="cp-contact-lines">
              {p.email ? (
                <a href={`mailto:${p.email}`}>
                  <EnvelopeSimple size={15} aria-hidden />
                  {p.email}
                </a>
              ) : null}
              {p.phone ? (
                <a href={`tel:${p.phone.replace(/\s+/g, "")}`}>
                  <Phone size={15} aria-hidden />
                  {p.phone}
                </a>
              ) : null}
              {p.wechat ? (
                <button type="button" onClick={() => copy(p.wechat, tx("cust_copied"))} aria-label={`${tx("cust_wechat")} ${p.wechat} — ${tx("cust_copy")}`}>
                  <WechatLogo size={15} aria-hidden />
                  {p.wechat}
                </button>
              ) : null}
              {p.lineId ? (
                <button type="button" onClick={() => copy(p.lineId!, tx("cust_copied"))} aria-label={`LINE ${p.lineId} — ${tx("cust_copy")}`}>
                  <ChatCircleText size={15} aria-hidden />
                  {p.lineId}
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      {footer ? <div className="cp-contacts-foot">{footer}</div> : null}
    </>
  );
}

/** Customer portal access: status, generate / rotate the access code (shown once), revoke. */
export function PortalAccessPanel({ c, canEdit, onChanged }: { c: CustomerDetail; canEdit: boolean; onChanged: () => void }) {
  const { tx } = useStore();
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ code: string; emails: string[] } | null>(null);
  const on = Boolean(c.portalAccess);

  async function generate() {
    setBusy(true);
    try {
      const res = await issuePortalAccessCode(c.id);
      setIssued({ code: res.code, emails: res.emails });
      onChanged();
    } catch {
      message.error(tx("cust_portalFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    try {
      await revokePortalAccess(c.id);
      message.success(tx("cust_portalRevoked"));
      onChanged();
    } catch {
      message.error(tx("cust_portalFailed"));
    } finally {
      setBusy(false);
    }
  }

  const generateBtn = on ? (
    <Popconfirm title={tx("cust_portalRotateConfirm")} okText={tx("cust_portalRotate")} cancelText={tx("cust_cancel")} onConfirm={() => void generate()}>
      <Button size="small" loading={busy}>
        {tx("cust_portalRotate")}
      </Button>
    </Popconfirm>
  ) : (
    <Button size="small" type="primary" loading={busy} onClick={() => void generate()} data-testid="portal-generate">
      {tx("cust_portalGenerate")}
    </Button>
  );

  return (
    <Panel title={tx("cust_portal")}>
      <div className="cp-portal">
        <IconBadge icon={Key} tone={on ? "success" : "neutral"} size={36} />
        <div className="cp-portal-body">
          <StatusTag status={on ? "ACTIVE" : "OFF"} label={on ? tx("cust_portalOn") : tx("cust_portalOff")} tone={on ? "success" : "neutral"} />
          <span className="cp-portal-hint">{tx("cust_portalHint")}</span>
        </div>
      </div>
      {canEdit ? (
        <div className="cp-portal-actions">
          {generateBtn}
          {on ? (
            <Popconfirm
              title={tx("cust_portalRevokeConfirm")}
              okText={tx("cust_portalRevoke")}
              cancelText={tx("cust_cancel")}
              okButtonProps={{ danger: true }}
              onConfirm={() => void revoke()}
            >
              <Button size="small" danger type="text" disabled={busy}>
                {tx("cust_portalRevoke")}
              </Button>
            </Popconfirm>
          ) : null}
        </div>
      ) : null}

      <Modal
        open={Boolean(issued)}
        title={tx("cust_portalCodeTitle")}
        onCancel={() => setIssued(null)}
        maskClosable={false}
        footer={
          <Button type="primary" onClick={() => setIssued(null)}>
            {tx("cust_done")}
          </Button>
        }
      >
        {issued ? (
          <div className="cz-stack" style={{ gap: 14 }}>
            <div className="cp-code">
              <span className="cz-mono" data-testid="portal-code">
                {issued.code}
              </span>
              <Button icon={<Copy size={16} />} onClick={() => copy(issued.code, tx("cust_copied"))}>
                {tx("cust_portalCopyCode")}
              </Button>
            </div>
            <Alert type="warning" showIcon message={tx("cust_portalCodeOnce")} />
            <EmailPortalCodeButton customerId={c.id} code={issued.code} count={issued.emails.length} />
            <div>
              <div className="cp-portal-hint" style={{ marginBottom: 6 }}>
                {tx("cust_portalEmails")}
              </div>
              {issued.emails.length ? (
                <div className="cp-badges">
                  {issued.emails.map((e) => (
                    <span key={e} className="cp-chip">
                      <EnvelopeSimple size={12} aria-hidden />
                      {e}
                    </span>
                  ))}
                </div>
              ) : (
                <Alert type="info" showIcon message={tx("cust_portalNoEmails")} />
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </Panel>
  );
}
