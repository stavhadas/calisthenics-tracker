import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { format } from 'date-fns';
import ActivityDetail from '../components/ActivityDetail';

const LEVEL_COLORS = {
  0: 'bg-slate-500/20 text-slate-400',
  1: 'bg-blue-500/20 text-blue-400',
  2: 'bg-cyan-500/20 text-cyan-400',
  3: 'bg-teal-500/20 text-teal-400',
  4: 'bg-green-500/20 text-green-400',
  5: 'bg-yellow-500/20 text-yellow-400',
  6: 'bg-orange-500/20 text-orange-400',
  7: 'bg-red-500/20 text-red-400',
};

function levelColor(level) {
  return LEVEL_COLORS[Math.floor(level)] || 'bg-indigo-500/20 text-indigo-400';
}

function typeColor(type) {
  const t = (type || '').toUpperCase();
  if (t.includes('PULL')) return 'bg-purple-500/20 text-purple-400';
  if (t.includes('PUSH')) return 'bg-blue-500/20 text-blue-400';
  return 'bg-white/5 text-white/50';
}

export default function ActivitiesPage() {
  const [activities, setActivities] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ type: '', level: '', from: '', to: '' });
  const [filterOptions, setFilterOptions] = useState({ types: [], levels: [] });
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const LIMIT = 20;

  useEffect(() => {
    api.getActivityFilters().then(setFilterOptions).catch(() => {});
  }, []);

  const fetchActivities = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getActivities({ page, limit: LIMIT, ...filters });
      setActivities(data.items);
      setTotal(data.total);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [page, filters]);

  useEffect(() => { fetchActivities(); }, [fetchActivities]);

  const setFilter = (key, value) => { setFilters(f => ({ ...f, [key]: value })); setPage(1); };

  const handleDelete = async (id) => {
    if (!confirm('Remove this activity?')) return;
    await api.deleteActivity(id);
    if (selectedId === id) setSelectedId(null);
    fetchActivities();
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Activities</h1>
          <p className="text-sm text-white/40 mt-0.5">{total} strength sessions recorded</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select value={filters.type} onChange={(e) => setFilter('type', e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/70 focus:outline-none focus:border-indigo-500 appearance-none">
          <option value="">All types</option>
          {filterOptions.types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filters.level} onChange={(e) => setFilter('level', e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/70 focus:outline-none focus:border-indigo-500 appearance-none">
          <option value="">All levels</option>
          {filterOptions.levels.map(l => <option key={l} value={l}>Level {l}</option>)}
        </select>
        <input type="date" value={filters.from} onChange={(e) => setFilter('from', e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/70 focus:outline-none focus:border-indigo-500" />
        <input type="date" value={filters.to} onChange={(e) => setFilter('to', e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/70 focus:outline-none focus:border-indigo-500" />
        {(filters.type || filters.level || filters.from || filters.to) && (
          <button onClick={() => { setFilters({ type: '', level: '', from: '', to: '' }); setPage(1); }}
            className="text-white/30 hover:text-white/70 text-xs px-2 transition-colors">
            Clear
          </button>
        )}
      </div>

      {/* Content */}
      <div className={`grid gap-4 ${selectedId ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
        {/* List */}
        <div className="space-y-2">
          {loading && (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />
              ))}
            </div>
          )}
          {!loading && activities.length === 0 && (
            <div className="text-center py-16">
              <p className="text-4xl mb-3">🏋️</p>
              <p className="text-white/40 text-sm">No activities yet.</p>
              <p className="text-white/25 text-xs mt-1">Connect Garmin to import your workouts.</p>
            </div>
          )}
          {activities.map((act) => (
            <div key={act.id} onClick={() => setSelectedId(act.id === selectedId ? null : act.id)}
              className={`group relative rounded-xl p-4 cursor-pointer transition-all duration-150 border ${
                selectedId === act.id
                  ? 'bg-indigo-500/10 border-indigo-500/40'
                  : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06] hover:border-white/10'
              }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-white text-sm truncate">{act.name}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-white/30 text-xs">{format(new Date(act.started_at), 'MMM d, yyyy')}</span>
                    <span className="text-white/15 text-xs">·</span>
                    <span className="text-white/40 text-xs">{act.set_count} sets</span>
                    {act.duration_seconds > 0 && (
                      <>
                        <span className="text-white/15 text-xs">·</span>
                        <span className="text-white/40 text-xs">{Math.round(act.duration_seconds / 60)} min</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {act.is_partial === 1 && (
                    <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-md">Partial</span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-md ${levelColor(act.level)}`}>
                    Lvl {act.level}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-md ${typeColor(act.activity_type)}`}>
                    {act.activity_type}
                  </span>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(act.id); }}
                    className="opacity-0 group-hover:opacity-100 text-white/20 hover:text-red-400 text-xs ml-1 transition-all">
                    ✕
                  </button>
                </div>
              </div>
            </div>
          ))}

          {totalPages > 1 && (
            <div className="flex items-center gap-2 justify-center pt-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs text-white/60 disabled:opacity-30 transition-colors">
                ← Prev
              </button>
              <span className="text-xs text-white/30">{page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs text-white/60 disabled:opacity-30 transition-colors">
                Next →
              </button>
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedId && <ActivityDetail id={selectedId} />}
      </div>
    </div>
  );
}
