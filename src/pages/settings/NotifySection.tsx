import { Bell, ChatCircleText, Copy, LinkBreak, UserPlus } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { App, Button, Popconfirm, Switch } from "antd";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { createLineCode, setLineEnabled, unlinkLine, type LineChannel } from "../../api/notifications.ts";
import type { Locale } from "../../i18n";
import { useStore } from "../../store";
import { IconBadge, Panel, StatusTag } from "../../v2/components";
import { lineChannelKey, useLineChannel, useUnreadCount } from "../../v2/hooks/useNotifications.ts";
import { fmtDate, fmtDateTime } from "../../v2/lib/format.ts";
import { Row } from "./shared.tsx";
import "../notify.css";

/** Settings → notifications panel (self-contained, anchor #settings-notify): in-app (always on) and, when the company LINE OA is configured, LINE linking. */
export function NotifySection() {
  const { tx, locale } = useStore();
  const loc = locale as Locale;
  const { message } = App.useApp();
  const qc = useQueryClient();
  const unread = useUnreadCount();
  const line = useLineChannel();
  const ch = line.data;
  const waiting = Boolean(ch?.available && !ch.linked && ch.code);

  // While a code is out, poll so the page flips to "connected" soon after the user sends it.
  const refetchLine = line.refetch;
  useEffect(() => {
    if (!waiting) return;
    const t = window.setInterval(() => void refetchLine(), 5000);
    return () => window.clearInterval(t);
  }, [waiting, refetchLine]);

  const set = (d: LineChannel) => qc.setQueryData(lineChannelKey, d);
  const onErr = () => message.error(tx("nt_error"));

  const getCode = useMutation({ mutationFn: createLineCode, onSuccess: set, onError: onErr });
  const toggle = useMutation({ mutationFn: setLineEnabled, onSuccess: (d) => (set(d), message.success(tx("nt_saved"))), onError: onErr });
  const unlink = useMutation({ mutationFn: unlinkLine, onSuccess: set, onError: onErr });

  async function check() {
    const r = await line.refetch();
    if (r.data?.linked) message.success(tx("nt_lineDone"));
    else message.info(tx("nt_lineStillWaiting"));
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      message.success(tx("nt_copied"));
    } catch {
      /* clipboard blocked — the code is on screen */
    }
  }

  const oa = ch?.oaId ?? null;

  return (
    <div id="settings-notify" className="adm-anchor">
      <Panel
        title={
          <span className="fin-panel-title">
            <IconBadge icon={Bell} tone="warning" size={30} />
            {tx("nt_secTitle")}
          </span>
        }
      >
        <Row
          label={
            <span className="fin-panel-title">
              <IconBadge icon={Bell} tone="primary" size={28} />
              {tx("nt_channelInApp")}
            </span>
          }
          hint={tx("nt_inAppHint")}
        >
          <span className="nt-set-status">
            <StatusTag status="DONE" label={tx("fin_on")} />
            <Link to="/notifications" className="cz-link-btn">
              {unread ? tx("nt_unreadNow", { n: unread }) : tx("nt_open")}
            </Link>
          </span>
        </Row>

        {ch?.available ? (
          <Row
            label={
              <span className="fin-panel-title">
                <IconBadge icon={ChatCircleText} tone="success" size={28} />
                {tx("nt_channelLine")}
              </span>
            }
            hint={ch.linked && ch.linkedAt ? tx("nt_lineSince", { date: fmtDate(ch.linkedAt, loc) }) : tx("nt_lineHint")}
          >
            {ch.linked ? (
              <span className="nt-set-status">
                <StatusTag status="DONE" label={tx("nt_lineLinked")} />
                <Switch
                  checked={ch.enabled}
                  loading={toggle.isPending}
                  onChange={(v) => toggle.mutate(v)}
                  aria-label={tx("nt_lineReceive")}
                />
                <Popconfirm
                  title={tx("nt_lineUnlinkConfirm")}
                  onConfirm={() => unlink.mutate()}
                  okText={tx("nt_lineUnlink")}
                  cancelText={tx("adm_cancel")}
                >
                  <Button size="small" icon={<LinkBreak size={14} />} loading={unlink.isPending}>
                    {tx("nt_lineUnlink")}
                  </Button>
                </Popconfirm>
              </span>
            ) : (
              <span className="nt-set-status">
                <StatusTag status="PENDING" label={tx("nt_lineNotLinked")} />
                {!ch.code ? (
                  <Button type="primary" loading={getCode.isPending} onClick={() => getCode.mutate()}>
                    {tx("nt_lineGetCode")}
                  </Button>
                ) : null}
              </span>
            )}
          </Row>
        ) : null}

        {waiting && ch?.code ? (
          <div className="nt-link-box" aria-live="polite">
            <ol className="nt-link-steps">
              <li>
                <span className="nt-step-no">1</span>
                <span>{tx("nt_lineStep1")}</span>
                {oa ? (
                  <Button
                    size="small"
                    icon={<UserPlus size={14} />}
                    href={`https://line.me/R/ti/p/${encodeURIComponent(oa)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {tx("nt_addFriend")} <span className="cz-mono">{oa}</span>
                  </Button>
                ) : null}
              </li>
              <li>
                <span className="nt-step-no">2</span>
                <span>{tx("nt_lineStep2")}</span>
                <span className="nt-code">{ch.code}</span>
                <Button size="small" icon={<Copy size={14} />} onClick={() => void copy(ch.code!)} aria-label={tx("nt_copy")}>
                  {tx("nt_copy")}
                </Button>
              </li>
            </ol>
            <div className="nt-link-foot">
              {ch.codeExpiresAt ? <span>{tx("nt_lineExpires", { time: fmtDateTime(ch.codeExpiresAt, loc) })}</span> : null}
              <Button type="primary" size="small" onClick={() => void check()} loading={line.isFetching}>
                {tx("nt_lineCheck")}
              </Button>
              <Button size="small" type="text" onClick={() => getCode.mutate()} loading={getCode.isPending}>
                {tx("nt_lineGetCode")}
              </Button>
            </div>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
