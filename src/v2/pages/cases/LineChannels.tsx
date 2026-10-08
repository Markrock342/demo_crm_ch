import {
  ArrowRight,
  ChatCircleText,
  Check,
  CheckCircle,
  ClipboardText,
  Copy,
  ImageSquare,
  Info,
  Key,
  LinkSimple,
  PaperPlaneRight,
  PencilSimple,
  Plus,
  Question,
  Trash,
  Tray,
  User,
  UsersThree,
  WebhooksLogo,
} from "@phosphor-icons/react";
import { App, Button, Form, Input, Popconfirm, Select, Switch, Tooltip } from "antd";
import type { InputRef } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { BusinessUnit } from "../../../api/businessUnits.ts";
import { DEMO_CHAT_IMAGES, type DemoChatImage, type LineChannel, type LineChannelInput } from "../../../api/cases.ts";
import { ApiError } from "../../../api/crm.ts";
import { useStore } from "../../../store";
import { EmptyState, LoadingState } from "../../components";
import { UnitChip } from "./UnitChip.tsx";
import { useBusinessUnits } from "../../hooks/useBusinessUnits.ts";
import { useLineChannelActions, useLineChannels } from "../../hooks/useLineChannels.ts";
import { fmtDateTime, fmtNumber } from "../../lib/format.ts";
import { chatImageUrl, unitThumb } from "../../lib/photos.ts";
import "./line.css";

type Tx = (k: string, v?: Record<string, string | number>) => string;

const webhookUrl = (c: LineChannel) => `${window.location.origin}${c.webhookPath}`;

/** LINE-style chat bubble mark (brand-like, drawn with tokens). */
export function LineMark({ size = 40, off = false }: { size?: number; off?: boolean }) {
  return (
    <span className={`ln-mark${off ? " is-off" : ""}`} style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 40 40" width={size} height={size}>
        <rect width="40" height="40" rx="11" fill="currentColor" />
        <path
          d="M20 8.5c-7.5 0-13.5 4.8-13.5 10.8 0 5.3 4.8 9.8 11.3 10.6.5.1 1 .4 1.1.8.1.4.1 1 0 1.4l-.2 1.1c-.1.3-.3 1.3 1.1.7 1.4-.6 7.7-4.5 10.5-7.8 1.9-2.1 3.2-4.3 3.2-6.8 0-6-6-10.8-13.5-10.8Z"
          fill="var(--paper)"
        />
        <text x="20" y="21.8" textAnchor="middle" fontSize="7.4" fontWeight="800" fill="currentColor" fontFamily="system-ui, sans-serif">
          LINE
        </text>
      </svg>
    </span>
  );
}

function copyText(text: string, done: () => void) {
  void navigator.clipboard?.writeText(text).then(done, () => undefined);
}

function StatusPill({ c, tx, locale }: { c: LineChannel; tx: Tx; locale: "zh" | "th" | "en" }) {
  const key = !c.active ? "off" : c.connected ? "connected" : "not_connected";
  const pill = (
    <span className={`ln-status is-${key}`}>
      <i aria-hidden />
      {tx(`inb_st_${key}`)}
    </span>
  );
  return c.lastEventAt ? <Tooltip title={tx("inb_last_event", { when: fmtDateTime(c.lastEventAt, locale) })}>{pill}</Tooltip> : pill;
}

/** 3 pictures: where to go, what to paste here, what to paste there. */
function HowTo({ tx, compact = false }: { tx: Tx; compact?: boolean }) {
  const steps = [
    { icon: LinkSimple, key: "inb_step1" },
    { icon: Key, key: "inb_step2" },
    { icon: WebhooksLogo, key: "inb_step3" },
  ];
  return (
    <ol className={`ln-how${compact ? " is-compact" : ""}`} aria-label={tx("inb_how")}>
      {steps.map((s, i) => (
        <li key={s.key}>
          <span className="ln-how-icon">
            <s.icon size={20} weight="duotone" aria-hidden />
            <b>{i + 1}</b>
          </span>
          <span>{tx(s.key)}</span>
        </li>
      ))}
    </ol>
  );
}

function WebhookRow({ c, tx }: { c: LineChannel; tx: Tx }) {
  const { message } = App.useApp();
  const url = webhookUrl(c);
  return (
    <div className="ln-webhook">
      <WebhooksLogo size={16} aria-label={tx("inb_webhook")} />
      <code title={url}>{url}</code>
      <Tooltip title={tx("inb_copy")}>
        <Button size="small" type="text" icon={<Copy size={16} />} aria-label={`${tx("inb_copy")} ${tx("inb_webhook")}`} onClick={() => copyText(url, () => message.success(tx("inb_copied")))} />
      </Tooltip>
    </div>
  );
}

/** Acts like a customer chatting on this OA → shows the case it opened / joined. */
function TestSender({ c, tx }: { c: LineChannel; tx: Tx }) {
  const { message } = App.useApp();
  const actions = useLineChannelActions();
  const [name, setName] = useState(() => tx("inb_test_name_default"));
  const [text, setText] = useState("");
  const [image, setImage] = useState<DemoChatImage | null>(null);
  const [result, setResult] = useState<{ caseId: string; caseNo: string; created: boolean } | null>(null);
  const textRef = useRef<InputRef>(null);
  const photoLabel = (k: DemoChatImage) => tx(`ph_chat_${k.replace(/-/g, "_")}`);

  async function send() {
    // A photo alone is fine: the API needs text, so the photo's name goes with it.
    const body = text.trim() || (image ? photoLabel(image) : "");
    if (!name.trim() || !body) {
      textRef.current?.focus();
      return;
    }
    try {
      const out = await actions.test.mutateAsync({ id: c.id, name: name.trim(), text: body, image: image ?? undefined });
      setResult(out);
      setText("");
      setImage(null);
      requestAnimationFrame(() => textRef.current?.focus());
    } catch {
      message.error(tx("inb_test_failed"));
    }
  }

  return (
    <form
      className="ln-test"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <div className="ln-test-row">
        <Input
          className="ln-test-name"
          prefix={<User size={16} aria-hidden />}
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          aria-label={tx("inb_test_name")}
          placeholder={tx("inb_test_name")}
        />
        <Input
          ref={textRef}
          className="ln-test-text"
          prefix={<ChatCircleText size={16} aria-hidden />}
          value={text}
          maxLength={2000}
          autoFocus
          onChange={(e) => setText(e.target.value)}
          aria-label={tx("inb_test_text")}
          placeholder={tx("inb_test_text_ph")}
        />
        <Button type="primary" htmlType="submit" icon={<PaperPlaneRight size={16} weight="fill" />} loading={actions.test.isPending} disabled={!(text.trim() || image) || !name.trim()}>
          {tx("inb_test_send")}
        </Button>
      </div>
      <div className="ln-test-photos" role="radiogroup" aria-label={tx("ph_attach")}>
        <span className="ln-test-photos-label">
          <ImageSquare size={16} aria-hidden />
          {tx("ph_attach")}
        </span>
        {DEMO_CHAT_IMAGES.map((k) => {
          const on = image === k;
          const label = photoLabel(k);
          return (
            <Tooltip key={k} title={label}>
              <button
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={label}
                className={`ln-test-photo${on ? " is-on" : ""}`}
                onClick={() => setImage(on ? null : k)}
              >
                <img src={chatImageUrl(k)} alt="" width={56} height={42} loading="lazy" decoding="async" />
                {on ? (
                  <span className="ln-test-photo-check" aria-hidden>
                    <Check size={12} weight="bold" />
                  </span>
                ) : null}
              </button>
            </Tooltip>
          );
        })}
      </div>
      {result ? (
        <Link to={`/cases/${encodeURIComponent(result.caseId)}`} className="ln-test-result">
          <CheckCircle size={18} weight="fill" aria-hidden />
          <span>{tx(result.created ? "inb_test_opened" : "inb_test_joined", { no: result.caseNo })}</span>
          <ArrowRight size={16} aria-hidden />
        </Link>
      ) : (
        <p className="ln-test-hint">
          <Info size={14} aria-hidden />
          {tx("inb_test_hint")}
        </p>
      )}
    </form>
  );
}

function ChannelCard({ c, unit, onEdit, tx, locale }: { c: LineChannel; unit: BusinessUnit | undefined; onEdit: () => void; tx: Tx; locale: "zh" | "th" | "en" }) {
  const { message } = App.useApp();
  const actions = useLineChannelActions();
  const [testing, setTesting] = useState(false);
  return (
    <li className={`ln-card${c.active ? "" : " is-off"}`}>
      <div className="ln-head">
        {unit?.imageUrl ? (
          <span className="ln-unit-photo">
            <img src={unitThumb(unit.imageUrl)} alt={tx("ph_unit_alt", { name: unit.name })} width={72} height={48} loading="lazy" decoding="async" />
            <LineMark size={22} off={!c.active} />
          </span>
        ) : (
          <LineMark size={40} off={!c.active} />
        )}
        <div className="ln-title">
          <strong title={c.name}>{c.name}</strong>
          <span className="ln-sub">
            {unit ? <UnitChip unit={unit} size="sm" /> : null}
            {c.basicId ? <span className="ln-basic">{c.basicId}</span> : null}
          </span>
        </div>
        <StatusPill c={c} tx={tx} locale={locale} />
      </div>

      <div className="ln-stats">
        <Tooltip title={tx("inb_friends")}>
          <span className="ln-stat" aria-label={`${tx("inb_friends")} ${c.friends}`}>
            <UsersThree size={16} weight="duotone" aria-hidden />
            <b>{fmtNumber(c.friends, locale)}</b>
          </span>
        </Tooltip>
        <Tooltip title={tx("inb_open_cases")}>
          <span className={`ln-stat${c.openCases ? " is-hot" : ""}`} aria-label={`${tx("inb_open_cases")} ${c.openCases}`}>
            <Tray size={16} weight="duotone" aria-hidden />
            <b>{fmtNumber(c.openCases, locale)}</b>
          </span>
        </Tooltip>
        <span className="ln-actions">
          <Button size="small" type={testing ? "default" : "primary"} ghost={!testing} icon={<PaperPlaneRight size={14} />} aria-expanded={testing} onClick={() => setTesting((v) => !v)}>
            {tx("inb_test")}
          </Button>
          <Tooltip title={tx("inb_edit")}>
            <Button size="small" type="text" icon={<PencilSimple size={16} />} aria-label={tx("inb_edit")} onClick={onEdit} />
          </Tooltip>
          <Popconfirm
            title={tx("inb_delete_q")}
            okText={tx("inb_delete")}
            cancelText={tx("inb_cancel")}
            okButtonProps={{ danger: true }}
            onConfirm={() => actions.remove.mutateAsync(c.id).catch(() => message.error(tx("inb_error")))}
          >
            <Button size="small" type="text" danger icon={<Trash size={16} />} aria-label={tx("inb_delete")} />
          </Popconfirm>
        </span>
      </div>

      <WebhookRow c={c} tx={tx} />
      {testing ? <TestSender c={c} tx={tx} /> : null}
    </li>
  );
}

/** Case settings › LINE: one card per company OA, add / edit / delete, test sender. */
export function LineChannelsManager() {
  const { tx, locale } = useStore();
  const q = useLineChannels();
  const { byId, units } = useBusinessUnits(true);
  const [editing, setEditing] = useState<LineChannel | "new" | null>(null);
  const items = q.data ?? [];
  const [howOpen, setHowOpen] = useState<boolean | null>(null);

  if (q.isLoading) return <LoadingState />;

  if (editing) {
    return <ChannelForm initial={editing === "new" ? null : editing} units={units} onDone={() => setEditing(null)} />;
  }

  const showHow = howOpen ?? !items.some((c) => c.connected);

  return (
    <div className="ln-manager">
      <div className="ln-toolbar">
        <Button type="dashed" icon={<Plus size={16} />} onClick={() => setEditing("new")} className="ln-add">
          {tx("inb_line_add")}
        </Button>
        <Button type="text" icon={<Question size={16} />} aria-expanded={showHow} onClick={() => setHowOpen(!showHow)}>
          {tx("inb_how")}
        </Button>
      </div>
      {showHow ? <HowTo tx={tx} /> : null}
      {!items.length ? <EmptyState title={tx("inb_line_empty")} /> : null}
      <ul className="ln-list">
        {items.map((c) => (
          <ChannelCard key={c.id} c={c} unit={c.businessUnitId ? byId.get(c.businessUnitId) : undefined} onEdit={() => setEditing(c)} tx={tx} locale={locale} />
        ))}
      </ul>
    </div>
  );
}

type FormValues = { name?: string; businessUnitId?: string; channelSecret?: string; accessToken?: string; ackMessage?: string; active: boolean };

function ChannelForm({ initial, units, onDone }: { initial: LineChannel | null; units: BusinessUnit[]; onDone: () => void }) {
  const { tx, locale } = useStore();
  const { message } = App.useApp();
  const actions = useLineChannelActions();
  const [form] = Form.useForm<FormValues>();
  const [saving, setSaving] = useState(false);
  const ackRef = useRef<TextAreaRef>(null);
  const saved = Boolean(initial && (initial.hasSecret || initial.tokenHint));
  // Archived units stay pickable only when this OA already uses one.
  const unitOptions = units
    .filter((u) => !u.archived || u.id === initial?.businessUnitId)
    .map((u) => ({ value: u.id, label: <UnitChip unit={u} size="sm" />, search: u.name.toLowerCase() }));

  function showErrors(e: unknown) {
    if (e instanceof ApiError && e.issues.length) {
      const fields = e.issues
        .filter((i) => ["name", "businessUnitId", "channelSecret", "accessToken", "ackMessage"].includes(i.path))
        .map((i) => {
          const k = `inb_err_${i.message}`;
          const text = tx(k);
          return { name: i.path as keyof FormValues, errors: [text === k ? tx("inb_error") : text] };
        });
      if (fields.length) {
        form.setFields(fields);
        return;
      }
    }
    message.error(tx("inb_error"));
  }

  async function submit(v: FormValues) {
    const input: LineChannelInput = {
      name: (v.name ?? "").trim() || undefined,
      businessUnitId: v.businessUnitId ?? null,
      ackMessage: (v.ackMessage ?? "").trim() || null,
      active: v.active,
    };
    const secret = (v.channelSecret ?? "").trim();
    const token = (v.accessToken ?? "").trim();
    if (secret) input.channelSecret = secret;
    if (token) input.accessToken = token;
    setSaving(true);
    try {
      if (initial) await actions.patch.mutateAsync({ id: initial.id, patch: input });
      else await actions.create.mutateAsync(input);
      message.success(tx("inb_saved_ok"));
      onDone();
    } catch (e) {
      showErrors(e);
    } finally {
      setSaving(false);
    }
  }

  function insertCase() {
    const el = ackRef.current?.resizableTextArea?.textArea;
    const cur: string = form.getFieldValue("ackMessage") ?? "";
    const at = el ? el.selectionStart : cur.length;
    form.setFieldValue("ackMessage", `${cur.slice(0, at)}{case}${cur.slice(at)}`);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + 6, at + 6);
    });
  }

  async function disconnect() {
    if (!initial) return;
    try {
      await actions.patch.mutateAsync({ id: initial.id, patch: { channelSecret: null, accessToken: null } });
      message.success(tx("inb_saved_ok"));
      onDone();
    } catch (e) {
      showErrors(e);
    }
  }

  return (
    <Form
      form={form}
      layout="vertical"
      requiredMark={false}
      className="ln-form"
      initialValues={{
        name: initial?.name ?? "",
        businessUnitId: initial?.businessUnitId ?? undefined,
        ackMessage: initial?.ackMessage ?? "",
        active: initial?.active ?? true,
      }}
      onFinish={submit}
      onValuesChange={(changed) => {
        // Clear a server error as soon as the field is edited.
        for (const k of Object.keys(changed)) form.setFields([{ name: k as keyof FormValues, errors: [] }]);
      }}
    >
      <div className="ln-form-head">
        <LineMark size={36} off={initial ? !initial.active : false} />
        <strong>{initial?.name ?? tx("inb_line_add")}</strong>
        {initial ? <StatusPill c={initial} tx={tx} locale={locale} /> : null}
      </div>

      <Form.Item name="name" label={tx("inb_f_name")}>
        <Input maxLength={80} placeholder={tx("inb_f_name_ph")} />
      </Form.Item>
      {units.length ? (
        <Form.Item name="businessUnitId" label={tx("inb_f_unit")}>
          <Select
            allowClear
            showSearch
            placeholder={tx("inb_f_unit_ph")}
            options={unitOptions}
            filterOption={(input, opt) => Boolean(opt?.search.includes(input.trim().toLowerCase()))}
          />
        </Form.Item>
      ) : null}

      <fieldset className="ln-cred">
        <legend>
          <Key size={16} weight="duotone" aria-hidden />
          {tx("inb_how")}
        </legend>
        <HowTo tx={tx} compact />
        <Form.Item
          name="channelSecret"
          label={tx("inb_f_secret")}
          tooltip={initial?.hasSecret ? tx("inb_keep_hint") : undefined}
        >
          <Input.Password autoComplete="new-password" spellCheck={false} placeholder={initial?.hasSecret ? tx("inb_saved_secret") : undefined} maxLength={400} />
        </Form.Item>
        <Form.Item
          name="accessToken"
          label={tx("inb_f_token")}
          tooltip={initial?.tokenHint ? tx("inb_keep_hint") : undefined}
        >
          <Input.Password
            autoComplete="new-password"
            spellCheck={false}
            placeholder={initial?.tokenHint ? tx("inb_saved_hint", { hint: initial.tokenHint }) : undefined}
            maxLength={400}
          />
        </Form.Item>
        {initial ? (
          <div className="ln-cred-webhook">
            <span className="ln-cred-label">
              <ClipboardText size={14} aria-hidden />
              {tx("inb_webhook")}
            </span>
            <WebhookRow c={initial} tx={tx} />
          </div>
        ) : null}
        {saved ? (
          <Popconfirm title={tx("inb_disconnect_q")} okText={tx("inb_disconnect")} cancelText={tx("inb_cancel")} okButtonProps={{ danger: true }} onConfirm={disconnect}>
            <Button size="small" type="link" danger className="ln-disconnect">
              {tx("inb_disconnect")}
            </Button>
          </Popconfirm>
        ) : null}
      </fieldset>

      <Form.Item
        name="ackMessage"
        label={
          <span className="ln-ack-label">
            {tx("inb_f_ack")}
            <span className="ln-ack-insert">
              {tx("inb_f_insert")}
              <button type="button" className="ln-var-chip" onClick={insertCase}>
                {tx("inb_var_case")}
              </button>
            </span>
          </span>
        }
      >
        <Input.TextArea ref={ackRef} autoSize={{ minRows: 2, maxRows: 6 }} maxLength={1000} placeholder={tx("inb_f_ack_ph")} />
      </Form.Item>
      <Form.Item name="active" label={tx("inb_f_active")} valuePropName="checked" className="ln-active">
        <Switch />
      </Form.Item>

      <div className="ln-form-foot">
        {initial ? (
          <Popconfirm
            title={tx("inb_delete_q")}
            okText={tx("inb_delete")}
            cancelText={tx("inb_cancel")}
            okButtonProps={{ danger: true }}
            onConfirm={() =>
              actions.remove
                .mutateAsync(initial.id)
                .then(onDone)
                .catch(() => message.error(tx("inb_error")))
            }
          >
            <Button danger type="text" icon={<Trash size={16} />}>
              {tx("inb_delete")}
            </Button>
          </Popconfirm>
        ) : null}
        <span className="ln-form-foot-right">
          <Button onClick={onDone}>{tx("inb_cancel")}</Button>
          <Button type="primary" htmlType="submit" loading={saving}>
            {tx("inb_save")}
          </Button>
        </span>
      </div>
    </Form>
  );
}
