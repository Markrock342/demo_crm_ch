import { Bank, Buildings, FileText, ImageSquare, MapPin, Receipt, UploadSimple } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { App, Button, Form, Input, Radio, Select } from "antd";
import { useRef, useState, type ReactNode } from "react";
import {
  organizationLogoUrl,
  removeOrganizationLogo,
  updateOrganization,
  uploadOrganizationLogo,
  type Organization,
  type OrganizationPatch,
} from "../../api/admin.ts";
import { useAuth } from "../../auth/AuthProvider";
import { useStore } from "../../store";
import { BrandMark, ErrorState, IconBadge, LoadingState, type GraphicTone } from "../../v2/components";
import { publicBrandingQueryKey, useSquareIcon } from "../../v2/hooks/useBranding.ts";
import { organizationDisplayName, organizationQueryKey, useOrganization } from "../../v2/hooks/useOrganization.ts";
import { errorText } from "./shared.tsx";
import type { Icon } from "@phosphor-icons/react";

/** Same rule as the server (magic bytes): PNG / JPEG only — SVG can carry scripts, WebP does not embed in PDFs. */
const LOGO_ACCEPT = ["image/png", "image/jpeg"];

const CURRENCIES = ["THB", "USD", "CNY", "EUR", "SGD", "HKD", "JPY", "MYR", "VND"];

type Values = Omit<OrganizationPatch, "email"> & { email?: string | null };

function Group({ icon, tone, title, children }: { icon: Icon; tone: GraphicTone; title: string; children: ReactNode }) {
  return (
    <fieldset className="adm-group">
      <legend className="adm-block-title">
        <IconBadge icon={icon} tone={tone} size={28} />
        {title}
      </legend>
      <div className="adm-grid">{children}</div>
    </fieldset>
  );
}

function LogoPicker({ org, canEdit }: { org: Organization; canEdit: boolean }) {
  const { tx, locale } = useStore();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const onSaved = (o: Organization) => {
    qc.setQueryData(organizationQueryKey, o);
    void qc.invalidateQueries({ queryKey: publicBrandingQueryKey });
  };
  const upload = useMutation({
    mutationFn: uploadOrganizationLogo,
    onSuccess: (o) => {
      onSaved(o);
      message.success(tx("adm_saved"));
    },
    onError: (e) => message.error(errorText(tx, e)),
  });
  const remove = useMutation({
    mutationFn: removeOrganizationLogo,
    onSuccess: onSaved,
    onError: (e) => message.error(errorText(tx, e)),
  });
  const url = organizationLogoUrl(org);
  const name = organizationDisplayName(org, locale);
  const tabIcon = useSquareIcon(url);
  const [ratio, setRatio] = useState(1);

  function pick(f: File | undefined) {
    if (!f) return;
    if (!LOGO_ACCEPT.includes(f.type)) return void message.error(tx("adm_err_logo_invalid_type"));
    if (f.size > 1024 * 1024) return void message.error(tx("adm_err_logo_too_large"));
    upload.mutate(f);
  }

  const frame = url ? <img src={url} alt={name} /> : <ImageSquare size={32} aria-hidden />;

  return (
    <section className="adm-brand" aria-label={tx("adm_logo")}>
      <div className="adm-logo">
        {canEdit ? (
          <button
            type="button"
            className={`adm-logo-frame is-drop${over ? " is-over" : ""}`}
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              pick(e.dataTransfer.files?.[0]);
            }}
            aria-label={url ? tx("adm_logoReplace") : tx("adm_logoUpload")}
            disabled={upload.isPending}
          >
            {frame}
            {!url ? <UploadSimple size={16} className="adm-logo-plus" aria-hidden /> : null}
          </button>
        ) : (
          <div className="adm-logo-frame">{frame}</div>
        )}
        <div className="adm-logo-side">
          <strong>{tx("adm_logo")}</strong>
          <span className="cz-muted adm-small">{tx("brand_logoHint")}</span>
          <span className="cz-muted adm-small">{tx("brand_logoWhere")}</span>
          {canEdit ? (
            <span className="adm-actions">
              <Button size="small" type={url ? "default" : "primary"} icon={<UploadSimple size={14} aria-hidden />} loading={upload.isPending} onClick={() => input.current?.click()}>
                {url ? tx("adm_logoReplace") : tx("adm_logoUpload")}
              </Button>
              {url ? (
                <Button size="small" type="text" danger loading={remove.isPending} onClick={() => remove.mutate()}>
                  {tx("adm_logoRemove")}
                </Button>
              ) : null}
              <input
                ref={input}
                type="file"
                accept={LOGO_ACCEPT.join(",")}
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  pick(f);
                }}
              />
            </span>
          ) : null}
        </div>
      </div>

      <div className="adm-brand-pv" role="group" aria-label={tx("brand_preview")}>
        <figure>
          <div className={`adm-pv-side${url && ratio >= 1.8 ? " is-stacked" : ""}`}>
            <BrandMark name={name} logoUrl={url} size={40} fit="auto" maxRatio={4.4} onRatio={setRatio} decorative />
            <strong>{name}</strong>
          </div>
          <figcaption>{tx("brand_previewSidebar")}</figcaption>
        </figure>
        <figure>
          <div className="adm-pv-narrow">
            <BrandMark name={name} logoUrl={url} size={40} decorative />
          </div>
          <figcaption>{tx("brand_previewCollapsed")}</figcaption>
        </figure>
        <figure>
          <div className="adm-pv-tab">
            <img src={tabIcon ?? "/favicon.svg"} alt="" width={16} height={16} />
            <span>{name}</span>
          </div>
          <figcaption>{tx("brand_previewTab")}</figcaption>
        </figure>
      </div>
      {!url ? <p className="cz-muted adm-small adm-brand-note">{tx("brand_noLogo")}</p> : null}
    </section>
  );
}

export function CompanySection({ canEdit }: { canEdit: boolean }) {
  const { tx } = useStore();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { refresh } = useAuth();
  const { organization: org, loading, error } = useOrganization();
  const [form] = Form.useForm<Values>();
  const branchType = Form.useWatch("branchType", form);

  const save = useMutation({
    mutationFn: (v: Values) => updateOrganization({ ...v, email: v.email ?? "" }),
    onSuccess: (o) => {
      qc.setQueryData(organizationQueryKey, o);
      form.setFieldsValue(o as Values);
      void refresh(); // sidebar company name comes from /api/auth/me
      message.success(tx("adm_companySaved"));
    },
    onError: (e) => message.error(errorText(tx, e)),
  });

  if (loading) return <LoadingState />;
  if (error || !org) return <ErrorState title={tx("adm_loadError")} />;

  return (
    <div className="adm-company">
      <div className="adm-company-head">
        <LogoPicker org={org} canEdit={canEdit} />
        <span className="cz-muted adm-small">{canEdit ? tx("adm_onDocs") : tx("adm_adminOnly")}</span>
      </div>
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        disabled={!canEdit}
        initialValues={org as Values}
        onFinish={(v) => save.mutate(v)}
        key={org.id}
      >
        <Group icon={Buildings} tone="primary" title={tx("adm_groupIdentity")}>
          <Form.Item
            className="adm-span-2"
            name="nameEn"
            label={tx("adm_companyNameEn")}
            rules={[{ required: true, whitespace: true, message: tx("adm_companyNameRequired") }]}
          >
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item name="nameTh" label={tx("adm_companyNameTh")}>
            <Input maxLength={200} lang="th" />
          </Form.Item>
          <Form.Item name="nameZh" label={tx("adm_companyNameZh")}>
            <Input maxLength={200} lang="zh" />
          </Form.Item>
        </Group>

        <Group icon={Receipt} tone="accent" title={tx("adm_groupTax")}>
          <Form.Item name="taxId" label={tx("adm_taxId")} rules={[{ pattern: /^[0-9-]{0,20}$/, message: tx("adm_taxIdInvalid") }]}>
            <Input maxLength={20} inputMode="numeric" className="cz-mono" />
          </Form.Item>
          <div className="adm-branch">
            <Form.Item name="branchType" label={tx("adm_branch")}>
              <Radio.Group
                optionType="button"
                options={[
                  { value: "head_office", label: tx("adm_headOffice") },
                  { value: "branch", label: tx("adm_branchOffice") },
                ]}
              />
            </Form.Item>
            {branchType === "branch" ? (
              <Form.Item name="branchCode" label={tx("adm_branchCode")} rules={[{ pattern: /^[0-9]{0,5}$/, message: tx("adm_branchCodeInvalid") }]}>
                <Input maxLength={5} inputMode="numeric" className="cz-mono" style={{ width: 110 }} />
              </Form.Item>
            ) : null}
          </div>
        </Group>

        <Group icon={MapPin} tone="info" title={tx("adm_groupContact")}>
          <Form.Item className="adm-span-2" name="addressTh" label={tx("adm_addressTh")}>
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={500} lang="th" />
          </Form.Item>
          <Form.Item className="adm-span-2" name="addressEn" label={tx("adm_addressEn")}>
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={500} />
          </Form.Item>
          <Form.Item className="adm-span-2" name="addressZh" label={tx("adm_addressZh")}>
            <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} maxLength={500} lang="zh" />
          </Form.Item>
          <Form.Item name="phone" label={tx("adm_phone")}>
            <Input maxLength={60} inputMode="tel" autoComplete="off" />
          </Form.Item>
          <Form.Item name="email" label={tx("adm_email")} rules={[{ type: "email", message: tx("adm_emailInvalid") }]}>
            <Input maxLength={200} inputMode="email" autoComplete="off" />
          </Form.Item>
          <Form.Item className="adm-span-2" name="website" label={tx("adm_website")}>
            <Input maxLength={200} inputMode="url" />
          </Form.Item>
        </Group>

        <Group icon={Bank} tone="success" title={tx("adm_groupBank")}>
          <Form.Item name="bankName" label={tx("adm_bankName")}>
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item name="bankBranch" label={tx("adm_bankBranch")}>
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item name="bankAccountName" label={tx("adm_bankAccountName")}>
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item name="bankAccountNo" label={tx("adm_bankAccountNo")}>
            <Input maxLength={60} className="cz-mono" />
          </Form.Item>
          <Form.Item name="bankSwift" label={tx("adm_bankSwift")}>
            <Input maxLength={20} className="cz-mono" />
          </Form.Item>
        </Group>

        <Group icon={FileText} tone="warning" title={tx("adm_groupDocs")}>
          <Form.Item name="defaultCurrency" label={tx("adm_defaultCurrency")}>
            <Select options={CURRENCIES.map((c) => ({ value: c, label: c }))} style={{ maxWidth: 160 }} />
          </Form.Item>
          <span />
          <Form.Item className="adm-span-2" name="invoiceFooter" label={tx("adm_invoiceFooter")}>
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} maxLength={1000} placeholder={tx("adm_footerPh")} />
          </Form.Item>
          <Form.Item className="adm-span-2" name="quotationFooter" label={tx("adm_quotationFooter")}>
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} maxLength={1000} placeholder={tx("adm_footerPh")} />
          </Form.Item>
        </Group>

        {canEdit ? (
          <div className="adm-sticky-save">
            <Button type="primary" htmlType="submit" loading={save.isPending}>
              {tx("adm_save")}
            </Button>
          </div>
        ) : null}
      </Form>
    </div>
  );
}
