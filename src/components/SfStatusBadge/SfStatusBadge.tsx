/**
 * SfStatusBadge — React equivalent of lightning-badge with Salesforce picklist awareness
 *
 * Features:
 *  - Color-coded pill badge driven by a colorMap prop
 *  - Falls back to sensible built-in colors for common Salesforce status values
 *  - SLDS 2 (Cosmos) color tokens via CSS custom properties
 *  - Dot indicator variant
 *  - Accessible via aria-label
 */

import type { SfStatusBadgeProps } from '../../types';
import './SfStatusBadge.css';

// ── Built-in color rules for common SF picklist patterns ──────────────────────
const BUILTIN_COLORS: Record<string, string> = {
  // Opportunity stages
  'Prospecting':              'blue',
  'Qualification':            'blue',
  'Needs Analysis':           'blue',
  'Value Proposition':        'indigo',
  'Id. Decision Makers':      'indigo',
  'Perception Analysis':      'indigo',
  'Proposal/Price Quote':     'purple',
  'Negotiation/Review':       'orange',
  'Closed Won':               'green',
  'Closed Lost':              'red',
  // Lead / Case status
  'New':                      'blue',
  'Open':                     'blue',
  'Working':                  'indigo',
  'In Progress':              'indigo',
  'Nurturing':                'purple',
  'Converted':                'green',
  'Unqualified':              'gray',
  'Closed':                   'green',
  'Escalated':                'red',
  // Generic
  'Active':                   'green',
  'Inactive':                 'gray',
  'Pending':                  'orange',
  'Draft':                    'gray',
  'Approved':                 'green',
  'Rejected':                 'red',
  'Cancelled':                'red',
  'Complete':                 'green',
  'Completed':                'green',
  'On Hold':                  'orange',
  'In Review':                'indigo',
  // Boolean-like
  'true':                     'green',
  'false':                    'gray',
  'Yes':                      'green',
  'No':                       'gray',
};

function resolveColor(
  value: string,
  colorMap?: Record<string, string>
): string {
  if (colorMap?.[value]) return colorMap[value];
  return BUILTIN_COLORS[value] ?? 'gray';
}

export function SfStatusBadge({
  value,
  colorMap,
  label,
  showDot = false,
  size = 'medium',
  className = '',
}: SfStatusBadgeProps) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const displayLabel = label ?? value;
  const color        = resolveColor(String(value), colorMap);

  return (
    <span
      className={`sf-badge sf-badge--${color} sf-badge--${size} ${className}`.trim()}
      aria-label={`Status: ${displayLabel}`}
      role="status"
    >
      {showDot && <span className="sf-badge__dot" aria-hidden="true" />}
      {displayLabel}
    </span>
  );
}

export default SfStatusBadge;
