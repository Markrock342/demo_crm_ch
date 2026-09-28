import { EnvelopeSimple, Phone, Star, WechatLogo } from "@phosphor-icons/react";
import { App, Button, Drawer, Form, Input, Select, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { Contact } from "../crm";
import { customerName, type Customer } from "../data";
import { useShellCrm } from "../shell/crmStore.tsx";
import { useIsShellMode } from "../shell/session.tsx";
import { useStore } from "../store";
import { demoSearchText } from "../v2/lib/demoText.ts";
import { useDemoText } from "../v2/lib/useDemoText.ts";
import { useMedia } from "../ui/useMedia";
import {
  CardGrid,
  DataTable,
  EmptyState,
  EntityCard,
  FilterBar,
  PageHeader,
  PersonAvatar,
  ViewSwitch,
  readView,
  writeView,
} from "../v2/components";
import { CompanyMark, SalesMobileList } from "../v2/pages/SalesMobileList.tsx";
import { matches } from "../v2/pages/salesUtil.ts";
import "../v2/pages/sales.css";

type ContactForm = { customerId: string; name: string; title: string; email: string; phone: string; wechat: string };

export function ContactsPage() {
  const shell = useIsShellMode();
  const store = useStore();
  const crm = useShellCrm();
  const { tx, locale } = store;
  const dt = useDemoText();
  const contacts = (shell ? crm.contacts : store.contacts) as Contact[];
  const customers = (shell ? crm.customers : store.customers) as Customer[];
  const addContact = shell ? crm.addContact : store.addContact;
  const navigate = useNavigate();
  const mobile = useMedia("(max-width: 640px)");

  const [params, setParams] = useSearchParams();
  const open = params.get("new") === "1";
  const setOpen = (v: boolean) => {
    const next = new URLSearchParams(params);
    if (v) next.set("new", "1");
    else next.delete("new");
    setParams(next, { replace: true });
  };

  const { message } = App.useApp();
  const [view, setViewState] = useState(() => readView("contacts"));
  const setView = (v: "cards" | "list") => {
    setViewState(v);
    writeView("contacts", v);
  };
  const [q, setQ] = useState("");
  const [customerId, setCustomerId] = useState<string | undefined>();
  const [form] = Form.useForm<ContactForm>();

  const nameOf = (id: string) => {
    const c = customers.find((x) => x.id === id);
    return c ? customerName(c, locale) : "—";
  };

  const rows = useMemo(
    () =>
      contacts
        .filter(
          (p) =>
            (!customerId || p.customerId === customerId) && matches(q, demoSearchText(p.name), demoSearchText(p.title), p.email, p.phone, p.wechat, nameOf(p.customerId)),
        )
        .slice()
        .sort((a, b) => Number(b.primary) - Number(a.primary)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contacts, q, customerId, customers, locale],
  );
  const companyCount = new Set(contacts.map((p) => p.customerId)).size;

  function submit(v: ContactForm) {
    addContact({
      customerId: v.customerId,
      name: v.name,
      title: v.title ?? "",
      email: v.email ?? "",
      phone: v.phone ?? "",
      wechat: v.wechat ?? "",
    });
    form.resetFields();
    setOpen(false);
  }

  const primaryMark = (p: Contact) =>
    p.primary ? (
      <Tooltip title={tx("sales_primary")}>
        <Star size={14} weight="fill" className="sales-primary-star" aria-label={tx("sales_primary")} />
      </Tooltip>
    ) : null;

  const columns: ColumnsType<Contact> = [
    {
      title: tx("sales_colName"),
      key: "name",
      render: (_, p) => (
        <>
          <span className="cz-cell-main">
            {dt(p.name)} {primaryMark(p)}
          </span>
          <span className="cz-cell-sub">{dt(p.title) || "—"}</span>
        </>
      ),
    },
    { title: tx("sales_colCustomer"), key: "customer", render: (_, p) => nameOf(p.customerId) },
    {
      title: tx("sales_colEmail"),
      dataIndex: "email",
      render: (v: string) => (v ? <a href={`mailto:${v}`}>{v}</a> : <span className="cz-muted">—</span>),
    },
    {
      title: tx("sales_colPhone"),
      dataIndex: "phone",
      render: (v: string) =>
        v ? (
          <a href={`tel:${v.replace(/\s+/g, "")}`} className="sales-plain-link">
            {v}
          </a>
        ) : (
          <span className="cz-muted">—</span>
        ),
    },
    { title: tx("sales_colWechat"), dataIndex: "wechat", render: (v: string) => <span className="cz-muted">{v || "—"}</span> },
  ];

  const copyWechat = (id: string) => {
    void navigator.clipboard
      ?.writeText(id)
      .then(() => message.success(tx("sales_wechatCopied", { id })))
      .catch(() => message.info(id));
  };

  const contactCard = (p: Contact) => {
    const company = nameOf(p.customerId);
    return (
      <EntityCard
        key={p.id}
        media={<PersonAvatar name={p.name} size={44} />}
        title={
          <>
            {dt(p.name)} {primaryMark(p)}
          </>
        }
        subtitle={dt(p.title) || undefined}
        footer={
          <>
            <Link to={`/customers/${p.customerId}`} className="sales-company-link">
              <CompanyMark name={company} size={22} />
              <span>{company}</span>
            </Link>
            <span className="sales-contact-actions">
              <Tooltip title={p.email || tx("sales_colEmail")}>
                <Button
                  type="text"
                  shape="circle"
                  href={p.email ? `mailto:${p.email}` : undefined}
                  disabled={!p.email}
                  aria-label={`${tx("sales_colEmail")} ${p.email}`}
                  icon={<EnvelopeSimple size={18} aria-hidden />}
                />
              </Tooltip>
              <Tooltip title={p.phone || tx("sales_colPhone")}>
                <Button
                  type="text"
                  shape="circle"
                  href={p.phone ? `tel:${p.phone.replace(/\s+/g, "")}` : undefined}
                  disabled={!p.phone}
                  aria-label={`${tx("sales_colPhone")} ${p.phone}`}
                  icon={<Phone size={18} aria-hidden />}
                />
              </Tooltip>
              <Tooltip title={p.wechat ? `WeChat: ${p.wechat}` : tx("sales_colWechat")}>
                <Button
                  type="text"
                  shape="circle"
                  disabled={!p.wechat}
                  onClick={() => copyWechat(p.wechat)}
                  aria-label={`${tx("sales_colWechat")} ${p.wechat}`}
                  icon={<WechatLogo size={18} aria-hidden />}
                />
              </Tooltip>
            </span>
          </>
        }
      />
    );
  };

  const noCustomers = customers.length === 0;
  const newButton = (
    <Button type="primary" onClick={() => setOpen(true)} disabled={noCustomers}>
      {tx("sales_newContact")}
    </Button>
  );
  const empty =
    contacts.length === 0 ? (
      <EmptyState title={tx("sales_contactsEmpty")} description={tx("sales_contactsEmptyHint")} action={newButton} />
    ) : (
      <EmptyState description={tx("noResults")} />
    );

  return (
    <div className="cz-stack sales-page">
      <PageHeader
        title={tx("sales_contactsTitle")}
        subtitle={tx("sales_contactsSub", { n: contacts.length, c: companyCount })}
        extra={
          <>
            <ViewSwitch value={view} onChange={setView} labels={{ cards: tx("viewCards"), list: tx("viewList") }} />
            {noCustomers ? <Tooltip title={tx("sales_needCustomer")}>{newButton}</Tooltip> : newButton}
          </>
        }
      >
        <FilterBar
          search={{ value: q, onChange: setQ, placeholder: tx("sales_contactSearch") }}
          selects={[
            {
              key: "customer",
              placeholder: tx("sales_allCustomers"),
              value: customerId,
              options: customers.map((c) => ({ value: c.id, label: customerName(c, locale) })),
              onChange: setCustomerId,
              width: 200,
            },
          ]}
          onClear={() => {
            setQ("");
            setCustomerId(undefined);
          }}
          count={rows.length}
        />
      </PageHeader>

      {view === "cards" ? (
        rows.length === 0 ? (
          empty
        ) : (
          <CardGrid min={280}>{rows.map(contactCard)}</CardGrid>
        )
      ) : mobile ? (
        <SalesMobileList
          empty={empty}
          rows={rows.map((p) => ({
            key: p.id,
            title: (
              <>
                {dt(p.name)} {primaryMark(p)}
              </>
            ),
            sub: [dt(p.title), nameOf(p.customerId)].filter((x) => x && x !== "—").join(" · "),
            onClick: () => navigate(`/customers/${p.customerId}`),
          }))}
        />
      ) : (
        <DataTable<Contact>
          rowKey="id"
          columns={columns}
          dataSource={rows}
          onRowClick={(p) => navigate(`/customers/${p.customerId}`)}
          emptyText={contacts.length === 0 ? tx("sales_contactsEmptyHint") : undefined}
          emptyAction={contacts.length === 0 ? newButton : undefined}
        />
      )}

      <Drawer
        title={tx("sales_newContact")}
        open={open && !noCustomers}
        onClose={() => setOpen(false)}
        width={440}
        destroyOnClose
        footer={
          <div className="sales-drawer-foot">
            <Button type="text" onClick={() => setOpen(false)}>
              {tx("sales_cancel")}
            </Button>
            <Button type="primary" onClick={() => form.submit()}>
              {tx("sales_save")}
            </Button>
          </div>
        }
      >
        <Form<ContactForm> form={form} layout="vertical" onFinish={submit} initialValues={{ customerId: customerId ?? customers[0]?.id }}>
          <Form.Item
            name="customerId"
            label={tx("sales_fCustomer")}
            rules={[{ required: true, message: tx("sales_required", { field: tx("sales_fCustomer") }) }]}
          >
            <Select showSearch optionFilterProp="label" options={customers.map((c) => ({ value: c.id, label: customerName(c, locale) }))} />
          </Form.Item>
          <Form.Item
            name="name"
            label={tx("sales_fName")}
            rules={[{ required: true, whitespace: true, message: tx("sales_required", { field: tx("sales_fName") }) }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="title" label={tx("sales_fJobTitle")}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label={tx("sales_colEmail")} rules={[{ type: "email", message: tx("sales_colEmail") }]}>
            <Input type="email" autoComplete="email" />
          </Form.Item>
          <div className="sales-form-row">
            <Form.Item name="phone" label={tx("sales_colPhone")}>
              <Input type="tel" inputMode="tel" autoComplete="tel" />
            </Form.Item>
            <Form.Item name="wechat" label={tx("sales_colWechat")}>
              <Input />
            </Form.Item>
          </div>
        </Form>
      </Drawer>
    </div>
  );
}
