import { Copy, Key, Plus, Prohibit, UserPlus } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Drawer, Form, Input, Modal, Popconfirm, Radio, Select, Switch } from "antd";
import { useMemo, useState } from "react";
import {
  ROLE_CODES,
  createUser,
  fetchAdminUsers,
  resetUserPassword,
  updateUser,
  type AdminUser,
  type RoleCode,
} from "../../api/admin.ts";
import { useAuth } from "../../auth/AuthProvider";
import { useStore } from "../../store";
import { CardGrid, Donut, EmptyState, EntityCard, ErrorState, IconBadge, Legend, LoadingState, PersonAvatar } from "../../v2/components";
import { userDisplayName, userQueryKey } from "../../v2/hooks/useUserLookup.ts";
import { PasswordRules } from "./PasswordRules.tsx";
import { RolePill, errorText, isPasswordError, roleLook } from "./shared.tsx";

const adminUsersKey = ["users", "admin"] as const;
const primaryRole = (u: AdminUser) => (u.roles.includes("SUPER_ADMIN") ? "SUPER_ADMIN" : (u.roles[0] ?? "VIEWER"));

function useRoleOptions() {
  const { tx } = useStore();
  return ROLE_CODES.map((code) => {
    const { icon: I, tone } = roleLook(code);
    return {
      value: code,
      title: tx(`adm_role_${code}`),
      label: (
        <span className="adm-role-opt">
          <IconBadge icon={I} tone={tone} size={26} />
          <span>
            <strong>{tx(`adm_role_${code}`)}</strong>
            <span className="cz-muted adm-small">{tx(`adm_roleHint_${code}`)}</span>
          </span>
        </span>
      ),
    };
  });
}

/** Shows a one-time password with a copy button. */
function TempPasswordModal({ value, name, onClose }: { value: string | null; name: string; onClose: () => void }) {
  const { tx } = useStore();
  const { message } = App.useApp();
  return (
    <Modal
      open={Boolean(value)}
      title={
        <span className="adm-block-title">
          <IconBadge icon={Key} tone="warning" size={28} />
          {tx("adm_tempTitle")}
        </span>
      }
      onCancel={onClose}
      maskClosable={false}
      footer={
        <Button type="primary" onClick={onClose}>
          {tx("adm_done")}
        </Button>
      }
    >
      <div className="adm-temp">
        <code className="adm-temp-code" data-testid="temp-password">
          {value}
        </code>
        <Button
          icon={<Copy size={16} />}
          onClick={() => {
            void navigator.clipboard?.writeText(value ?? "").then(() => message.success(tx("adm_copied")));
          }}
        >
          {tx("adm_copy")}
        </Button>
      </div>
      <p className="cz-muted">{tx("adm_tempHint", { name })}</p>
    </Modal>
  );
}

function DrawerFoot({ onCancel, onOk, busy, okLabel }: { onCancel: () => void; onOk: () => void; busy: boolean; okLabel: string }) {
  const { tx } = useStore();
  return (
    <div className="fin-drawer-foot">
      <Button type="text" onClick={onCancel}>
        {tx("adm_cancel")}
      </Button>
      <Button type="primary" loading={busy} onClick={onOk}>
        {okLabel}
      </Button>
    </div>
  );
}

type CreateValues = { email: string; name: string; nameTh?: string; nameZh?: string; role: RoleCode; pwMode: "temp" | "set"; password?: string };

function CreateUserDrawer({ open, onClose, onTemp }: { open: boolean; onClose: () => void; onTemp: (pw: string, name: string) => void }) {
  const { tx, locale } = useStore();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm<CreateValues>();
  const pwMode = Form.useWatch("pwMode", form);
  const pw = Form.useWatch("password", form) ?? "";
  const email = Form.useWatch("email", form);
  const roleOptions = useRoleOptions();

  const mut = useMutation({
    mutationFn: (v: CreateValues) =>
      createUser({
        email: v.email,
        name: v.name,
        nameTh: v.nameTh || null,
        nameZh: v.nameZh || null,
        role: v.role,
        password: v.pwMode === "set" ? v.password : null,
      }),
    onSuccess: ({ user, tempPassword }) => {
      void qc.invalidateQueries({ queryKey: adminUsersKey });
      void qc.invalidateQueries({ queryKey: userQueryKey });
      const name = userDisplayName(user, locale);
      message.success(tx("adm_userCreated", { name }));
      onClose();
      if (tempPassword) onTemp(tempPassword, name);
    },
    onError: (e) => {
      if (isPasswordError(e)) form.setFields([{ name: "password", errors: [errorText(tx, e)] }]);
      else if ((e as Error).message === "email_taken") form.setFields([{ name: "email", errors: [errorText(tx, e)] }]);
      else message.error(errorText(tx, e));
    },
  });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={tx("adm_addUser")}
      width={480}
      destroyOnClose
      footer={<DrawerFoot onCancel={onClose} onOk={() => form.submit()} busy={mut.isPending} okLabel={tx("adm_create")} />}
    >
      <Form form={form} layout="vertical" requiredMark initialValues={{ pwMode: "temp", role: "SALES" }} onFinish={(v) => mut.mutate(v)}>
        <Form.Item name="email" label={tx("adm_email")} rules={[{ required: true, type: "email", message: tx("adm_emailInvalid") }]}>
          <Input maxLength={200} inputMode="email" autoComplete="off" />
        </Form.Item>
        <Form.Item name="name" label={tx("adm_nameEn")} rules={[{ required: true, whitespace: true, message: tx("adm_nameRequired") }]}>
          <Input maxLength={120} autoComplete="off" />
        </Form.Item>
        <Form.Item name="nameTh" label={tx("adm_nameTh")}>
          <Input maxLength={120} lang="th" />
        </Form.Item>
        <Form.Item name="nameZh" label={tx("adm_nameZh")}>
          <Input maxLength={120} lang="zh" />
        </Form.Item>
        <Form.Item name="role" label={tx("adm_role")} rules={[{ required: true, message: tx("adm_roleRequired") }]}>
          <Select options={roleOptions} optionLabelProp="title" listHeight={360} />
        </Form.Item>
        <Form.Item name="pwMode" label={tx("adm_pwMode")}>
          <Radio.Group
            options={[
              { value: "temp", label: tx("adm_pwModeTemp") },
              { value: "set", label: tx("adm_pwModeSet") },
            ]}
          />
        </Form.Item>
        {pwMode === "set" ? (
          <Form.Item
            name="password"
            label={tx("adm_password")}
            rules={[{ required: true, message: tx("adm_required") }]}
            extra={<PasswordRules value={pw} email={email} />}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        ) : null}
      </Form>
    </Drawer>
  );
}

type EditValues = { name: string; nameTh?: string; nameZh?: string; role: RoleCode };

function EditUserDrawer({
  user,
  isSelf,
  onlyAdmin,
  onClose,
  onTemp,
}: {
  user: AdminUser | null;
  isSelf: boolean;
  onlyAdmin: boolean;
  onClose: () => void;
  onTemp: (pw: string, name: string) => void;
}) {
  const { tx, locale } = useStore();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm<EditValues>();
  const roleOptions = useRoleOptions();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: adminUsersKey });
    void qc.invalidateQueries({ queryKey: userQueryKey });
  };

  const save = useMutation({
    mutationFn: (v: EditValues) => updateUser(user!.id, { name: v.name, nameTh: v.nameTh || null, nameZh: v.nameZh || null, role: v.role }),
    onSuccess: () => {
      refresh();
      message.success(tx("adm_saved"));
      onClose();
    },
    onError: (e) => message.error(errorText(tx, e)),
  });
  const toggle = useMutation({
    mutationFn: (active: boolean) => updateUser(user!.id, { active }),
    onSuccess: () => {
      refresh();
      message.success(tx("adm_saved"));
    },
    onError: (e) => message.error(errorText(tx, e)),
  });
  const reset = useMutation({
    mutationFn: () => resetUserPassword(user!.id),
    onSuccess: ({ tempPassword }) => {
      if (tempPassword && user) onTemp(tempPassword, userDisplayName(user, locale));
    },
    onError: (e) => message.error(errorText(tx, e)),
  });

  const display = user ? userDisplayName(user, locale) : "";
  const current = qc.getQueryData<AdminUser[]>(adminUsersKey)?.find((u) => u.id === user?.id) ?? user;

  return (
    <Drawer
      open={Boolean(user)}
      onClose={onClose}
      title={tx("adm_editUser")}
      width={480}
      destroyOnClose
      footer={<DrawerFoot onCancel={onClose} onOk={() => form.submit()} busy={save.isPending} okLabel={tx("adm_save")} />}
    >
      {user ? (
        <>
          <div className="adm-identity is-compact">
            <PersonAvatar name={display} size={44} />
            <div className="adm-identity-text">
              <strong>{display}</strong>
              <span className="cz-muted">{user.email}</span>
            </div>
          </div>
          <Form
            form={form}
            layout="vertical"
            requiredMark
            initialValues={{ name: user.name, nameTh: user.nameTh ?? "", nameZh: user.nameZh ?? "", role: primaryRole(user) as RoleCode }}
            onFinish={(v) => save.mutate(v)}
          >
            <Form.Item name="name" label={tx("adm_nameEn")} rules={[{ required: true, whitespace: true, message: tx("adm_nameRequired") }]}>
              <Input maxLength={120} />
            </Form.Item>
            <Form.Item name="nameTh" label={tx("adm_nameTh")}>
              <Input maxLength={120} lang="th" />
            </Form.Item>
            <Form.Item name="nameZh" label={tx("adm_nameZh")}>
              <Input maxLength={120} lang="zh" />
            </Form.Item>
            <Form.Item
              name="role"
              label={tx("adm_role")}
              rules={[{ required: true, message: tx("adm_roleRequired") }]}
              extra={onlyAdmin ? tx("adm_err_last_admin") : undefined}
            >
              <Select options={roleOptions} optionLabelProp="title" listHeight={360} disabled={onlyAdmin} />
            </Form.Item>
          </Form>

          <div className="adm-danger-list">
            <div className="fin-setting-row">
              <div>
                <p className="fin-setting-label">{tx("adm_resetPassword")}</p>
                <p className="fin-setting-hint">{tx("adm_signOutOthersHint")}</p>
              </div>
              <Popconfirm title={tx("adm_resetPassword")} description={tx("adm_resetConfirm")} okText={tx("adm_resetPassword")} cancelText={tx("adm_cancel")} onConfirm={() => reset.mutate()}>
                <Button icon={<Key size={16} />} loading={reset.isPending}>
                  {tx("adm_resetPassword")}
                </Button>
              </Popconfirm>
            </div>
            <div className="fin-setting-row">
              <div>
                <p className="fin-setting-label">{tx("adm_accountStatus")}</p>
                <p className="fin-setting-hint">{current?.active ? tx("adm_active") : tx("adm_inactive")}</p>
              </div>
              {current?.active ? (
                <Popconfirm
                  title={tx("adm_deactivate")}
                  description={tx("adm_deactivateConfirm")}
                  okText={tx("adm_deactivate")}
                  okButtonProps={{ danger: true }}
                  cancelText={tx("adm_cancel")}
                  disabled={isSelf || onlyAdmin}
                  onConfirm={() => toggle.mutate(false)}
                >
                  <Button danger icon={<Prohibit size={16} />} loading={toggle.isPending} disabled={isSelf || onlyAdmin}>
                    {tx("adm_deactivate")}
                  </Button>
                </Popconfirm>
              ) : (
                <Button icon={<UserPlus size={16} />} loading={toggle.isPending} onClick={() => toggle.mutate(true)}>
                  {tx("adm_reactivate")}
                </Button>
              )}
            </div>
          </div>
        </>
      ) : null}
    </Drawer>
  );
}

export function UsersSection({ canManage }: { canManage: boolean }) {
  const { tx, locale } = useStore();
  const { user: me } = useAuth();
  const [showInactive, setShowInactive] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [temp, setTemp] = useState<{ pw: string; name: string } | null>(null);
  const users = useQuery({ queryKey: adminUsersKey, queryFn: fetchAdminUsers, enabled: canManage });

  const all = useMemo(() => users.data ?? [], [users.data]);
  const active = all.filter((u) => u.active);
  const shown = showInactive ? all : active;
  const activeAdmins = active.filter((u) => u.roles.includes("SUPER_ADMIN"));

  const mix = useMemo(() => {
    const counts = new Map<string, number>();
    for (const u of active) counts.set(primaryRole(u), (counts.get(primaryRole(u)) ?? 0) + 1);
    return ROLE_CODES.filter((c) => counts.get(c)).map((c) => ({ value: counts.get(c)!, tone: roleLook(c).tone, label: tx(`adm_role_${c}`) }));
  }, [active, tx]);

  if (!canManage) return <p className="fin-setting-hint">{tx("adm_usersAdminOnly")}</p>;
  if (users.isLoading) return <LoadingState />;
  if (users.error) return <ErrorState title={tx("adm_loadError")} />;

  return (
    <div className="adm-users">
      <div className="adm-users-summary">
        <Donut parts={mix} size={104} center={active.length} caption={tx("adm_active")} />
        <Legend items={mix.map((m) => ({ tone: m.tone, label: m.label, value: m.value }))} />
        <div className="adm-users-tools">
          <label className="adm-switch">
            <Switch size="small" checked={showInactive} onChange={setShowInactive} />
            {tx("adm_showInactive")}
            {all.length - active.length ? <span className="cz-board-count">{all.length - active.length}</span> : null}
          </label>
          <Button type="primary" icon={<Plus size={16} weight="bold" />} onClick={() => setCreating(true)}>
            {tx("adm_addUser")}
          </Button>
        </div>
      </div>

      {shown.length ? (
        <CardGrid min={250}>
          {shown.map((u) => {
            const name = userDisplayName(u, locale);
            const role = primaryRole(u);
            const isMe = u.id === me?.id;
            return (
              <div key={u.id} className={u.active ? "adm-user-card" : "adm-user-card is-off"} data-testid="user-card">
                <EntityCard
                  onClick={() => setEditing(u)}
                  media={<PersonAvatar name={name} size={40} />}
                  title={
                    <span className="adm-user-name">
                      {name}
                      {isMe ? <span className="adm-you">{tx("adm_you")}</span> : null}
                    </span>
                  }
                  subtitle={u.email}
                  footer={
                    <span className="adm-user-foot">
                      <RolePill code={role} label={tx(`adm_role_${role}`)} />
                      <span className={u.active ? "adm-status is-on" : "adm-status"}>{u.active ? tx("adm_active") : tx("adm_inactive")}</span>
                    </span>
                  }
                />
              </div>
            );
          })}
        </CardGrid>
      ) : (
        <EmptyState title={tx("adm_addUser")} action={<Button onClick={() => setCreating(true)}>{tx("adm_addUser")}</Button>} />
      )}

      <CreateUserDrawer open={creating} onClose={() => setCreating(false)} onTemp={(pw, name) => setTemp({ pw, name })} />
      <EditUserDrawer
        user={editing}
        isSelf={editing?.id === me?.id}
        onlyAdmin={Boolean(editing && editing.active && editing.roles.includes("SUPER_ADMIN") && activeAdmins.length <= 1)}
        onClose={() => setEditing(null)}
        onTemp={(pw, name) => setTemp({ pw, name })}
      />
      <TempPasswordModal value={temp?.pw ?? null} name={temp?.name ?? ""} onClose={() => setTemp(null)} />
    </div>
  );
}
