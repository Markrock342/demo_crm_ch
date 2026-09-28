import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAutomationRules,
  fetchLineChannel,
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from "../../api/notifications.ts";
import { useAuth } from "../../auth/AuthProvider";

export const notificationsKey = ["notifications"] as const;
export const unreadKey = ["notifications", "unread"] as const;
export const automationRulesKey = ["automation", "rules"] as const;
export const lineChannelKey = ["notifications", "channels", "line"] as const;

/** Unread badge for the signed-in user; polls every minute and on window focus. */
export function useUnreadCount(): number {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: unreadKey,
    queryFn: fetchUnreadCount,
    enabled: Boolean(user),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 20_000,
  });
  return user ? (q.data ?? 0) : 0;
}

export function useNotificationFeed() {
  const { user } = useAuth();
  return useQuery({
    queryKey: notificationsKey,
    queryFn: fetchNotifications,
    enabled: Boolean(user),
    refetchInterval: 120_000,
  });
}

/** Mark one / all read — optimistic so the dot and the badge clear at once. */
export function useMarkRead() {
  const qc = useQueryClient();
  const patch = (fn: (items: AppNotification[]) => AppNotification[]) => {
    qc.setQueryData<{ items: AppNotification[]; unread: number }>(notificationsKey, (old) => {
      if (!old) return old;
      const items = fn(old.items);
      return { items, unread: items.filter((i) => !i.read).length };
    });
  };
  const one = useMutation({
    mutationFn: markNotificationRead,
    onMutate: (id: string) => {
      const now = new Date().toISOString();
      patch((items) => items.map((i) => (i.id === id && !i.read ? { ...i, read: true, readAt: now } : i)));
      qc.setQueryData<number>(unreadKey, (n) => Math.max(0, (n ?? 1) - 1));
    },
    onSuccess: (d) => qc.setQueryData(unreadKey, d.unread),
    onError: () => void qc.invalidateQueries({ queryKey: notificationsKey }),
  });
  const all = useMutation({
    mutationFn: markAllNotificationsRead,
    onMutate: () => {
      const now = new Date().toISOString();
      patch((items) => items.map((i) => (i.read ? i : { ...i, read: true, readAt: now })));
      qc.setQueryData(unreadKey, 0);
    },
    onError: () => void qc.invalidateQueries({ queryKey: notificationsKey }),
  });
  return { markRead: one.mutate, markAllRead: all.mutateAsync, markingAll: all.isPending };
}

export function useAutomationRules() {
  const { user } = useAuth();
  return useQuery({ queryKey: automationRulesKey, queryFn: fetchAutomationRules, enabled: Boolean(user) });
}

export function useLineChannel() {
  const { user } = useAuth();
  return useQuery({ queryKey: lineChannelKey, queryFn: fetchLineChannel, enabled: Boolean(user) });
}
