/**
 * SfTimeline — React equivalent of lightning-record-activity-timeline
 *
 * Features:
 *  - Fetches Tasks, Events, Emails (EmailMessage) from related lists
 *  - activityTypes: 'tasks' | 'events' | 'emails' | 'all'
 *  - Chronological sort (newest first by default)
 *  - Expand/collapse each item to see body/description
 *  - Type icons + color coding
 *  - Mark Task complete (optimistic UI)
 *  - Loading skeleton, empty state, error state
 *  - Relative time labels ("2 days ago", "in 3 hours")
 */

import { useState, useEffect, useCallback } from 'react';
import { useSfContext } from '../SfProvider/SfProvider';
import type { SfTimelineProps, SfTimelineItem } from '../../types';
import './SfTimeline.css';

// ── Helpers ───────────────────────────────────────────────────────────────────
function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const abs  = Math.abs(diff);
  const past = diff > 0;
  const mins = Math.floor(abs / 60_000);
  const hrs  = Math.floor(abs / 3_600_000);
  const days = Math.floor(abs / 86_400_000);
  if (mins  < 1)   return 'just now';
  if (mins  < 60)  return past ? `${mins}m ago`        : `in ${mins}m`;
  if (hrs   < 24)  return past ? `${hrs}h ago`         : `in ${hrs}h`;
  if (days  < 7)   return past ? `${days}d ago`        : `in ${days}d`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const TYPE_CONFIG: Record<SfTimelineItem['type'], { icon: string; color: string; label: string }> = {
  task:  { icon: '✅', color: '#22a06b', label: 'Task' },
  event: { icon: '📅', color: '#0176d3', label: 'Event' },
  email: { icon: '✉️',  color: '#fe9339', label: 'Email' },
};

// ── Skeleton ──────────────────────────────────────────────────────────────────
function TimelineSkeleton() {
  return (
    <div className="sf-timeline__skeleton">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="sf-timeline__skeleton-item">
          <div className="sf-timeline__skeleton-icon" />
          <div className="sf-timeline__skeleton-body">
            <div className="sf-timeline__skeleton-line sf-timeline__skeleton-line--title" />
            <div className="sf-timeline__skeleton-line sf-timeline__skeleton-line--sub" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Timeline item ─────────────────────────────────────────────────────────────
function TimelineItem({
  item,
  onComplete,
}: {
  item: SfTimelineItem;
  onComplete?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const cfg = TYPE_CONFIG[item.type];
  const isPast = item.date ? new Date(item.date) < new Date() : false;

  return (
    <div className={`sf-timeline__item sf-timeline__item--${item.type} ${item.isCompleted ? 'sf-timeline__item--done' : ''}`}>
      {/* Timeline spine dot */}
      <div className="sf-timeline__dot-wrap">
        <div className="sf-timeline__dot" style={{ background: item.isCompleted ? '#c9c7c5' : cfg.color }}>
          <span className="sf-timeline__dot-icon" aria-hidden="true">{cfg.icon}</span>
        </div>
        <div className="sf-timeline__spine" />
      </div>

      {/* Content */}
      <div className="sf-timeline__content">
        <div className="sf-timeline__content-header">
          <div className="sf-timeline__title-row">
            {/* Task: checkbox to mark complete */}
            {item.type === 'task' && !item.isCompleted && (
              <button
                type="button"
                className="sf-timeline__complete-btn"
                onClick={() => onComplete?.(item.id)}
                title="Mark complete"
                aria-label="Mark task complete"
              >
                ○
              </button>
            )}
            {item.type === 'task' && item.isCompleted && (
              <span className="sf-timeline__complete-check" aria-label="Completed">✓</span>
            )}
            <span className={`sf-timeline__title ${item.isCompleted ? 'sf-timeline__title--done' : ''}`}>
              {item.subject}
            </span>
            <span
              className="sf-timeline__type-badge"
              style={{ background: cfg.color + '1a', color: cfg.color, border: `1px solid ${cfg.color}44` }}
            >
              {cfg.label}
            </span>
          </div>

          <div className="sf-timeline__meta-row">
            {item.assignedTo && (
              <span className="sf-timeline__meta-item">
                👤 {item.assignedTo}
              </span>
            )}
            {item.date && (
              <span className={`sf-timeline__meta-item ${!isPast && !item.isCompleted ? 'sf-timeline__meta-item--future' : ''}`}>
                🕐 {relativeTime(item.date)}
                <span className="sf-timeline__meta-abs">
                  {new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </span>
            )}
          </div>
        </div>

        {/* Expand/collapse body */}
        {item.description && (
          <div className="sf-timeline__expand">
            <button
              type="button"
              className="sf-timeline__expand-btn"
              onClick={() => setExpanded((e) => !e)}
              aria-expanded={expanded}
            >
              {expanded ? '▲ Hide details' : '▼ Show details'}
            </button>
            {expanded && (
              <div className="sf-timeline__description">{item.description}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function SfTimeline({
  recordId,
  activityTypes = 'all',
  maxItems = 20,
  sortOrder = 'desc',
  showFilters = true,
  onItemClick,
  onError,
  className = '',
}: SfTimelineProps) {
  const sf = useSfContext();

  const [items,    setItems]    = useState<SfTimelineItem[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [filter,   setFilter]   = useState<'all' | 'task' | 'event' | 'email'>(
    activityTypes === 'all' ? 'all' : activityTypes as 'task' | 'event' | 'email'
  );

  // ── Fetch activities ───────────────────────────────────────────────────────
  const fetchActivities = useCallback(() => {
    if (!recordId) return;
    setLoading(true);
    setError(null);

    const promises: Promise<SfTimelineItem[]>[] = [];
    const types = activityTypes === 'all'
      ? ['tasks', 'events', 'emails']
      : [activityTypes];

    // Tasks
    if (types.includes('tasks')) {
      promises.push(
        sf.getRelatedListRecords(recordId, 'ActivityHistories', [
          'Id', 'Subject', 'ActivityDate', 'Status', 'OwnerId', 'Owner.Name', 'Description',
        ])
        .then((rows) =>
          rows.map((r): SfTimelineItem => ({
            id:          String(r['Id'] ?? ''),
            type:        'task',
            subject:     String(r['Subject'] ?? 'Task'),
            date:        r['ActivityDate'] ? String(r['ActivityDate']) : undefined,
            assignedTo:  r['Owner.Name'] ? String(r['Owner.Name']) : undefined,
            description: r['Description'] ? String(r['Description']) : undefined,
            isCompleted: r['Status'] === 'Completed' || r['Status'] === 'Closed',
          }))
        )
        .catch(() => [] as SfTimelineItem[])
      );
      // Open tasks (OpenActivities)
      promises.push(
        sf.getRelatedListRecords(recordId, 'OpenActivities', [
          'Id', 'Subject', 'ActivityDate', 'Status', 'OwnerId', 'Owner.Name', 'Description',
        ])
        .then((rows) =>
          rows.map((r): SfTimelineItem => ({
            id:          String(r['Id'] ?? ''),
            type:        'task',
            subject:     String(r['Subject'] ?? 'Task'),
            date:        r['ActivityDate'] ? String(r['ActivityDate']) : undefined,
            assignedTo:  r['Owner.Name'] ? String(r['Owner.Name']) : undefined,
            description: r['Description'] ? String(r['Description']) : undefined,
            isCompleted: false,
          }))
        )
        .catch(() => [] as SfTimelineItem[])
      );
    }

    // Events
    if (types.includes('events')) {
      promises.push(
        sf.getRelatedListRecords(recordId, 'ActivityHistories', [
          'Id', 'Subject', 'ActivityDate', 'StartDateTime', 'Owner.Name', 'Description', 'IsAllDayEvent',
        ])
        .then((rows) =>
          rows
            .filter((r) => r['StartDateTime'])
            .map((r): SfTimelineItem => ({
              id:          String(r['Id'] ?? ''),
              type:        'event',
              subject:     String(r['Subject'] ?? 'Event'),
              date:        String(r['StartDateTime']),
              assignedTo:  r['Owner.Name'] ? String(r['Owner.Name']) : undefined,
              description: r['Description'] ? String(r['Description']) : undefined,
              isCompleted: true,
            }))
        )
        .catch(() => [] as SfTimelineItem[])
      );
    }

    // Emails
    if (types.includes('emails')) {
      promises.push(
        sf.getRelatedListRecords(recordId, 'EmailMessages', [
          'Id', 'Subject', 'MessageDate', 'FromName', 'TextBody', 'Status',
        ])
        .then((rows) =>
          rows.map((r): SfTimelineItem => ({
            id:          String(r['Id'] ?? ''),
            type:        'email',
            subject:     String(r['Subject'] ?? 'Email'),
            date:        r['MessageDate'] ? String(r['MessageDate']) : undefined,
            assignedTo:  r['FromName'] ? String(r['FromName']) : undefined,
            description: r['TextBody'] ? String(r['TextBody']).slice(0, 400) : undefined,
            isCompleted: true,
          }))
        )
        .catch(() => [] as SfTimelineItem[])
      );
    }

    Promise.all(promises)
      .then((results) => {
        const all = results.flat();
        // De-dupe by id
        const seen = new Set<string>();
        const deduped = all.filter((it) => {
          if (seen.has(it.id)) return false;
          seen.add(it.id);
          return true;
        });
        // Sort by date
        deduped.sort((a, b) => {
          const da = a.date ? new Date(a.date).getTime() : 0;
          const db = b.date ? new Date(b.date).getTime() : 0;
          return sortOrder === 'desc' ? db - da : da - db;
        });
        setItems(deduped.slice(0, maxItems));
        setLoading(false);
      })
      .catch((e: { message: string }) => {
        setError(e.message);
        onError?.(e);
        setLoading(false);
      });
  }, [recordId, activityTypes, maxItems, sortOrder]);

  useEffect(() => { fetchActivities(); }, [fetchActivities]);

  // ── Mark task complete (optimistic) ───────────────────────────────────────
  const handleComplete = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, isCompleted: true } : item
      )
    );
    // Fire-and-forget API update — real apps should handle errors
    sf.updateRecord('Task', id, { Status: 'Completed' }).catch(() => {
      // Revert optimistic update on error
      setItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, isCompleted: false } : item
        )
      );
    });
  }, []);

  // ── Filter ────────────────────────────────────────────────────────────────
  const visible = filter === 'all' ? items : items.filter((it) => it.type === filter);

  // ── Count by type ─────────────────────────────────────────────────────────
  const counts = {
    all:   items.length,
    task:  items.filter((i) => i.type === 'task').length,
    event: items.filter((i) => i.type === 'event').length,
    email: items.filter((i) => i.type === 'email').length,
  };

  const filterTabs: Array<{ key: typeof filter; label: string; icon: string }> = [
    { key: 'all',   label: 'All',    icon: '⚡' },
    { key: 'task',  label: 'Tasks',  icon: '✅' },
    { key: 'event', label: 'Events', icon: '📅' },
    { key: 'email', label: 'Emails', icon: '✉️'  },
  ];

  return (
    <div className={`sf-timeline ${className}`}>
      {/* Header */}
      <div className="sf-timeline__header">
        <h4 className="sf-timeline__header-title">Activity Timeline</h4>
        <div className="sf-timeline__header-actions">
          <button type="button" className="sf-timeline__refresh-btn" onClick={fetchActivities} title="Refresh">
            ↻
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      {showFilters && (
        <div className="sf-timeline__filters">
          {filterTabs.map((tab) => {
            const count = counts[tab.key];
            if (tab.key !== 'all' && count === 0) return null;
            return (
              <button
                key={tab.key}
                type="button"
                className={`sf-timeline__filter-btn ${filter === tab.key ? 'sf-timeline__filter-btn--active' : ''}`}
                onClick={() => setFilter(tab.key)}
              >
                {tab.icon} {tab.label}
                {count > 0 && <span className="sf-timeline__filter-count">{count}</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Body */}
      <div className="sf-timeline__body">
        {error ? (
          <div className="sf-timeline__error">⚠ {error}</div>
        ) : loading ? (
          <TimelineSkeleton />
        ) : visible.length === 0 ? (
          <div className="sf-timeline__empty">
            <span className="sf-timeline__empty-icon">📭</span>
            <span>No activities to display</span>
          </div>
        ) : (
          <div className="sf-timeline__list">
            {visible.map((item) => (
              <div key={item.id} onClick={() => onItemClick?.(item)} style={{ cursor: onItemClick ? 'pointer' : 'default' }}>
                <TimelineItem item={item} onComplete={handleComplete} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default SfTimeline;
