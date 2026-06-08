import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { format } from 'date-fns';

function valueDisplay(set) {
  switch (set.track_as) {
    case 'seconds': return { val: set.value ?? '—', unit: 's' };
    case 'time': return { val: set.value != null ? set.value.toFixed(1) : '—', unit: 's' };
    default: return { val: set.value ?? '—', unit: 'reps' };
  }
}

export default function ActivityDetail({ id }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setData(null);
    api.getActivity(id).then(setData).catch(console.error).finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 space-y-3">
      {[...Array(6)].map((_, i) => <div key={i} className="h-8 bg-white/5 rounded-lg animate-pulse" />)}
    </div>
  );
  if (!data) return null;

  const { activity, sets } = data;

  // Group sets by exercise name for summary stats
  const byExercise = sets.reduce((acc, s) => {
    const k = s.display_name;
    if (!acc[k]) acc[k] = [];
    acc[k].push(s);
    return acc;
  }, {});

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/[0.06]">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-white text-sm">{activity.name}</h3>
            <p className="text-white/40 text-xs mt-1">
              {format(new Date(activity.started_at), 'MMMM d, yyyy · h:mm a')}
              {activity.duration_seconds > 0 && ` · ${Math.round(activity.duration_seconds / 60)} min`}
            </p>
          </div>
          {activity.is_partial === 1 && (
            <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-md flex-shrink-0">Partial</span>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="bg-white/5 rounded-lg p-3 text-center">
            <p className="text-lg font-semibold text-white">{sets.length}</p>
            <p className="text-white/40 text-xs">Sets</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3 text-center">
            <p className="text-lg font-semibold text-white">{Object.keys(byExercise).length}</p>
            <p className="text-white/40 text-xs">Exercises</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3 text-center">
            <p className="text-lg font-semibold text-white">
              {activity.duration_seconds > 0 ? Math.round(activity.duration_seconds / 60) : '—'}
            </p>
            <p className="text-white/40 text-xs">Min</p>
          </div>
        </div>
      </div>

      {/* Sets */}
      <div className="px-5 py-4">
        {sets.length === 0 ? (
          <p className="text-white/30 text-sm text-center py-4">No sets recorded</p>
        ) : (
          <div className="space-y-3">
            {Object.entries(byExercise).map(([name, exSets]) => (
              <div key={name}>
                <p className="text-xs font-medium text-white/50 uppercase tracking-wide mb-1.5">{name}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {exSets.map((set) => {
                    const { val, unit } = valueDisplay(set);
                    return (
                      <div key={set.id} className="bg-white/5 rounded-lg px-3 py-2 flex items-center justify-between">
                        <span className="text-white/30 text-xs">Set {set.set_order + 1}</span>
                        <span className="text-white text-sm font-semibold tabular-nums">
                          {val}<span className="text-white/30 text-xs font-normal ml-0.5">{unit}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
