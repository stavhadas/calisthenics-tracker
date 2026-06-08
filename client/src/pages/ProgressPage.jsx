import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import ExerciseChart from '../components/ExerciseChart';
import { subMonths, format, parseISO } from 'date-fns';

const PRESETS = [
  { label: '1M', months: 1 },
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
  { label: '1Y', months: 12 },
];

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
      <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
      <p className="text-white/40 text-xs mt-1">{label}</p>
      {sub && <p className="text-white/20 text-xs mt-0.5">{sub}</p>}
    </div>
  );
}

export default function ProgressPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [exercises, setExercises] = useState([]);
  const [selected, setSelected] = useState(searchParams.get('exercise') || '');
  const [progressData, setProgressData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [preset, setPreset] = useState(1); // index into PRESETS
  const [from, setFrom] = useState(format(subMonths(new Date(), 3), 'yyyy-MM-dd'));
  const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    api.getExercises().then(d => {
      setExercises(d.items);
      if (!selected && d.items.length > 0) setSelected(d.items[0].garmin_exercise_name);
    });
  }, []);

  const applyPreset = (idx) => {
    setPreset(idx);
    setFrom(format(subMonths(new Date(), PRESETS[idx].months), 'yyyy-MM-dd'));
    setTo(format(new Date(), 'yyyy-MM-dd'));
  };

  useEffect(() => {
    if (!selected) return;
    setSearchParams({ exercise: selected }, { replace: true });
    setLoading(true);
    api.getExerciseProgress(selected, { from, to })
      .then(setProgressData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selected, from, to]);

  const ex = exercises.find(e => e.garmin_exercise_name === selected);
  const points = progressData?.points || [];
  const trackAs = progressData?.trackAs || 'reps';
  const unit = trackAs === 'reps' ? '' : 's';

  // Stats derived from points
  const values = points.filter(p => p.value != null).map(p => p.value);
  const pb = values.length ? Math.max(...values) : null;
  const latest = values.length ? values[values.length - 1] : null;
  const sessions = [...new Set(points.map(p => p.date))].length;
  const avg = values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;

  // Best set per session for sparkline summary
  const sessionBests = Object.entries(
    points.reduce((acc, p) => {
      if (p.value == null) return acc;
      if (!acc[p.date] || p.value > acc[p.date]) acc[p.date] = p.value;
      return acc;
    }, {})
  ).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-white">Progress</h1>
        <p className="text-sm text-white/40 mt-0.5">Track your improvement over time</p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-48">
          <label className="block text-xs text-white/30 mb-1.5">Exercise</label>
          <select value={selected} onChange={e => setSelected(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 appearance-none transition-colors">
            {exercises.map(e => (
              <option key={e.garmin_exercise_name} value={e.garmin_exercise_name}>{e.display_name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-white/30 mb-1.5">Range</label>
          <div className="flex rounded-xl overflow-hidden border border-white/10">
            {PRESETS.map((p, i) => (
              <button key={p.label} onClick={() => applyPreset(i)}
                className={`px-3 py-2 text-xs font-medium transition-colors ${
                  preset === i ? 'bg-indigo-600 text-white' : 'text-white/40 hover:text-white/70 hover:bg-white/5'
                }`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <div>
            <label className="block text-xs text-white/30 mb-1.5">From</label>
            <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPreset(-1); }}
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white/70 focus:outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label className="block text-xs text-white/30 mb-1.5">To</label>
            <input type="date" value={to} onChange={e => { setTo(e.target.value); setPreset(-1); }}
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white/70 focus:outline-none focus:border-indigo-500" />
          </div>
        </div>
      </div>

      {/* Exercise meta */}
      {ex && (
        <div className="flex items-center gap-3 flex-wrap text-xs">
          <span className="text-white/50">{ex.garmin_exercise_name}</span>
          <span className="bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-md">
            {trackAs === 'reps' ? 'Reps' : trackAs === 'seconds' ? 'Seconds' : 'Duration'}
          </span>
        </div>
      )}

      {/* Stats */}
      {values.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Personal best" value={`${pb}${unit}`} />
          <StatCard label="Latest" value={`${latest}${unit}`} />
          <StatCard label="Average" value={`${avg}${unit}`} sub={`over ${values.length} sets`} />
          <StatCard label="Sessions" value={sessions} sub={`in selected range`} />
        </div>
      )}

      {/* Chart */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-medium text-white/70">Performance</p>
          <p className="text-xs text-white/25">Per set: each dot = one set, color = set number</p>
        </div>
        {loading ? (
          <div className="h-64 bg-white/5 rounded-lg animate-pulse" />
        ) : (
          <ExerciseChart points={points} trackAs={trackAs} />
        )}
      </div>

      {/* Session bests table */}
      {sessionBests.length > 0 && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-white/[0.06]">
            <p className="text-sm font-medium text-white/70">Best set per session</p>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {sessionBests.slice().reverse().map(([date, best], i) => {
              const prev = sessionBests[sessionBests.length - 2 - i];
              const delta = prev ? best - prev[1] : null;
              return (
                <div key={date} className="flex items-center px-5 py-3 hover:bg-white/[0.02] transition-colors">
                  <span className="text-white/40 text-xs w-32">{format(parseISO(date.slice(0, 10)), 'MMM d, yyyy')}</span>
                  <div className="flex-1 mx-4">
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500/60 rounded-full transition-all"
                        style={{ width: `${pb ? (best / pb) * 100 : 0}%` }} />
                    </div>
                  </div>
                  <span className="text-white font-semibold tabular-nums text-sm w-16 text-right">
                    {best}{unit}
                  </span>
                  {delta !== null && (
                    <span className={`ml-3 text-xs w-12 text-right tabular-nums ${delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-red-400' : 'text-white/20'}`}>
                      {delta > 0 ? `+${delta}` : delta === 0 ? '—' : delta}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
