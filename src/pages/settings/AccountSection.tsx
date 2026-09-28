import { Key, UserCircle } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Form, Input } from "antd";
import { changePassword, fetchAccount, updateAccount } from "../../api/admin.ts";
import { useAuth } from "../../auth/AuthProvider";
import { useStore } from "../../store";
import { ErrorState, IconBadge, LoadingState, PersonAvatar } from "../../v2/components";
import { userDisplayName, userQueryKey } from "../../v2/hooks/useUserLookup.ts";
import { PasswordRules } from "./PasswordRules.tsx";
import { RolePill, errorText, isPasswordError } from "./shared.tsx";

type NameValues = { name: string; nameTh?: string; nameZh?: string };
type PwValues = { currentPassword: string; newPassword: string; confirm: string };

export function AccountSection() {
  const { tx, locale } = useStore();
  const { message } = App.useApp();
  const { refresh } = useAuth();
  const qc = useQueryClient();
  const account = useQuery({ queryKey: ["account"], queryFn: fetchAccount });
  const [nameForm] = Form.useForm<NameValues>();
  const [pwForm] = Form.useForm<PwValues>();
  const newPw = Form.useWatch("newPassword", pwForm) ?? "";

  const saveNames = useMutation({
    mutationFn: (v: NameValues) => updateAccount({ name: v.name, nameTh: v.nameTh ?? null, nameZh: v.nameZh ?? null }),
    onSuccess: (acc) => {
      qc.setQueryData(["account"], acc);
      void qc.invalidateQueries({ queryKey: userQueryKey });
      void qc.invalidateQueries({ queryKey: ["users", "admin"] });
      void refresh();
      message.success(tx("adm_saved"));
    },
    onError: (e) => message.error(errorText(tx, e)),
  });

  const savePw = useMutation({
    mutationFn: (v: PwValues) => changePassword(v.currentPassword, v.newPassword),
    onSuccess: () => {
      pwForm.resetFields();
      void qc.invalidateQueries({ queryKey: ["account"] });
      message.success(tx("adm_pwChanged"));
    },
    onError: (e) => {
      if (isPasswordError(e)) {
        const field = (e as Error).message === "wrong_password" ? "currentPassword" : "newPassword";
        pwForm.setFields([{ name: field, errors: [errorText(tx, e)] }]);
      } else message.error(errorText(tx, e));
    },
  });

  if (account.isLoading) return <LoadingState />;
  if (account.error || !account.data) return <ErrorState title={tx("adm_loadError")} />;
  const acc = account.data;
  const display = userDisplayName(acc, locale);
  const changedAt = acc.passwordChangedAt
    ? new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : locale === "th" ? "th-TH" : "en-GB", { dateStyle: "medium" }).format(
        new Date(acc.passwordChangedAt),
      )
    : null;

  return (
    <div className="adm-account">
      <div className="adm-identity">
        <PersonAvatar name={display} size={56} />
        <div className="adm-identity-text">
          <strong>{display}</strong>
          <span className="cz-muted">{acc.email}</span>
        </div>
        <span className="adm-identity-roles">
          {acc.roles.map((r) => (
            <RolePill key={r} code={r} label={tx(`adm_role_${r}`)} />
          ))}
        </span>
      </div>

      <div className="adm-two">
        <section className="adm-block" aria-labelledby="adm-names-h">
          <h3 id="adm-names-h" className="adm-block-title">
            <IconBadge icon={UserCircle} tone="info" size={28} />
            {tx("adm_names")}
          </h3>
          <Form
            form={nameForm}
            layout="vertical"
            requiredMark={false}
            initialValues={{ name: acc.name, nameTh: acc.nameTh ?? "", nameZh: acc.nameZh ?? "" }}
            onFinish={(v) => saveNames.mutate(v)}
          >
            <Form.Item name="name" label={tx("adm_nameEn")} rules={[{ required: true, whitespace: true, message: tx("adm_nameRequired") }]}>
              <Input maxLength={120} autoComplete="name" />
            </Form.Item>
            <Form.Item name="nameTh" label={tx("adm_nameTh")}>
              <Input maxLength={120} lang="th" />
            </Form.Item>
            <Form.Item name="nameZh" label={tx("adm_nameZh")}>
              <Input maxLength={120} lang="zh" />
            </Form.Item>
            <Form.Item label={tx("adm_email")} extra={tx("adm_emailReadonly")}>
              <Input value={acc.email} readOnly disabled aria-readonly />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={saveNames.isPending}>
              {tx("adm_save")}
            </Button>
          </Form>
        </section>

        <section className="adm-block" aria-labelledby="adm-pw-h">
          <h3 id="adm-pw-h" className="adm-block-title">
            <IconBadge icon={Key} tone="warning" size={28} />
            {tx("adm_changePassword")}
            <span className="adm-block-meta">{changedAt ? tx("adm_pwLastChanged", { date: changedAt }) : tx("adm_pwNeverChanged")}</span>
          </h3>
          <Form form={pwForm} layout="vertical" requiredMark={false} onFinish={(v) => savePw.mutate(v)}>
            {/* Lets password managers pair the new password with this account. */}
            <input type="email" name="username" autoComplete="username" value={acc.email} readOnly hidden />
            <Form.Item name="currentPassword" label={tx("adm_currentPassword")} rules={[{ required: true, message: tx("adm_required") }]}>
              <Input.Password autoComplete="current-password" />
            </Form.Item>
            <Form.Item
              name="newPassword"
              label={tx("adm_newPassword")}
              rules={[{ required: true, message: tx("adm_required") }]}
              extra={<PasswordRules value={newPw} email={acc.email} />}
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>
            <Form.Item
              name="confirm"
              label={tx("adm_confirmPassword")}
              dependencies={["newPassword"]}
              rules={[
                { required: true, message: tx("adm_required") },
                ({ getFieldValue }) => ({
                  validator: (_, v) => (!v || v === getFieldValue("newPassword") ? Promise.resolve() : Promise.reject(new Error(tx("adm_pwMismatch")))),
                }),
              ]}
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>
            <div className="adm-actions">
              <Button type="primary" htmlType="submit" loading={savePw.isPending}>
                {tx("adm_changePassword")}
              </Button>
              <span className="cz-muted adm-small">{tx("adm_signOutOthersHint")}</span>
            </div>
          </Form>
        </section>
      </div>
    </div>
  );
}
