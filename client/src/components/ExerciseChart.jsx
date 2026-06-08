import { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend, LabelList,
} from 'recharts';
import { format } from 'date-fns';

const SET_COLORS = ['#818cf8', '#34d399', '#fb923c', '#f472b6', '#38bdf8', '#a78bfa', '#4ade80', '#fbbf24'];

function valLabel(trackAs) {
  return trackAs === 'seconds' || trackAs === 'time' ? 'Seconds' : 'Reps';
}

function buildSessions(points) {
  const map = {};
  for (const p of points) {
    const key = p.activity_id ?? p.date;
    if (!map[key]) map[key] = {
      date: p.date,
      dateTs: new Date(p.date).getTime(),
      activity_name: p.activity_name,
      sets: [],
    };
    if (p.value != null) map[key].sets.push({ order: p.set_order, value: p.value });
  }
  return Object.values(map).sort((a, b) => a.dateTs - b.dateTs);
}

// Smart Y domain: if data is clustered away from 0, zoom in to show the trend clearly
function smartDomain(values) {
  if (!values.length) return [0, 10];
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min;
  // Start from 0 only if data goes near 0 (within 40% of max) or there's no variance
  const yMin = (range > 0 && min / max > 0.45)
    ? Math.max(0, Math.floor(min - range * 0.4))
    : 0;
  return [yMin, Math.ceil(max * 1.18)];
}

function makeXAxis(sessions) {
  const ts = sessions.map(s => s.dateTs);
  return {
    dataKey: 'dateTs',
    type: 'number',
    scale: 'time',
    domain: [Math.min(...ts) - 86400000 * 2, Math.max(...ts) + 86400000 * 2],
    ticks: ts,
    tickFormatter: (t) => format(new Date(t), 'MMM d'),
    tick: { fontSize: 10, fill: 'rgba(255,255,255,0.3)' },
    axisLine: { stroke: 'rgba(255,255,255,0.08)' },
    tickLine: false,
  };
}

function yAxisStyle(unit) {
  return {
    tick: { fontSize: 10, fill: 'rgba(255,255,255,0.3)' },
    axisLine: false,
    tickLine: false,
    label: { value: unit, angle: -90, position: 'insideLeft', fontSize: 10, fill: 'rgba(255,255,255,0.2)', offset: 10 },
  };
}

const GRID = { strokeDasharray: '3 3', stroke: 'rgba(255,255,255,0.04)' };
const MARGIN = { top: 16, right: 24, bottom: 32, left: 0 };

function PBLine({ value, label }) {
  if (!value) return null;
  return (
    <ReferenceLine y={value} stroke="rgba(99,102,241,0.35)" strokeDasharray="4 4"
      label={{ value: label, position: 'right', fontSize: 9, fill: 'rgba(99,102,241,0.7)' }} />
  );
}

// Trend badge: % change from first to last session
function TrendBadge({ firstVal, lastVal }) {
  if (firstVal == null || lastVal == null || firstVal === 0) return null;
  const pct = Math.round((lastVal / firstVal - 1) * 100);
  if (pct === 0) return <span className="text-xs text-white/25">no change</span>;
  return (
    <span className={`text-xs font-medium ${pct > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
      {pct > 0 ? '↑' : '↓'} {Math.abs(pct)}% since first session
    </span>
  );
}

// Per-set tooltip: shows all set values for a hovered session
function PerSetTooltip({ active, payload, trackAs }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const unit = trackAs === 'reps' ? '' : 's';
  return (
    <div className="bg-[#1e2535] border border-white/10 rounded-xl shadow-xl p-3 text-xs">
      <p className="text-white/50 mb-1">{format(new Date(d.date), 'MMM d, yyyy')}</p>
      <p className="text-white font-medium mb-2">{d.activity_name}</p>
      <div className="space-y-0.5">
        {payload.filter(p => p.value != null).map((p, i) => (
          <p key={i} style={{ color: p.color }}>
            {p.name}: <strong className="text-white">{p.value}{unit}</strong>
          </p>
        ))}
      </div>
    </div>
  );
}

function LineTooltip({ active, payload, mode, trackAs }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const unit = trackAs === 'reps' ? '' : 's';
  return (
    <div className="bg-[#1e2535] border border-white/10 rounded-xl shadow-xl p-3 text-xs">
      <p className="text-white/50 mb-1">{format(new Date(d.date), 'MMM d, yyyy')}</p>
      <p className="text-white font-medium mb-2">{d.activity_name}</p>
      {mode === 'dropoff' ? (
        <>
          <p className="text-indigo-400">First set: <strong className="text-white">{d.first}{unit}</strong></p>
          <p className="text-orange-400">Last set: <strong className="text-white">{d.last}{unit}</strong></p>
          {d.dropoff != null && (
            <p className="text-white/40 mt-1">
              Dropoff: {d.dropoff}{unit}
              {d.first > 0 ? ` (${Math.round(Math.abs(d.dropoff) / d.first * 100)}%)` : ''}
            </p>
          )}
        </>
      ) : (
        payload.map((p, i) => (
          <p key={i} style={{ color: p.color }}>
            {p.name}: <strong className="text-white">{p.value}{unit}</strong>
          </p>
        ))
      )}
    </div>
  );
}

const VIEW_MODES = [
  { value: 'perSet', label: 'Per set' },
  { value: 'total', label: 'Total' },
  { value: 'avg', label: 'Avg' },
  { value: 'dropoff', label: 'Dropoff' },
];

function ViewToggle({ mode, onChange }) {
  return (
    <div className="flex rounded-lg overflow-hidden border border-white/10 w-fit">
      {VIEW_MODES.map(m => (
        <button
          key={m.value}
          onClick={() => onChange(m.value)}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === m.value ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white/60'
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

function ChartHeader({ mode, onModeChange, trendFirst, trendLast }) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <ViewToggle mode={mode} onChange={onModeChange} />
      <TrendBadge firstVal={trendFirst} lastVal={trendLast} />
    </div>
  );
}

// ── Single-session stat display (no chart needed) ────────────────────────
function SingleSessionStats({ sessions, trackAs, viewMode, onModeChange }) {
  const s = sessions[0];
  const sorted = [...s.sets].sort((a, b) => a.order - b.order);
  const unit = trackAs === 'reps' ? '' : 's';
  const total = sorted.reduce((sum, x) => sum + x.value, 0);
  const avg = sorted.length ? Math.round(total / sorted.length * 10) / 10 : 0;

  return (
    <div className="space-y-3">
      <ViewToggle mode={viewMode} onChange={onModeChange} />
      <div className="py-4 px-2">
        <p className="text-white/25 text-xs mb-4">Only 1 session recorded — stats below</p>
        <div className="flex flex-wrap gap-4">
          {sorted.map((s, i) => (
            <div key={i} className="text-center">
              <p className="text-2xl font-bold" style={{ color: SET_COLORS[i % SET_COLORS.length] }}>
                {s.value}{unit}
              </p>
              <p className="text-white/30 text-xs mt-0.5">Set {i + 1}</p>
            </div>
          ))}
          {sorted.length > 1 && (
            <>
              <div className="text-center border-l border-white/10 pl-4">
                <p className="text-2xl font-bold text-white/70">{total}{unit}</p>
                <p className="text-white/30 text-xs mt-0.5">Total</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-white/50">{avg}{unit}</p>
                <p className="text-white/30 text-xs mt-0.5">Avg</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ExerciseChart({ points, trackAs }) {
  const [viewMode, setViewMode] = useState('perSet');

  if (!points || points.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-white/20 text-sm">
        No data in selected range
      </div>
    );
  }

  const unit = valLabel(trackAs);
  const sessions = buildSessions(points);
  const xa = makeXAxis(sessions);
  const showLabels = sessions.length <= 5;

  if (sessions.length === 1) {
    return <SingleSessionStats sessions={sessions} trackAs={trackAs} viewMode={viewMode} onModeChange={setViewMode} />;
  }

  // ── Per set (connected line per set order) ───────────────────────────
  if (viewMode === 'perSet') {
    const maxSetOrder = Math.max(...sessions.flatMap(s => s.sets.map(x => x.order)));
    const data = sessions.map(s => {
      const row = { dateTs: s.dateTs, date: s.date, activity_name: s.activity_name };
      for (let i = 0; i <= maxSetOrder; i++) {
        const found = s.sets.find(x => x.order === i);
        row[`s${i}`] = found?.value ?? null;
      }
      return row;
    });
    const allVals = data.flatMap(d =>
      Array.from({ length: maxSetOrder + 1 }, (_, i) => d[`s${i}`]).filter(v => v != null)
    );
    const [yMin, yMax] = smartDomain(allVals);
    const pb = allVals.length ? Math.max(...allVals) : 0;

    // Trend: best set of first vs best set of last session
    const firstBest = sessions[0].sets.length ? Math.max(...sessions[0].sets.map(s => s.value)) : null;
    const lastBest = sessions.at(-1).sets.length ? Math.max(...sessions.at(-1).sets.map(s => s.value)) : null;

    return (
      <div className="space-y-3">
        <ChartHeader mode={viewMode} onModeChange={setViewMode} trendFirst={firstBest} trendLast={lastBest} />
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={MARGIN}>
            <CartesianGrid {...GRID} />
            <XAxis {...xa} />
            <YAxis domain={[yMin, yMax]} {...yAxisStyle(unit)} />
            <Tooltip content={(p) => <PerSetTooltip {...p} trackAs={trackAs} />}
              cursor={{ stroke: 'rgba(255,255,255,0.1)' }} />
            <PBLine value={pb} label={`PB ${pb}`} />
            {Array.from({ length: maxSetOrder + 1 }, (_, i) => (
              <Line key={i} type="monotone" dataKey={`s${i}`} name={`Set ${i + 1}`}
                stroke={SET_COLORS[i % SET_COLORS.length]} strokeWidth={2}
                dot={{ r: 4, fill: SET_COLORS[i % SET_COLORS.length], strokeWidth: 0 }}
                activeDot={{ r: 6 }} isAnimationActive={false} connectNulls={false}>
                {showLabels && (
                  <LabelList dataKey={`s${i}`} position="top"
                    style={{ fontSize: 10, fill: 'rgba(255,255,255,0.45)' }}
                    formatter={(v) => v != null ? v : ''} />
                )}
              </Line>
            ))}
          </LineChart>
        </ResponsiveContainer>
        {maxSetOrder > 0 && (
          <div className="flex flex-wrap gap-3">
            {Array.from({ length: maxSetOrder + 1 }, (_, i) => (
              <span key={i} className="flex items-center gap-1.5 text-xs text-white/40">
                <span className="w-2.5 h-0.5 inline-block rounded" style={{ background: SET_COLORS[i % SET_COLORS.length] }} />
                Set {i + 1}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Total per session ────────────────────────────────────────────────
  if (viewMode === 'total') {
    const data = sessions.map(s => ({
      ...s,
      value: s.sets.reduce((sum, x) => sum + x.value, 0),
    }));
    const vals = data.map(d => d.value);
    const [yMin, yMax] = smartDomain(vals);
    const pb = Math.max(...vals);
    return (
      <div className="space-y-3">
        <ChartHeader mode={viewMode} onModeChange={setViewMode} trendFirst={data[0].value} trendLast={data.at(-1).value} />
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={MARGIN}>
            <CartesianGrid {...GRID} />
            <XAxis {...xa} />
            <YAxis domain={[yMin, yMax]} {...yAxisStyle(`Total ${unit.toLowerCase()}`)} />
            <Tooltip content={(p) => <LineTooltip {...p} mode="total" trackAs={trackAs} />}
              cursor={{ stroke: 'rgba(255,255,255,0.1)' }} />
            <PBLine value={pb} label={`Best ${pb}`} />
            <Line type="monotone" dataKey="value" name="Total" stroke="#818cf8" strokeWidth={2}
              dot={{ r: 4, fill: '#818cf8', strokeWidth: 0 }} activeDot={{ r: 6 }} isAnimationActive={false}>
              {showLabels && (
                <LabelList dataKey="value" position="top"
                  style={{ fontSize: 10, fill: 'rgba(255,255,255,0.45)' }} />
              )}
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // ── Avg per session ──────────────────────────────────────────────────
  if (viewMode === 'avg') {
    const data = sessions.map(s => ({
      ...s,
      value: s.sets.length
        ? Math.round(s.sets.reduce((sum, x) => sum + x.value, 0) / s.sets.length * 10) / 10
        : null,
    })).filter(d => d.value != null);
    const vals = data.map(d => d.value);
    const [yMin, yMax] = smartDomain(vals);
    const pb = Math.max(...vals);
    return (
      <div className="space-y-3">
        <ChartHeader mode={viewMode} onModeChange={setViewMode} trendFirst={data[0].value} trendLast={data.at(-1).value} />
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={MARGIN}>
            <CartesianGrid {...GRID} />
            <XAxis {...xa} />
            <YAxis domain={[yMin, yMax]} {...yAxisStyle(`Avg ${unit.toLowerCase()}`)} />
            <Tooltip content={(p) => <LineTooltip {...p} mode="avg" trackAs={trackAs} />}
              cursor={{ stroke: 'rgba(255,255,255,0.1)' }} />
            <PBLine value={pb} label={`Best avg ${pb}`} />
            <Line type="monotone" dataKey="value" name="Avg" stroke="#34d399" strokeWidth={2}
              dot={{ r: 4, fill: '#34d399', strokeWidth: 0 }} activeDot={{ r: 6 }} isAnimationActive={false}>
              {showLabels && (
                <LabelList dataKey="value" position="top"
                  style={{ fontSize: 10, fill: 'rgba(255,255,255,0.45)' }} />
              )}
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // ── Dropoff (first vs last set per session) ──────────────────────────
  if (viewMode === 'dropoff') {
    const data = sessions.map(s => {
      const sorted = [...s.sets].sort((a, b) => a.order - b.order);
      if (sorted.length === 0) return null;
      const first = sorted[0].value;
      const last = sorted.at(-1).value;
      return { ...s, first, last, dropoff: first - last };
    }).filter(Boolean);

    const allVals = data.flatMap(d => [d.first, d.last]);
    const [yMin, yMax] = smartDomain(allVals);
    const latestDropoff = data.at(-1);

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <ViewToggle mode={viewMode} onChange={setViewMode} />
          {latestDropoff && (
            <span className="text-xs text-white/35">
              Latest dropoff:{' '}
              <span className={latestDropoff.dropoff > 0 ? 'text-orange-400' : 'text-emerald-400'}>
                {latestDropoff.dropoff > 0 ? '-' : '+'}{Math.abs(latestDropoff.dropoff)}
                {trackAs !== 'reps' ? 's' : ''}
                {latestDropoff.first > 0 ? ` (${Math.round(Math.abs(latestDropoff.dropoff) / latestDropoff.first * 100)}%)` : ''}
              </span>
            </span>
          )}
        </div>
        <p className="text-white/25 text-xs">
          Gap closing over time = better consistency under fatigue
        </p>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={MARGIN}>
            <CartesianGrid {...GRID} />
            <XAxis {...xa} />
            <YAxis domain={[yMin, yMax]} {...yAxisStyle(unit)} />
            <Tooltip content={(p) => <LineTooltip {...p} mode="dropoff" trackAs={trackAs} />}
              cursor={{ stroke: 'rgba(255,255,255,0.1)' }} />
            <Legend iconType="line"
              wrapperStyle={{ fontSize: 11, paddingTop: 8, color: 'rgba(255,255,255,0.4)' }} />
            <Line type="monotone" dataKey="first" name="First set" stroke="#818cf8" strokeWidth={2}
              dot={{ r: 4, fill: '#818cf8', strokeWidth: 0 }} activeDot={{ r: 6 }} isAnimationActive={false}>
              {showLabels && (
                <LabelList dataKey="first" position="top"
                  style={{ fontSize: 10, fill: 'rgba(129,140,248,0.7)' }} />
              )}
            </Line>
            <Line type="monotone" dataKey="last" name="Last set" stroke="#fb923c" strokeWidth={2}
              dot={{ r: 4, fill: '#fb923c', strokeWidth: 0 }} activeDot={{ r: 6 }}
              strokeDasharray="5 3" isAnimationActive={false}>
              {showLabels && (
                <LabelList dataKey="last" position="bottom"
                  style={{ fontSize: 10, fill: 'rgba(251,146,60,0.7)' }} />
              )}
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return null;
}
