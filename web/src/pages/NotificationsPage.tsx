import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { NotificationItem } from '../api/client';
import { api } from '../api/client';

function notificationAge(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
}

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const { data: notifications, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data } = await api.get<NotificationItem[]>('/api/notifications');
      return data;
    },
    refetchInterval: 30_000,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/api/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const unreadCount = (notifications ?? []).filter((item) => !item.read).length;

  return (
    <div className="notifications-page">
      <section className="dashboard-hero notifications-hero">
        <div>
          <span className="journey-pill">Role-based alerts</span>
          <h2>Notifications</h2>
          <p>
            Ticket movement, proof requests, comments, mentions, and payment updates appear
            here only for the users who should act or track that activity.
          </p>
        </div>
        <div className="notification-stat">
          <strong>{unreadCount}</strong>
          <span>Unread</span>
        </div>
      </section>

      <section className="dashboard-panel notification-list">
        {isLoading ? <p className="muted">Loading notifications...</p> : null}
        {!isLoading && !(notifications ?? []).length ? (
          <p className="empty-state">No notifications yet.</p>
        ) : null}
        {(notifications ?? []).map((item) => (
          <article
            key={item.id}
            className={`notification-row ${item.read ? 'read' : 'unread'}`}
          >
            <div className="notification-dot" aria-hidden="true" />
            <div>
              <div className="notification-row-header">
                <strong>{item.title}</strong>
                <span>{notificationAge(item.createdAt)}</span>
              </div>
              <p>{item.message}</p>
              <div className="notification-actions">
                {item.link ? (
                  <Link
                    to={item.link}
                    className="btn btn-secondary"
                    onClick={() => {
                      if (!item.read) markRead.mutate(item.id);
                    }}
                  >
                    Open
                  </Link>
                ) : null}
                {!item.read ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => markRead.mutate(item.id)}
                    disabled={markRead.isPending}
                  >
                    Mark read
                  </button>
                ) : (
                  <span className="badge badge-slate">Read</span>
                )}
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
