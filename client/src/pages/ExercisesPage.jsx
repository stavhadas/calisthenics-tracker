import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { format, formatDistanceToNow } from 'date-fns';

const TRACK_OPTIONS = [
  { value: 'reps', label: 'Reps', desc: 'Count as repetitions' },
  { value: 'seconds', label: 'Seconds', desc: 'Reps field = seconds' },
  { value: 'time', label: 'Duration', desc: 'Use timed duration' },
];

function InlineEdit({ value, placeholder, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');

  const commit = () => {
    setEditing(false);
    if (draft !== value) onSave(draft);
  };

  if (!editing) return (
    <button onClick={() => { setDraft(value || ''); setEditing(true); }}
      className="text-left hover:text-indigo-400 transition-colors group flex items-center gap-1.5">
      <span className={value ? 'text-white' : 'text-white/25 italic'}>{value || placeholder}</span>
      <span className="opacity-0 group-hover:opacity-100 text-white/30 text-xs transition-opacity">✏</span>
    </button>
  );

  return (
    <input autoFocus value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
      className="bg-white/5 border border-indigo-500/50 rounded-lg px-2 py-0.5 text-sm text-white w-40 focus:outline-none" />
  );
}

export default function ExercisesPage() {
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    api.getExercises().then(d => setExercises(d.items)).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const update = async (garminName, body) => {
    await api.updateExercise(garminName, body);
    load();
  };

  const filtered = exercises.filter(ex =>
    !search || ex.display_name.toLowerCase().includes(search.toLowerCase()) ||
    ex.garmin_exercise_name.toLowerCase().includes(search.toLowerCase())
  );

  const totalSets = exercises.reduce((s, e) => s + e.total_sets, 0);
  const totalSessions = new Set(exercises.flatMap(e => [])).size;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-white">Exercises</h1>
        <p className="text-sm text-white/40 mt-0.5">{exercises.length} exercises · {totalSets} total sets</p>
      </div>

      {/* Stats cards */}
      {exercises.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
            <p className="text-2xl font-bold text-white">{exercises.length}</p>
            <p className="text-white/40 text-xs mt-1">Exercises tracked</p>
          </div>
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
            <p className="text-2xl font-bold text-white">{totalSets}</p>
            <p className="text-white/40 text-xs mt-1">Total sets</p>
          </div>
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
            <p className="text-2xl font-bold text-white">
              {exercises.filter(e => e.custom_display_name).length}
            </p>
            <p className="text-white/40 text-xs mt-1">Renamed</p>
          </div>
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
            <p className="text-2xl font-bold text-white">
              {exercises.filter(e => e.track_as !== 'reps').length}
            </p>
            <p className="text-white/40 text-xs mt-1">Custom tracking</p>
          </div>
        </div>
      )}

      {/* Search */}
      <input value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="Search exercises…"
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-indigo-500 transition-colors" />

      {/* Help text */}
      <p className="text-white/30 text-xs">
        Click a display name to rename it. Renames persist across all past and future syncs.
      </p>

      {loading && (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-white/5 rounded-xl animate-pulse" />)}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">🏋️</p>
          <p className="text-white/40 text-sm">
            {search ? 'No exercises match your search.' : 'No exercises yet. Sync activities first.'}
          </p>
        </div>
      )}

      {/* Exercise list */}
      <div className="space-y-2">
        {filtered.map((ex) => (
          <div key={ex.garmin_exercise_name}
            className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0 space-y-1">
              <InlineEdit
                value={ex.custom_display_name}
                placeholder={ex.garmin_exercise_name}
                onSave={(v) => update(ex.garmin_exercise_name, { displayName: v })}
              />
              <p className="text-white/25 text-xs truncate">{ex.garmin_exercise_name}</p>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {/* Track As */}
              <div className="flex rounded-lg overflow-hidden border border-white/10">
                {TRACK_OPTIONS.map((o) => (
                  <button key={o.value}
                    onClick={() => update(ex.garmin_exercise_name, { trackAs: o.value })}
                    title={o.desc}
                    className={`px-2.5 py-1 text-xs transition-colors ${
                      ex.track_as === o.value
                        ? 'bg-indigo-600 text-white'
                        : 'text-white/30 hover:text-white/60 hover:bg-white/5'
                    }`}>
                    {o.label}
                  </button>
                ))}
              </div>

              {/* Stats */}
              <div className="flex items-center gap-3 text-xs text-white/30">
                <span><span className="text-white/60 font-medium">{ex.total_sets}</span> sets</span>
                <span><span className="text-white/60 font-medium">{ex.activity_count}</span> sessions</span>
                {ex.last_seen && (
                  <span title={format(new Date(ex.last_seen), 'MMM d, yyyy')}>
                    {formatDistanceToNow(new Date(ex.last_seen))} ago
                  </span>
                )}
              </div>

              <button
                onClick={() => navigate(`/progress?exercise=${encodeURIComponent(ex.garmin_exercise_name)}`)}
                className="text-indigo-400 hover:text-indigo-300 text-xs font-medium transition-colors whitespace-nowrap">
                View progress →
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
