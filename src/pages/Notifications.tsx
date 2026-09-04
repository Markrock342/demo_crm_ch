import { Link } from "react-router-dom";
import { useShellNotifications } from "../shell/notificationStore.tsx";
import { useIsShellMode } from "../shell/session.tsx";
import { useStore } from "../store";
import { PageToolbar } from "../ui/PageToolbar";

export function NotificationsPage() {
  const shell = useIsShellMode();
  const { tx } = useStore();
  const note = useShellNotifications();

  if (!shell) {
    return (
      <div className="page page--workspace">
        <PageToolbar title={tx("navNotifications")} />
        <p className="empty">{tx("apiNotConfigured")}</p>
      </div>
    );
  }

  return (
    <div className="page page--workspace">
      <PageToolbar
        title={tx("navNotifications")}
        count={note.notifications.length}
        hint={`${tx("shellDataBadge")} · ${note.unreadCount} ${tx("notifyUnreadHint")}`}
        actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => note.refreshFromShell()}>
              {tx("notifyRefresh")}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => note.markAllRead()}>
              {tx("notifyMarkAll")}
            </button>
            <Link className="btn btn-ghost" to="/exceptions">
              {tx("navExceptions")}
            </Link>
          </>
        }
      />
      {note.notifications.length === 0 ? (
        <p className="empty">{tx("emptyNotifications")}</p>
      ) : (
        <ul className="dense-list">
          {note.notifications.map((n) => (
            <li key={n.id}>
              <Link to={n.href} onClick={() => note.markRead(n.id)} className={!n.read ? "cell-strong" : "meta"}>
                <strong>
                  [{n.kind}] {n.title}
                </strong>
                <span className="meta">{n.body}</span>
              </Link>
              {!n.read ? <span className="pill pill-warn">{tx("unread")}</span> : null}
            </li>
          ))}
        </ul>
      )}
      <p className="meta page-foot">{tx("notifyEmailDeferred")}</p>
    </div>
  );
}
