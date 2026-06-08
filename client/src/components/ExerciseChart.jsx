import { useState } from 'react';
import {
  ScatterChart, Scatter, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend,
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

function makeYAxis(maxVal, label) {
  return {
    domain: [0, Math.ceil((maxVal || 1) * 1.15)],
    tick: { fontSize: 10, fill: 'rgba(255,255,255,0.3)' },
    axisLine: false,
    tickLine: false,
    label: { value: label, angle: -90, position: 'insideLeft', fontSize: 10, fill: 'rgba(255,255,255,0.2)', offset: 10 },
  };
}

const GRID = { strokeDasharray: '3 3', stroke: 'rgba(255,255,255,0.04)' };
const MARGIN = { top: 10, right: 20, bottom: 30, left: 0 };

function PBLine({ value, label }) {
  if (!value) return null;
  return (
    <ReferenceLine y={value} stroke="rgba(99,102,241,0.3)" strokeDasharray="4 4"
      label={{ value: label, position: 'right', fontSize: 9, fill: 'rgba(99,102,241,0.6)' }} />
  );
}

function ScatterTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const unit = d.trackAs === 'reps' ? '' : 's';
  return (
    <div className="bg-[#1e2535] border border-white/10 rounded-xl shadow-xl p-3 text-xs">
      <p className="text-white/50 mb-1">{format(new Date(d.date), 'MMM d, yyyy')}</p>
      <p className="text-white font-medium">{d.activity_name}</p>
      <p className="text-indigo-400 mt-1">Set {d.set_order + 1}: <strong className="text-white">{d.value}{unit}</strong></p>
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

export default function ExerciseChart({ points, trackAs }) {
  const [viewMode, setViewMode] = useState('perSet');

  if (!points || points.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-white/20 text-sm">
        No data in selected range
      </div>
    );
  }

  const unit = valLabel(trackAs);
  const sessions = buildSessions(points);
  const xa = makeXAxis(sessions);

  // ── Per set (scatter) ────────────────────────────────────────────────
  if (viewMode === 'perSet') {
    const maxSet = Math.max(...points.map(p => p.set_order));
    const series = [];
    for (let i = 0; i <= maxSet; i++) {
      const pts = points
        .filter(p => p.set_order === i && p.value != null)
        .map(p => ({ ...p, dateTs: new Date(p.date).getTime() }));
      if (pts.length > 0) series.push({ setOrder: i, pts });
    }
    const allTs = points.map(p => new Date(p.date).getTime());
    const allVals = points.filter(p => p.value != null).map(p => p.value);
    const minTs = Math.min(...allTs);
    const maxTs = Math.max(...allTs);
    const xTicks = [...new Set(allTs)].sort();
    const pbValue = Math.max(...allVals);

    return (
      <div className="space-y-3">
        <ViewToggle mode={viewMode} onChange={setViewMode} />
        <ResponsiveContainer width="100%" height={280}>
          <ScatterChart margin={MARGIN}>
            <CartesianGrid {...GRID} />
            <XAxis
              dataKey="dateTs" type="number"
              domain={[minTs - 86400000 * 2, maxTs + 86400000 * 2]}
              ticks={xTicks}
              tickFormatter={(ts) => format(new Date(ts), 'MMM d')}
              tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }}
              axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
              tickLine={false}
            />
            <YAxis
              dataKey="value" domain={[0, Math.ceil(pbValue * 1.15)]}
              tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }}
              axisLine={false} tickLine={false}
              label={{ value: unit, angle: -90, position: 'insideLeft', fontSize: 10, fill: 'rgba(255,255,255,0.2)', offset: 10 }}
            />
            <Tooltip content={<ScatterTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)' }} />
            <PBLine value={pbValue} label={`PB: ${pbValue}`} />
            {series.map(({ setOrder, pts }) => (
              <Scatter key={setOrder} name={`Set ${setOrder + 1}`} data={pts}
                fill={SET_COLORS[setOrder % SET_COLORS.length]} opacity={0.85} r={5} />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // ── Total per session ────────────────────────────────────────────────
  if (viewMode === 'total') {
    const data = sessions.map(s => ({
      ...s,
      value: s.sets.reduce((sum, x) => sum + x.value, 0),
    }));
    const pb = Math.max(...data.map(d => d.value));
    return (
      <div className="space-y-3">
        <ViewToggle mode={viewMode} onChange={setViewMode} />
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={MARGIN}>
            <CartesianGrid {...GRID} />
            <XAxis {...xa} />
            <YAxis {...makeYAxis(pb, `Total ${unit.toLowerCase()}`)} />
            <Tooltip content={(p) => <LineTooltip {...p} mode="total" trackAs={trackAs} />}
              cursor={{ stroke: 'rgba(255,255,255,0.1)' }} />
            <PBLine value={pb} label={`Best: ${pb}`} />
            <Line type="monotone" dataKey="value" name="Total" stroke="#818cf8" strokeWidth={2}
              dot={{ r: 4, fill: '#818cf8', strokeWidth: 0 }} activeDot={{ r: 6 }} isAnimationActive={false} />
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
    const pb = Math.max(...data.map(d => d.value));
    return (
      <div className="space-y-3">
        <ViewToggle mode={viewMode} onChange={setViewMode} />
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={MARGIN}>
            <CartesianGrid {...GRID} />
            <XAxis {...xa} />
            <YAxis {...makeYAxis(pb, `Avg ${unit.toLowerCase()}`)} />
            <Tooltip content={(p) => <LineTooltip {...p} mode="avg" trackAs={trackAs} />}
              cursor={{ stroke: 'rgba(255,255,255,0.1)' }} />
            <PBLine value={pb} label={`Best avg: ${pb}`} />
            <Line type="monotone" dataKey="value" name="Session avg" stroke="#34d399" strokeWidth={2}
              dot={{ r: 4, fill: '#34d399', strokeWidth: 0 }} activeDot={{ r: 6 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // ── Dropoff (first vs last set) ──────────────────────────────────────
  if (viewMode === 'dropoff') {
    const data = sessions.map(s => {
      const sorted = [...s.sets].sort((a, b) => a.order - b.order);
      if (sorted.length === 0) return null;
      const first = sorted[0].value;
      const last = sorted.at(-1).value;
      return { ...s, first, last, dropoff: first - last };
    }).filter(Boolean);

    const maxVal = data.length ? Math.max(...data.flatMap(d => [d.first, d.last])) : 0;

    return (
      <div className="space-y-3">
        <ViewToggle mode={viewMode} onChange={setViewMode} />
        <p className="text-white/25 text-xs">
          First vs last set — gap closing over time means better consistency
        </p>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={MARGIN}>
            <CartesianGrid {...GRID} />
            <XAxis {...xa} />
            <YAxis {...makeYAxis(maxVal, unit)} />
            <Tooltip content={(p) => <LineTooltip {...p} mode="dropoff" trackAs={trackAs} />}
              cursor={{ stroke: 'rgba(255,255,255,0.1)' }} />
            <Legend
              iconType="line"
              wrapperStyle={{ fontSize: 11, paddingTop: 8, color: 'rgba(255,255,255,0.4)' }}
            />
            <Line type="monotone" dataKey="first" name="First set" stroke="#818cf8" strokeWidth={2}
              dot={{ r: 3, fill: '#818cf8', strokeWidth: 0 }} activeDot={{ r: 5 }} isAnimationActive={false} />
            <Line type="monotone" dataKey="last" name="Last set" stroke="#fb923c" strokeWidth={2}
              dot={{ r: 3, fill: '#fb923c', strokeWidth: 0 }} activeDot={{ r: 5 }}
              strokeDasharray="5 3" isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return null;
}
