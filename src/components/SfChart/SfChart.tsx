/**
 * SfChart — React equivalent of lightning-chart for Salesforce aggregate data
 *
 * Features:
 *  - Runs aggregate SOQL via /query endpoint (COUNT, SUM, AVG, MIN, MAX)
 *  - Renders bar, pie, donut, line charts — pure SVG, zero dependencies
 *  - SLDS 2 Cosmos color palette
 *  - Responsive (uses ResizeObserver)
 *  - Loading skeleton, empty state, error state
 *  - Tooltip on hover
 *  - Optional legend
 *  - filter prop for scoped data (SOQL WHERE clause fragment)
 */

import {
  useState, useEffect, useRef, useCallback,
  type MouseEvent,
} from 'react';
import { useSfContext } from '../SfProvider/SfProvider';
import type { SfChartProps } from '../../types';
import './SfChart.css';

// ── SLDS 2 Cosmos palette ─────────────────────────────────────────────────────
const PALETTE = [
  '#0176d3', '#1b96ff', '#6eb5ff',  // blues
  '#22a06b', '#2db77b', '#4bca81',  // greens
  '#fe9339', '#ffc70f',             // amber
  '#e74c3c', '#f1827e',             // reds
  '#916db3', '#c3a9de',             // purples
  '#0b797c', '#5bc0bb',             // teals
];

// ── Aggregate SOQL builder ────────────────────────────────────────────────────
function buildSoql(props: SfChartProps): string {
  const { objectName, groupBy, aggregate, aggregateField, filter, maxGroups = 20 } = props;
  const aggClause =
    aggregate === 'COUNT'
      ? 'COUNT(Id) val__'
      : `${aggregate}(${aggregateField}) val__`;

  let soql = `SELECT ${groupBy}, ${aggClause} FROM ${objectName}`;
  if (filter) soql += ` WHERE ${filter}`;
  soql += ` GROUP BY ${groupBy} LIMIT ${maxGroups}`;
  return soql;
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface ChartPoint {
  label: string;
  value: number;
}

// ── Bar chart (SVG) ──────────────────────────────────────────────────────────
function BarChart({
  data, title, width, height,
}: {
  data: ChartPoint[];
  title: string;
  width: number;
  height: number;
}) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const paddingLeft  = 56;
  const paddingRight = 16;
  const paddingTop   = 16;
  const paddingBot   = 60;
  const chartW       = Math.max(width  - paddingLeft - paddingRight, 100);
  const chartH       = Math.max(height - paddingTop  - paddingBot,   80);

  const max = Math.max(...data.map((d) => d.value), 1);
  const barW   = Math.max((chartW / data.length) - 6, 8);
  const barGap = chartW / data.length;

  // Y axis labels
  const yTicks = 4;
  const yLabels = Array.from({ length: yTicks + 1 }, (_, i) => {
    const v = (max * i) / yTicks;
    return v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M`
         : v >= 1_000     ? `${(v / 1_000).toFixed(0)}K`
         : v.toFixed(0);
  });

  return (
    <svg
      width={width}
      height={height}
      className="sf-chart__svg"
      role="img"
      aria-label={title}
    >
      {/* Y-axis grid + labels */}
      {yLabels.map((lbl, i) => {
        const y = paddingTop + chartH - (chartH * i) / yTicks;
        return (
          <g key={i}>
            <line
              x1={paddingLeft} y1={y}
              x2={paddingLeft + chartW} y2={y}
              stroke="#e0e0e0" strokeWidth={i === 0 ? 1.5 : 1}
              strokeDasharray={i === 0 ? '' : '3,3'}
            />
            <text
              x={paddingLeft - 6} y={y + 4}
              textAnchor="end" fontSize={10} fill="#706e6b"
            >
              {lbl}
            </text>
          </g>
        );
      })}

      {/* Bars */}
      {data.map((d, i) => {
        const barH  = Math.max((d.value / max) * chartH, 2);
        const x     = paddingLeft + i * barGap + (barGap - barW) / 2;
        const y     = paddingTop + chartH - barH;
        const color = PALETTE[i % PALETTE.length];

        return (
          <g key={i}
            onMouseEnter={(e: MouseEvent<SVGGElement>) =>
              setTooltip({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, text: `${d.label}: ${d.value.toLocaleString()}` })
            }
            onMouseLeave={() => setTooltip(null)}
            style={{ cursor: 'pointer' }}
          >
            <rect x={x} y={y} width={barW} height={barH}
              fill={color} rx={3} opacity={0.9} />
            {/* X label */}
            <text
              x={x + barW / 2}
              y={paddingTop + chartH + 14}
              textAnchor="middle"
              fontSize={10}
              fill="#706e6b"
              style={{ userSelect: 'none' }}
            >
              {d.label.length > 10 ? d.label.slice(0, 9) + '…' : d.label}
            </text>
          </g>
        );
      })}

      {/* Tooltip */}
      {tooltip && (
        <g transform={`translate(${Math.min(tooltip.x + 10, width - 120)},${Math.max(tooltip.y - 28, 4)})`}>
          <rect width={110} height={24} rx={4} fill="#032d60" opacity={0.92} />
          <text x={8} y={16} fontSize={11} fill="#fff">{tooltip.text}</text>
        </g>
      )}
    </svg>
  );
}

// ── Pie / Donut chart (SVG) ───────────────────────────────────────────────────
function PieChart({
  data, title, width, height, donut,
}: {
  data: ChartPoint[];
  title: string;
  width: number;
  height: number;
  donut: boolean;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const cx    = width  / 2;
  const cy    = height / 2 - 10;
  const r     = Math.min(width, height) / 2 - 30;
  const inner = donut ? r * 0.52 : 0;

  const total = data.reduce((s, d) => s + d.value, 0) || 1;

  let angle = -Math.PI / 2;
  const slices = data.map((d, i) => {
    const sweep    = (d.value / total) * 2 * Math.PI;
    const startAngle = angle;
    angle += sweep;
    return { ...d, startAngle, endAngle: angle, color: PALETTE[i % PALETTE.length], idx: i };
  });

  function arc(startAngle: number, endAngle: number, outerR: number, innerR: number) {
    const x1 = cx + outerR * Math.cos(startAngle);
    const y1 = cy + outerR * Math.sin(startAngle);
    const x2 = cx + outerR * Math.cos(endAngle);
    const y2 = cy + outerR * Math.sin(endAngle);
    const x3 = cx + innerR * Math.cos(endAngle);
    const y3 = cy + innerR * Math.sin(endAngle);
    const x4 = cx + innerR * Math.cos(startAngle);
    const y4 = cy + innerR * Math.sin(startAngle);
    const large = endAngle - startAngle > Math.PI ? 1 : 0;
    if (innerR === 0) {
      return `M ${cx},${cy} L ${x1},${y1} A ${outerR},${outerR} 0 ${large} 1 ${x2},${y2} Z`;
    }
    return `M ${x1},${y1} A ${outerR},${outerR} 0 ${large} 1 ${x2},${y2} L ${x3},${y3} A ${innerR},${innerR} 0 ${large} 0 ${x4},${y4} Z`;
  }

  return (
    <svg width={width} height={height} className="sf-chart__svg" role="img" aria-label={title}>
      {slices.map((s) => {
        const scale  = hovered === s.idx ? 1.04 : 1;
        const midA   = (s.startAngle + s.endAngle) / 2;
        const dx     = (scale - 1) * r * 0.3 * Math.cos(midA);
        const dy     = (scale - 1) * r * 0.3 * Math.sin(midA);
        const pct    = ((s.value / total) * 100).toFixed(1);
        return (
          <g key={s.idx}
            transform={`translate(${dx},${dy})`}
            onMouseEnter={() => setHovered(s.idx)}
            onMouseLeave={() => setHovered(null)}
            style={{ cursor: 'pointer', transition: 'transform 0.15s' }}
          >
            <path d={arc(s.startAngle, s.endAngle, r, inner)} fill={s.color} opacity={0.92} />
            {hovered === s.idx && (
              <text
                x={cx + (r * 0.65) * Math.cos((s.startAngle + s.endAngle) / 2)}
                y={cy + (r * 0.65) * Math.sin((s.startAngle + s.endAngle) / 2)}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={11} fill="#fff" fontWeight="700"
              >
                {pct}%
              </text>
            )}
          </g>
        );
      })}
      {/* Donut center label */}
      {donut && (
        <>
          <text x={cx} y={cy - 6} textAnchor="middle" fontSize={22} fontWeight="700" fill="#181818">
            {total >= 1_000_000
              ? `${(total / 1_000_000).toFixed(1)}M`
              : total >= 1_000
              ? `${(total / 1_000).toFixed(0)}K`
              : total.toLocaleString()}
          </text>
          <text x={cx} y={cy + 14} textAnchor="middle" fontSize={11} fill="#706e6b">Total</text>
        </>
      )}
      {/* Legend */}
      {slices.map((s, i) => (
        <g key={i} transform={`translate(${16}, ${cy + r + 12 + i * 16})`}>
          <rect width={10} height={10} rx={2} fill={s.color} y={-1} />
          <text x={14} y={8} fontSize={10} fill="#3e3e3c">
            {s.label.length > 20 ? s.label.slice(0, 18) + '…' : s.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ── Line chart (SVG) ─────────────────────────────────────────────────────────
function LineChart({
  data, title, width, height,
}: {
  data: ChartPoint[];
  title: string;
  width: number;
  height: number;
}) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const paddingLeft = 56; const paddingRight = 16;
  const paddingTop  = 16; const paddingBot   = 50;
  const chartW = Math.max(width  - paddingLeft - paddingRight, 100);
  const chartH = Math.max(height - paddingTop  - paddingBot,   80);

  const max = Math.max(...data.map((d) => d.value), 1);

  const points = data.map((d, i) => ({
    x: paddingLeft + (i / Math.max(data.length - 1, 1)) * chartW,
    y: paddingTop + chartH - (d.value / max) * chartH,
    ...d,
  }));

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = [
    ...points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`),
    `L ${points[points.length - 1]!.x} ${paddingTop + chartH}`,
    `L ${points[0]!.x} ${paddingTop + chartH}`,
    'Z',
  ].join(' ');

  return (
    <svg width={width} height={height} className="sf-chart__svg" role="img" aria-label={title}>
      {/* Grid */}
      {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
        const y = paddingTop + chartH - t * chartH;
        const v = max * t;
        const lbl = v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M`
                  : v >= 1_000     ? `${(v / 1_000).toFixed(0)}K`
                  : v.toFixed(0);
        return (
          <g key={i}>
            <line x1={paddingLeft} y1={y} x2={paddingLeft + chartW} y2={y}
              stroke={i === 0 ? '#c0c0c0' : '#ebebeb'} strokeWidth={1}
              strokeDasharray={i === 0 ? '' : '3,3'} />
            <text x={paddingLeft - 6} y={y + 4} textAnchor="end" fontSize={10} fill="#706e6b">{lbl}</text>
          </g>
        );
      })}
      {/* Area fill */}
      <path d={areaD} fill={PALETTE[0]} opacity={0.12} />
      {/* Line */}
      <path d={pathD} fill="none" stroke={PALETTE[0]} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {/* Dots */}
      {points.map((p, i) => (
        <circle
          key={i} cx={p.x} cy={p.y} r={4}
          fill="#fff" stroke={PALETTE[0]} strokeWidth={2.5}
          style={{ cursor: 'pointer' }}
          onMouseEnter={(e) =>
            setTooltip({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, text: `${p.label}: ${p.value.toLocaleString()}` })
          }
          onMouseLeave={() => setTooltip(null)}
        />
      ))}
      {/* X labels */}
      {points.map((p, i) => (
        <text key={i} x={p.x} y={paddingTop + chartH + 14}
          textAnchor="middle" fontSize={10} fill="#706e6b">
          {p.label.length > 8 ? p.label.slice(0, 7) + '…' : p.label}
        </text>
      ))}
      {/* Tooltip */}
      {tooltip && (
        <g transform={`translate(${Math.min(tooltip.x + 10, width - 120)},${Math.max(tooltip.y - 28, 4)})`}>
          <rect width={120} height={24} rx={4} fill="#032d60" opacity={0.92} />
          <text x={8} y={16} fontSize={11} fill="#fff">{tooltip.text}</text>
        </g>
      )}
    </svg>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function ChartSkeleton({ height }: { height: number }) {
  return (
    <div className="sf-chart__skeleton" style={{ height }}>
      <div className="sf-chart__skeleton-bars">
        {[80, 55, 95, 40, 70, 85, 50].map((h, i) => (
          <div key={i} className="sf-chart__skeleton-bar" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function SfChart({
  type = 'bar',
  objectName,
  groupBy,
  aggregate,
  aggregateField,
  filter,
  maxGroups = 20,
  title,
  height = 300,
  onError,
  className = '',
}: SfChartProps) {
  const sf = useSfContext();

  const [data,    setData]    = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [width,   setWidth]   = useState(500);
  const containerRef = useRef<HTMLDivElement>(null);

  // Responsive width via ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(Math.floor(w));
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const fetchData = useCallback(() => {
    if (!objectName || !groupBy || !aggregate) return;
    setLoading(true);
    setError(null);

    const soql = buildSoql({ type, objectName, groupBy, aggregate, aggregateField, filter, maxGroups });
    const encoded = encodeURIComponent(soql);

    sf.config; // reference to keep lint happy
    // We reach directly into the API client via a raw fetch (SOQL query)
    // SfContextValue doesn't expose a generic query() method — we use config.orgUrl
    const { orgUrl, apiVersion = '59.0', accessToken } = sf.config;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

    fetch(`${orgUrl.replace(/\/$/, '')}/services/data/v${apiVersion}/query/?q=${encoded}`, {
      credentials: 'include',
      headers,
    })
      .then((r) => r.json())
      .then((json: { records: Array<Record<string, unknown>> }) => {
        const pts: ChartPoint[] = (json.records ?? []).map((row) => ({
          label: String(row[groupBy] ?? '(blank)'),
          value: Number(row['val__'] ?? row['expr0'] ?? 0),
        }));
        setData(pts);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        onError?.({ message: e.message });
        setLoading(false);
      });
  }, [objectName, groupBy, aggregate, aggregateField, filter, maxGroups, type]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const chartTitle = title ?? `${aggregate}(${aggregateField ?? 'Id'}) by ${groupBy}`;

  return (
    <div ref={containerRef} className={`sf-chart ${className}`}>
      {/* Header */}
      <div className="sf-chart__header">
        <div>
          <h4 className="sf-chart__title">{chartTitle}</h4>
          <span className="sf-chart__meta">{objectName} · {type} chart</span>
        </div>
        <button type="button" className="sf-chart__refresh" onClick={fetchData} title="Refresh">↻</button>
      </div>

      {/* Body */}
      <div className="sf-chart__body">
        {error ? (
          <div className="sf-chart__error">⚠ {error}</div>
        ) : loading ? (
          <ChartSkeleton height={height} />
        ) : data.length === 0 ? (
          <div className="sf-chart__empty">No data to display.</div>
        ) : type === 'bar' ? (
          <BarChart  data={data} title={chartTitle} width={width} height={height} />
        ) : type === 'line' ? (
          <LineChart data={data} title={chartTitle} width={width} height={height} />
        ) : (
          <PieChart  data={data} title={chartTitle} width={width} height={height} donut={type === 'donut'} />
        )}
      </div>
    </div>
  );
}

export default SfChart;
