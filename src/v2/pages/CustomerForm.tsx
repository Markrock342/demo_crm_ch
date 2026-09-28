import {
  AddressBook,
  ArrowRight,
  ArrowSquareIn,
  ArrowSquareOut,
  Boat,
  Buildings,
  CheckCircle,
  DotsThreeOutline,
  Factory,
  Globe,
  Handshake,
  Package,
  Plus,
  Receipt,
  Snowflake,
  Star,
  Trash,
  type Icon,
} from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Drawer, Form, Input, InputNumber, Radio, Segmented, Select, Tooltip, message } from "antd";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../../auth/AuthProvider";
import {
  ApiError,
  createCustomerRecord,
  fetchCrmBundle,
  updateCustomerRecord,
  type ContactInput,
  type CustomerDetail,
  type CustomerInput,
} from "../../api/crm.ts";
import {
  BUSINESS_TYPES,
  CONTAINER_TYPES,
  COUNTRIES,
  CREDIT_TERMS,
  CURRENCIES,
  CUSTOMER_STATUSES,
  INCOTERMS,
  LEAD_SOURCES,
  PAYMENT_METHODS,
  isValidEmail,
  isValidThaiTaxId,
  normalizeTaxId,
} from "../../lib/customerProfile.ts";
import { cityName } from "../../data";
import { useStore } from "../../store";
import { useMedia } from "../../ui/useMedia";
import { Flag, IconBadge, PersonAvatar } from "../components";
import { userDisplayName, useUserLookup } from "../hooks/useUserLookup.ts";
import { queryKeys } from "../queries/keys.ts";
import { SALES_PORTS, laneRoute, portName } from "./salesUtil.ts";
import "./sales.css";
import "./customer-form.css";

/* ── Vocabulary → icons / tones ─────────────────────── */

export const BUSINESS_ICON: Record<string, Icon> = {
  importer: ArrowSquareIn,
  exporter: ArrowSquareOut,
  manufacturer: Factory,
  trading: Handshake,
  forwarder: Boat,
  other: DotsThreeOutline,
};

export const STATUS_TONE: Record<string, "success" | "warning" | "neutral"> = {
  active: "success",
  on_hold: "warning",
  inactive: "neutral",
};

export const CURRENCY_FLAG: Record<string, string> = { THB: "TH", USD: "US", CNY: "CN" };

export const customerDetailKey = (id: string) => ["crm", "customer", id] as const;

/* ── Small form controls ────────────────────────────── */

type LaneRow = { pol?: string; pod?: string };
type ContactRow = {
  id?: string;
  name?: string;
  title?: string;
  email?: string;
  phone?: string;
  wechat?: string;
  lineId?: string;
  primary?: boolean;
};

type FormValues = {
  nameTh?: string;
  nameZh?: string;
  nameEn?: string;
  businessType?: string;
  status: string;
  ownerUserId?: string;
  website?: string;
  industry?: string;
  leadSource?: string;
  city?: string;
  notes?: string;
  country: string;
  taxId?: string;
  office: "head" | "branch";
  branchNo?: string;
  billingAddress?: string;
  currency: string;
  creditTermDays?: number;
  creditLimit?: number | null;
  paymentMethod?: string;
  billingEmail?: string;
  lanes: LaneRow[];
  containerTypes: string[];
  commodities: string[];
  incoterms?: string;
  customsBroker?: "yes" | "no";
  handlingNotes?: string;
  contacts: ContactRow[];
};

/** Single-choice cards with an icon (business type). */
function ChoiceCards({
  value,
  onChange,
  options,
  label,
}: {
  value?: string;
  onChange?: (v: string | undefined) => void;
  options: { value: string; label: string; icon: Icon }[];
  label: string;
}) {
  return (
    <div className="cf-choices" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const on = value === o.value;
        const I = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            className={`cf-choice${on ? " is-on" : ""}`}
            onClick={() => onChange?.(on ? undefined : o.value)}
          >
            <I size={20} weight={on ? "fill" : "duotone"} aria-hidden />
            <span>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Multi-select chips (container types). */
function ChipMulti({ value = [], onChange, options, label }: { value?: string[]; onChange?: (v: string[]) => void; options: readonly string[]; label: string }) {
  const toggle = (o: string) => onChange?.(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
  return (
    <div className="cf-chips" role="group" aria-label={label}>
      {options.map((o) => {
        const on = value.includes(o);
        const I = o.includes("RF") ? Snowflake : Package;
        return (
          <button key={o} type="button" aria-pressed={on} className={`cf-chip${on ? " is-on" : ""}`} onClick={() => toggle(o)}>
            <I size={14} weight={on ? "bold" : "regular"} aria-hidden />
            {o}
          </button>
        );
      })}
    </div>
  );
}

/** Port picker with flags — same options + look as the Rates page search. */
function PortPicker({ value, onChange, placeholder, label }: { value?: string; onChange?: (v: string | undefined) => void; placeholder: string; label: string }) {
  const { locale } = useStore();
  const options = useMemo(
    () =>
      SALES_PORTS.map((p) => ({
        value: p.code,
        search: [p.code, p.zh, p.th, p.en, ...(p.aliases ?? [])].join(" ").toLowerCase(),
        label: (
          <span className="sales-port-opt">
            <Flag code={p.code} size={20} />
            <strong>{p.code}</strong>
            <span>{p[locale]}</span>
          </span>
        ),
      })),
    [locale],
  );
  return (
    <Select
      showSearch
      allowClear
      aria-label={label}
      className="sales-port-select cf-port"
      placeholder={placeholder}
      value={value || undefined}
      onChange={(v) => onChange?.(v ?? undefined)}
      options={options}
      filterOption={(input, opt) => Boolean(opt?.search.includes(input.trim().toLowerCase()))}
    />
  );
}

function Section({ id, n, icon, tone, title, extra, children }: { id: string; n: number; icon: Icon; tone: "primary" | "info" | "accent" | "success"; title: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="cf-section" aria-labelledby={`${id}-h`}>
      <header className="cf-section-head">
        <IconBadge icon={icon} tone={tone} size={36} />
        <h3 id={`${id}-h`}>
          <span className="cf-step">{n}</span>
          {title}
        </h3>
        {extra ? <span className="cf-section-extra">{extra}</span> : null}
      </header>
      <div className="cf-section-body">{children}</div>
    </section>
  );
}

/* ── Mapping ───────────────────────────────────────── */

const trimOrNull = (v?: string | null) => {
  const s = (v ?? "").trim();
  return s ? s : null;
};

function initialValues(c: CustomerDetail | null | undefined, ownerId: string | undefined, locale: "zh" | "th" | "en"): FormValues {
  if (!c) {
    return {
      status: "active",
      ownerUserId: ownerId,
      country: "TH",
      office: "head",
      currency: "THB",
      creditTermDays: 30,
      lanes: [{}],
      containerTypes: [],
      commodities: [],
      contacts: [{ primary: true }],
    };
  }
  const typed = new Set(c.nameLangs ?? ["zh", "th", "en"]);
  let lanes: LaneRow[] = c.preferredLanes?.length ? c.preferredLanes.map((l) => ({ ...l })) : [];
  if (!lanes.length) {
    const r = laneRoute(c.laneZh) ?? laneRoute(c.laneEn);
    lanes = r?.from && r.to ? [{ pol: r.from, pod: r.to }] : [{}];
  }
  const city = cityName(c, locale);
  return {
    nameTh: typed.has("th") ? c.nameTh : undefined,
    nameZh: typed.has("zh") ? c.nameZh : undefined,
    nameEn: typed.has("en") ? c.nameEn : undefined,
    businessType: c.businessType ?? undefined,
    status: c.status || "active",
    ownerUserId: c.ownerUserId ?? undefined,
    website: c.website ?? undefined,
    industry: c.industry ?? undefined,
    leadSource: c.leadSource ?? undefined,
    city: city && city !== "—" ? city : undefined,
    notes: c.notes ?? undefined,
    country: c.country ?? "TH",
    taxId: c.taxId ?? undefined,
    office: c.branchNo ? "branch" : "head",
    branchNo: c.branchNo ?? undefined,
    billingAddress: c.billingAddress ?? undefined,
    currency: c.currency ?? "THB",
    creditTermDays: c.creditTermDays ?? undefined,
    creditLimit: c.creditLimit,
    paymentMethod: c.paymentMethod ?? undefined,
    billingEmail: c.billingEmail ?? undefined,
    lanes,
    containerTypes: c.containerTypes ?? [],
    commodities: c.commodities ?? [],
    incoterms: c.incoterms ?? undefined,
    customsBroker: c.customsBroker === true ? "yes" : c.customsBroker === false ? "no" : undefined,
    handlingNotes: c.handlingNotes ?? undefined,
    contacts: c.contacts?.length ? c.contacts.map((p) => ({ ...p })) : [{ primary: true }],
  };
}

const contactHasData = (p: ContactRow) => Boolean([p.name, p.title, p.email, p.phone, p.wechat, p.lineId].some((v) => (v ?? "").trim()));

function toPayload(v: FormValues, initial: FormValues, editing: boolean): CustomerInput {
  const lanes = (v.lanes ?? []).filter((l) => l.pol && l.pod).map((l) => ({ pol: l.pol!, pod: l.pod! }));
  const laneText = (loc: "zh" | "th" | "en") => {
    const l = lanes[0];
    return l ? `${portName(l.pol, loc) ?? l.pol} → ${portName(l.pod, loc) ?? l.pod}` : null;
  };
  const contacts: ContactInput[] = (v.contacts ?? []).filter(contactHasData).map((p) => ({
    ...(p.id ? { id: p.id } : {}),
    name: (p.name ?? "").trim(),
    title: trimOrNull(p.title),
    email: trimOrNull(p.email),
    phone: trimOrNull(p.phone),
    wechat: trimOrNull(p.wechat),
    lineId: trimOrNull(p.lineId),
    primary: Boolean(p.primary),
  }));
  const out: CustomerInput = {
    nameTh: trimOrNull(v.nameTh),
    nameZh: trimOrNull(v.nameZh),
    nameEn: trimOrNull(v.nameEn),
    businessType: v.businessType ?? null,
    status: v.status,
    ownerUserId: v.ownerUserId ?? null,
    website: trimOrNull(v.website),
    industry: trimOrNull(v.industry),
    leadSource: v.leadSource ?? null,
    notes: trimOrNull(v.notes),
    country: v.country,
    taxId: trimOrNull(normalizeTaxId(v.taxId)),
    branchNo: v.office === "branch" ? trimOrNull(v.branchNo) : null,
    billingAddress: trimOrNull(v.billingAddress),
    currency: v.currency,
    creditTermDays: v.creditTermDays ?? null,
    creditLimit: v.creditLimit ?? null,
    paymentMethod: v.paymentMethod ?? null,
    billingEmail: trimOrNull(v.billingEmail),
    preferredLanes: lanes,
    containerTypes: v.containerTypes ?? [],
    commodities: (v.commodities ?? []).map((s) => s.trim()).filter(Boolean),
    incoterms: v.incoterms ?? null,
    customsBroker: v.customsBroker === "yes" ? true : v.customsBroker === "no" ? false : null,
    handlingNotes: trimOrNull(v.handlingNotes),
    contacts,
  };
  // City is stored per language on older rows; only overwrite it when the person changed it.
  if (!editing || (v.city ?? "") !== (initial.city ?? "")) out.city = trimOrNull(v.city);
  if (lanes.length) {
    out.laneZh = laneText("zh");
    out.laneTh = laneText("th");
    out.laneEn = laneText("en");
  }
  return out;
}

/* ── Drawer ────────────────────────────────────────── */

const SECTIONS = [
  { id: "cf-company", icon: Buildings, tone: "primary" as const, key: "cust_secCompany" },
  { id: "cf-billing", icon: Receipt, tone: "info" as const, key: "cust_secBilling" },
  { id: "cf-shipping", icon: Boat, tone: "accent" as const, key: "cust_secShipping" },
  { id: "cf-contacts", icon: AddressBook, tone: "success" as const, key: "cust_secContacts" },
];

/** Keeps the shared customer lists (store + lookup) in step after a save. */
export function useRefreshCrm() {
  const qc = useQueryClient();
  const { hydrateCrm } = useStore();
  return async (saved?: CustomerDetail) => {
    if (saved) qc.setQueryData(customerDetailKey(saved.id), saved);
    const bundle = await qc.fetchQuery({ queryKey: queryKeys.crm.bundle, queryFn: fetchCrmBundle, staleTime: 0 });
    hydrateCrm(bundle);
  };
}

export function CustomerFormDrawer({
  open,
  onClose,
  customer,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** Edit this customer; omit to create. */
  customer?: CustomerDetail | null;
  onSaved: (c: CustomerDetail) => void;
}) {
  const { tx, locale } = useStore();
  const { user } = useAuth();
  const { users } = useUserLookup();
  const mobile = useMedia("(max-width: 640px)");
  const refresh = useRefreshCrm();
  const [form] = Form.useForm<FormValues>();
  const [saving, setSaving] = useState(false);
  const [errorCount, setErrorCount] = useState(0);
  const [active, setActive] = useState(SECTIONS[0]!.id);
  const bodyRef = useRef<HTMLDivElement>(null);
  const editing = Boolean(customer);

  const initial = useMemo(
    () => initialValues(customer, user?.id, locale),
    // Recompute only when the drawer opens for a (different) customer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customer?.id, open],
  );

  useEffect(() => {
    if (open) {
      setErrorCount(0);
      setActive(SECTIONS[0]!.id);
    }
  }, [open]);

  const country = Form.useWatch("country", form) ?? initial.country;
  const office = Form.useWatch("office", form) ?? initial.office;
  const currency = Form.useWatch("currency", form) ?? initial.currency;
  const taxIdValue = Form.useWatch("taxId", form);
  const contactsValue = (Form.useWatch("contacts", form) ?? []) as ContactRow[];
  const taxOk = country === "TH" && isValidThaiTaxId(taxIdValue);

  const nameOrder = useMemo(() => {
    const all = [
      { lang: "th" as const, name: "nameTh" as const, label: tx("cust_nameTh") },
      { lang: "zh" as const, name: "nameZh" as const, label: tx("cust_nameZh") },
      { lang: "en" as const, name: "nameEn" as const, label: tx("cust_nameEn") },
    ];
    return [...all.filter((x) => x.lang === locale), ...all.filter((x) => x.lang !== locale)];
  }, [locale, tx]);

  const ownerOptions = users.map((u) => {
    const name = userDisplayName(u, locale);
    return {
      value: u.id,
      search: [u.name, u.nameZh, u.nameTh, u.email].filter(Boolean).join(" ").toLowerCase(),
      label: (
        <span className="cf-owner-opt">
          <PersonAvatar name={name} size={22} />
          <span>{name}</span>
        </span>
      ),
    };
  });

  const scrollTo = (id: string) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const onBodyScroll = () => {
    const root = bodyRef.current;
    if (!root) return;
    const top = root.getBoundingClientRect().top + 160;
    let current = SECTIONS[0]!.id;
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el && el.getBoundingClientRect().top <= top) current = s.id;
    }
    if (root.scrollTop + root.clientHeight >= root.scrollHeight - 4) current = SECTIONS[SECTIONS.length - 1]!.id;
    setActive(current);
  };

  function setPrimary(idx: number) {
    const list = (form.getFieldValue("contacts") ?? []) as ContactRow[];
    form.setFieldValue(
      "contacts",
      list.map((p, i) => ({ ...p, primary: i === idx })),
    );
  }

  function applyServerIssues(e: ApiError) {
    const fields: { name: (string | number)[]; errors: string[] }[] = [];
    const msg: Record<string, string> = {
      name_required: tx("cust_nameRequired"),
      invalid_thai_tax_id: tx("cust_taxIdInvalid"),
      invalid_email: tx("cust_emailInvalid"),
      owner_not_in_org: tx("cust_ownerInvalid"),
      same_port: tx("cust_samePort"),
      invalid_port: tx("cust_pickBoth"),
    };
    for (const i of e.issues) {
      const text = msg[i.message] ?? tx("cust_saveFailed");
      const parts = i.path.split(".").map((p) => (/^\d+$/.test(p) ? Number(p) : p));
      if (parts[0] === "name") fields.push({ name: [nameOrder[0]!.name], errors: [text] });
      else if (parts[0] === "preferredLanes") fields.push({ name: ["lanes", parts[1] ?? 0, "pod"], errors: [text] });
      else if (parts[0] === "contacts") fields.push({ name: ["contacts", parts[1] ?? 0, (parts[2] as string) ?? "name"], errors: [text] });
      else if (typeof parts[0] === "string" && parts[0]) fields.push({ name: [parts[0]], errors: [text] });
    }
    if (fields.length) {
      form.setFields(fields as never);
      setErrorCount(fields.length);
      form.scrollToField(fields[0]!.name as never, { behavior: "smooth", block: "center" });
    }
  }

  async function submit(values: FormValues) {
    setSaving(true);
    setErrorCount(0);
    try {
      const payload = toPayload(values, initial, editing);
      const saved = editing ? await updateCustomerRecord(customer!.id, payload) : await createCustomerRecord(payload);
      await refresh(saved).catch(() => undefined);
      message.success(tx(editing ? "cust_saved" : "cust_created"));
      onSaved(saved);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) message.error(tx("cust_noPermission"));
      else if (e instanceof ApiError && e.issues.length) applyServerIssues(e);
      else message.error(tx("cust_saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  const emailRule = { validator: (_: unknown, v?: string) => (isValidEmail(v) ? Promise.resolve() : Promise.reject(new Error(tx("cust_emailInvalid")))) };

  const nameRule = ({ getFieldValue }: { getFieldValue: (n: string) => unknown }) => ({
    validator: () =>
      ["nameTh", "nameZh", "nameEn"].some((n) => String(getFieldValue(n) ?? "").trim())
        ? Promise.resolve()
        : Promise.reject(new Error(tx("cust_nameRequired"))),
  });

  const title = (
    <span className="cf-title">
      <IconBadge icon={editing ? Buildings : Plus} tone="primary" size={32} />
      {tx(editing ? "cust_edit" : "cust_new")}
    </span>
  );

  return (
    <Drawer
      title={title}
      open={open}
      onClose={onClose}
      width={mobile ? "100%" : 780}
      destroyOnClose
      className="cf-drawer"
      styles={{ body: { padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" } }}
      footer={
        <div className="cf-foot">
          {errorCount > 0 ? <span className="cf-foot-err">{tx("cust_fixErrors", { n: errorCount })}</span> : <span />}
          <Button onClick={onClose}>{tx("cust_cancel")}</Button>
          <Button type="primary" loading={saving} onClick={() => form.submit()}>
            {tx(editing ? "cust_save" : "cust_create")}
          </Button>
        </div>
      }
    >
      <div ref={bodyRef} className="cf-wrap" onScroll={onBodyScroll}>
        <nav className="cf-nav" aria-label={tx(editing ? "cust_edit" : "cust_new")}>
          {SECTIONS.map((s, i) => {
            const I = s.icon;
            return (
              <button key={s.id} type="button" className={`cf-nav-item${active === s.id ? " is-on" : ""}`} onClick={() => scrollTo(s.id)} aria-current={active === s.id ? "step" : undefined}>
                <span className="cf-nav-num">{i + 1}</span>
                <I size={16} weight="duotone" aria-hidden />
                <span className="cf-nav-label">{tx(s.key)}</span>
              </button>
            );
          })}
        </nav>

        <Form<FormValues>
          form={form}
          layout="vertical"
          initialValues={initial}
          onFinish={submit}
          onFinishFailed={(info) => {
            setErrorCount(info.errorFields.length);
          }}
          onFieldsChange={() => {
            if (errorCount) setErrorCount(form.getFieldsError().filter((f) => f.errors.length).length);
          }}
          scrollToFirstError={{ behavior: "smooth", block: "center" }}
          requiredMark
          className="cf-form"
        >
          {/* 1 ── Company */}
          <Section id="cf-company" n={1} icon={Buildings} tone="primary" title={tx("cust_secCompany")}>
            <Form.Item label={tx("cust_companyName")} required tooltip={tx("cust_nameHint")} className="cf-names-item">
              <div className="cf-names">
                {nameOrder.map((x, i) => (
                  <Form.Item
                    key={x.name}
                    name={x.name}
                    className="cf-name"
                    dependencies={i === 0 ? ["nameTh", "nameZh", "nameEn"].filter((n) => n !== x.name) : undefined}
                    rules={i === 0 ? [nameRule] : undefined}
                  >
                    <Input prefix={<span className="cf-lang">{x.label}</span>} aria-label={`${tx("cust_companyName")} (${x.label})`} autoFocus={i === 0 && !editing} maxLength={200} />
                  </Form.Item>
                ))}
              </div>
            </Form.Item>

            <Form.Item name="businessType" label={tx("cust_businessType")}>
              <ChoiceCards label={tx("cust_businessType")} options={BUSINESS_TYPES.map((b) => ({ value: b, label: tx(`cust_bt_${b}`), icon: BUSINESS_ICON[b]! }))} />
            </Form.Item>

            <div className="cf-grid">
              <Form.Item name="ownerUserId" label={tx("cust_owner")} rules={[{ required: true, message: tx("cust_ownerPh") }]}>
                <Select
                  showSearch
                  placeholder={tx("cust_ownerPh")}
                  options={ownerOptions}
                  filterOption={(input, opt) => Boolean(opt?.search.includes(input.trim().toLowerCase()))}
                  aria-label={tx("cust_owner")}
                />
              </Form.Item>
              <Form.Item name="status" label={tx("cust_status")}>
                <Segmented
                  block
                  options={CUSTOMER_STATUSES.map((s) => ({
                    value: s,
                    label: (
                      <span className="cf-status-opt">
                        <i className={`cf-dot is-${STATUS_TONE[s]}`} aria-hidden />
                        {tx(`cust_st_${s}`)}
                      </span>
                    ),
                  }))}
                />
              </Form.Item>
              <Form.Item name="industry" label={tx("cust_industry")}>
                <Input placeholder={tx("cust_industryPh")} maxLength={200} />
              </Form.Item>
              <Form.Item name="leadSource" label={tx("cust_leadSource")}>
                <Select allowClear options={LEAD_SOURCES.map((s) => ({ value: s, label: tx(`cust_src_${s}`) }))} />
              </Form.Item>
              <Form.Item name="website" label={tx("cust_website")}>
                <Input prefix={<Globe size={16} aria-hidden />} placeholder="www.example.com" maxLength={200} inputMode="url" />
              </Form.Item>
              <Form.Item name="city" label={tx("cust_city")}>
                <Input maxLength={120} />
              </Form.Item>
            </div>
            <Form.Item name="notes" label={tx("cust_notes")}>
              <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} maxLength={4000} />
            </Form.Item>
          </Section>

          {/* 2 ── Tax & billing */}
          <Section id="cf-billing" n={2} icon={Receipt} tone="info" title={tx("cust_secBilling")}>
            <div className="cf-grid">
              <Form.Item name="country" label={tx("cust_country")}>
                <Select
                  showSearch
                  optionFilterProp="search"
                  options={COUNTRIES.map((c) => ({
                    value: c,
                    search: `${c} ${tx(`cust_ctry_${c}`)}`.toLowerCase(),
                    label: (
                      <span className="sales-port-opt">
                        {c === "OTHER" ? <Globe size={18} aria-hidden /> : <Flag code={c} size={20} />}
                        <span>{tx(`cust_ctry_${c}`)}</span>
                      </span>
                    ),
                  }))}
                  onChange={() => void form.validateFields(["taxId"]).catch(() => undefined)}
                />
              </Form.Item>
              <Form.Item
                name="taxId"
                label={tx("cust_taxId")}
                dependencies={["country"]}
                validateFirst
                hasFeedback={taxOk}
                rules={[
                  ({ getFieldValue }) => ({
                    validator: (_, v?: string) => {
                      const s = normalizeTaxId(v);
                      if (!s) return Promise.resolve();
                      if (getFieldValue("country") === "TH" && !isValidThaiTaxId(s)) return Promise.reject(new Error(tx("cust_taxIdInvalid")));
                      if (s.length > 30) return Promise.reject(new Error(tx("cust_taxIdInvalid")));
                      return Promise.resolve();
                    },
                  }),
                ]}
              >
                <Input
                  className="cz-mono"
                  placeholder={country === "TH" ? tx("cust_taxIdPh") : undefined}
                  maxLength={country === "TH" ? 17 : 30}
                  inputMode={country === "TH" ? "numeric" : undefined}
                  suffix={taxOk ? <CheckCircle size={16} weight="fill" className="cf-ok" aria-label={tx("cust_taxIdOk")} /> : <span />}
                />
              </Form.Item>
            </div>

            <div className="cf-grid">
              <Form.Item name="office" label={tx("cust_office")}>
                <Radio.Group
                  optionType="button"
                  buttonStyle="solid"
                  options={[
                    { value: "head", label: tx("cust_headOffice") },
                    { value: "branch", label: tx("cust_branch") },
                  ]}
                />
              </Form.Item>
              {office === "branch" ? (
                <Form.Item
                  name="branchNo"
                  label={tx("cust_branchNo")}
                  rules={[
                    { required: true, message: tx("cust_branchNoInvalid") },
                    { pattern: /^\d{1,5}$/, message: tx("cust_branchNoInvalid") },
                  ]}
                >
                  <Input className="cz-mono" placeholder="00001" maxLength={5} inputMode="numeric" />
                </Form.Item>
              ) : (
                <span />
              )}
            </div>

            <Form.Item name="billingAddress" label={tx("cust_billingAddress")}>
              <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} maxLength={1000} />
            </Form.Item>

            <div className="cf-grid">
              <Form.Item name="currency" label={tx("cust_currency")}>
                <Segmented
                  block
                  options={CURRENCIES.map((c) => ({
                    value: c,
                    label: (
                      <span className="cf-cur-opt">
                        <Flag code={CURRENCY_FLAG[c]} size={16} />
                        {c}
                      </span>
                    ),
                  }))}
                />
              </Form.Item>
              <Form.Item name="paymentMethod" label={tx("cust_paymentMethod")}>
                <Select allowClear options={PAYMENT_METHODS.map((m) => ({ value: m, label: tx(`cust_pm_${m}`) }))} />
              </Form.Item>
              <Form.Item name="creditTermDays" label={tx("cust_creditTerm")}>
                <Select
                  allowClear
                  options={CREDIT_TERMS.map((d) => ({ value: d, label: d === 0 ? tx("cust_cash") : tx("cust_daysN", { n: d }) }))}
                />
              </Form.Item>
              <Form.Item name="creditLimit" label={tx("cust_creditLimit")}>
                <InputNumber
                  min={0}
                  max={1e12}
                  precision={2}
                  className="cf-num"
                  suffix={<span className="cf-cur-suffix">{currency}</span>}
                  formatter={(v) => (v === undefined || v === null ? "" : String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ","))}
                  parser={(v) => Number((v ?? "").replace(/,/g, "")) as unknown as 0}
                />
              </Form.Item>
            </div>
            <Form.Item name="billingEmail" label={tx("cust_billingEmail")} rules={[emailRule]}>
              <Input type="email" inputMode="email" placeholder="ap@example.com" maxLength={200} />
            </Form.Item>
          </Section>

          {/* 3 ── Shipping profile */}
          <Section id="cf-shipping" n={3} icon={Boat} tone="accent" title={tx("cust_secShipping")}>
            <Form.Item label={tx("cust_lanes")} className="cf-lanes-item">
              <Form.List name="lanes">
                {(fields, { add, remove }) => (
                  <div className="cf-lanes">
                    {fields.map((f, i) => (
                      <div key={f.key} className="cf-lane">
                        {i === 0 && fields.length > 1 ? (
                          <Tooltip title={tx("cust_mainLane")}>
                            <Star size={14} weight="fill" className="cf-lane-main" aria-label={tx("cust_mainLane")} />
                          </Tooltip>
                        ) : (
                          <span className="cf-lane-idx">{i + 1}</span>
                        )}
                        <Form.Item name={[f.name, "pol"]} className="cf-lane-port">
                          <PortPicker placeholder={tx("cust_pol")} label={tx("cust_pol")} />
                        </Form.Item>
                        <ArrowRight size={18} className="cf-lane-arrow" aria-hidden />
                        <Form.Item
                          name={[f.name, "pod"]}
                          className="cf-lane-port"
                          dependencies={[["lanes", f.name, "pol"]]}
                          rules={[
                            ({ getFieldValue }) => ({
                              validator: (_, pod?: string) => {
                                const pol = getFieldValue(["lanes", f.name, "pol"]) as string | undefined;
                                if (!pol && !pod) return Promise.resolve();
                                if (!pol || !pod) return Promise.reject(new Error(tx("cust_pickBoth")));
                                if (pol === pod) return Promise.reject(new Error(tx("cust_samePort")));
                                return Promise.resolve();
                              },
                            }),
                          ]}
                        >
                          <PortPicker placeholder={tx("cust_pod")} label={tx("cust_pod")} />
                        </Form.Item>
                        <Button type="text" icon={<Trash size={16} />} aria-label={tx("cust_removeLane")} onClick={() => remove(f.name)} className="cf-icon-btn" />
                      </div>
                    ))}
                    <Button type="dashed" icon={<Plus size={14} />} onClick={() => add({})} className="cf-add">
                      {tx("cust_addLane")}
                    </Button>
                  </div>
                )}
              </Form.List>
            </Form.Item>

            <Form.Item name="containerTypes" label={tx("cust_containerTypes")}>
              <ChipMulti options={CONTAINER_TYPES} label={tx("cust_containerTypes")} />
            </Form.Item>

            <div className="cf-grid">
              <Form.Item name="commodities" label={tx("cust_commodities")}>
                <Select mode="tags" tokenSeparators={[",", "，", "、"]} placeholder={tx("cust_commoditiesPh")} open={false} suffixIcon={null} />
              </Form.Item>
              <Form.Item name="incoterms" label={tx("cust_incoterms")}>
                <Select allowClear options={INCOTERMS.map((i) => ({ value: i, label: i }))} />
              </Form.Item>
            </div>
            <Form.Item name="customsBroker" label={tx("cust_customsBroker")}>
              <Radio.Group
                optionType="button"
                options={[
                  { value: "yes", label: tx("cust_yes") },
                  { value: "no", label: tx("cust_no") },
                ]}
              />
            </Form.Item>
            <Form.Item name="handlingNotes" label={tx("cust_handling")}>
              <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} placeholder={tx("cust_handlingPh")} maxLength={2000} />
            </Form.Item>
          </Section>

          {/* 4 ── Contacts */}
          <Section
            id="cf-contacts"
            n={4}
            icon={AddressBook}
            tone="success"
            title={tx("cust_secContacts")}
            extra={contactsValue.filter(contactHasData).length === 0 ? <span className="cf-hint">{tx("cust_contactsHint")}</span> : null}
          >
            <Form.List name="contacts">
              {(fields, { add, remove }) => (
                <div className="cf-contacts">
                  {fields.map((f, i) => {
                    const primary = Boolean(contactsValue[i]?.primary);
                    const nm = (contactsValue[i]?.name ?? "").trim();
                    return (
                      <div key={f.key} className={`cf-contact${primary ? " is-primary" : ""}`}>
                        <div className="cf-contact-head">
                          <PersonAvatar name={nm || String(i + 1)} size={28} />
                          <strong>{nm || tx("cust_contactN", { n: i + 1 })}</strong>
                          <span className="sales-grow" />
                          <Tooltip title={primary ? tx("cust_primary") : tx("cust_setPrimary")}>
                            <Button
                              type="text"
                              size="small"
                              className={`cf-star${primary ? " is-on" : ""}`}
                              aria-pressed={primary}
                              aria-label={primary ? tx("cust_primary") : tx("cust_setPrimary")}
                              icon={<Star size={16} weight={primary ? "fill" : "regular"} />}
                              onClick={() => setPrimary(i)}
                            >
                              {primary ? tx("cust_primary") : null}
                            </Button>
                          </Tooltip>
                          <Button
                            type="text"
                            size="small"
                            icon={<Trash size={16} />}
                            aria-label={tx("cust_removeContact")}
                            className="cf-icon-btn"
                            onClick={() => {
                              const wasPrimary = primary;
                              remove(f.name);
                              if (wasPrimary) {
                                const rest = (form.getFieldValue("contacts") ?? []) as ContactRow[];
                                if (rest.length) form.setFieldValue("contacts", rest.map((p, k) => ({ ...p, primary: k === 0 })));
                              }
                            }}
                          />
                        </div>
                        <Form.Item name={[f.name, "id"]} hidden>
                          <Input />
                        </Form.Item>
                        <Form.Item name={[f.name, "primary"]} hidden valuePropName="checked">
                          <input type="checkbox" />
                        </Form.Item>
                        <div className="cf-grid">
                          <Form.Item
                            name={[f.name, "name"]}
                            label={tx("cust_contactName")}
                            required
                            rules={[
                              ({ getFieldValue }) => ({
                                validator: (_, v?: string) => {
                                  const row = (getFieldValue(["contacts", f.name]) ?? {}) as ContactRow;
                                  if (!contactHasData(row) || (v ?? "").trim()) return Promise.resolve();
                                  return Promise.reject(new Error(tx("cust_contactNameRequired")));
                                },
                              }),
                            ]}
                          >
                            <Input maxLength={120} />
                          </Form.Item>
                          <Form.Item name={[f.name, "title"]} label={tx("cust_position")}>
                            <Input maxLength={120} />
                          </Form.Item>
                          <Form.Item name={[f.name, "email"]} label={tx("cust_email")} rules={[emailRule]}>
                            <Input type="email" inputMode="email" maxLength={200} />
                          </Form.Item>
                          <Form.Item name={[f.name, "phone"]} label={tx("cust_phone")}>
                            <Input inputMode="tel" maxLength={50} />
                          </Form.Item>
                          <Form.Item name={[f.name, "wechat"]} label={tx("cust_wechat")}>
                            <Input maxLength={80} />
                          </Form.Item>
                          <Form.Item name={[f.name, "lineId"]} label={tx("cust_line")}>
                            <Input maxLength={80} />
                          </Form.Item>
                        </div>
                      </div>
                    );
                  })}
                  <Button type="dashed" icon={<Plus size={14} />} className="cf-add" onClick={() => add({ primary: fields.length === 0 })}>
                    {tx("cust_addContact")}
                  </Button>
                </div>
              )}
            </Form.List>
          </Section>
        </Form>
      </div>
    </Drawer>
  );
}
