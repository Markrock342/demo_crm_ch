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
        <PageToolbar title={tx("navNotifications")} hint={tx("apiNotConfigured")} />
      </div>
    );
  }

  return (
    <div className="page page--workspace">
      <PageToolbar
        title={tx("navNotifications")}
        count={note.notifications.length}
        hint={`${tx("shellDataBadge")} · ${note.unreadCount} unread`}
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
        <p className="empty">{tx("emptyShellCrm")}</p>
      ) : (
        <ul className="list-plain">
          {note.notifications.map((n) => (
            <li key={n.id}>
              <Link
                to={n.href}
                onClick={() => note.markRead(n.id)}
                className={!n.read ? "cell-strong" : "meta"}
              >
                [{n.kind}] {n.title}
              </Link>{" "}
              <span className="meta">{n.body}</span>
              {!n.read ? <span className="pill pill-warn">new</span> : null}
            </li>
          ))}
        </ul>
      )}
      <p className="meta">{tx("notifyEmailDeferred")}</p>
    </div>
  );
}
