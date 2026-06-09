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

function SetCell({ set, activityId, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const { val, unit } = valueDisplay(set);

  const startEdit = () => {
    setDraft(val === '—' ? '' : String(val));
    setEditing(true);
  };

  const commit = async () => {
    setEditing(false);
    const num = parseFloat(draft);
    if (isNaN(num) || num === val) return;
    const field = set.track_as === 'time' ? 'duration_seconds' : 'reps';
    try {
      await api.updateSet(activityId, set.id, { [field]: Math.round(num) });
      onUpdate();
    } catch (e) { console.error(e); }
  };

  if (editing) {
    return (
      <div className="bg-white/8 border border-indigo-500/40 rounded-lg px-3 py-2 flex items-center justify-between">
        <span className="text-white/30 text-xs">Set {set.set_order + 1}</span>
        <div className="flex items-center gap-0.5">
          <input
            autoFocus
            type="number"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter') e.target.blur();
              if (e.key === 'Escape') setEditing(false);
            }}
            className="w-12 bg-transparent text-right text-sm font-semibold text-white tabular-nums focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="text-white/30 text-xs">{unit}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="bg-white/5 rounded-lg px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-white/8 transition-colors"
      onClick={startEdit}
    >
      <span className="text-white/30 text-xs">Set {set.set_order + 1}</span>
      <span className="text-white text-sm font-semibold tabular-nums">
        {val}<span className="text-white/30 text-xs font-normal ml-0.5">{unit}</span>
      </span>
    </div>
  );
}

function SetGrid({ sets, activityId, onUpdate }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
      {sets.map((set) => (
        <SetCell key={set.id} set={set} activityId={activityId} onUpdate={onUpdate} />
      ))}
    </div>
  );
}

function ExerciseBlock({ group, activityId, onUpdate }) {
  return (
    <div className={group.skipped ? 'opacity-40' : ''}>
      <div className="flex items-center gap-2 mb-1.5">
        <p className="text-xs font-medium text-white/50 uppercase tracking-wide flex-1 truncate">
          {group.display_name}
        </p>
        <span className="text-white/25 text-xs shrink-0">{group.planned_sets} planned</span>
        {group.skipped && (
          <span className="text-xs bg-white/8 text-white/30 px-2 py-0.5 rounded-md shrink-0">Skipped</span>
        )}
      </div>
      {group.skipped ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {[...Array(group.planned_sets)].map((_, j) => (
            <div key={j} className="bg-white/3 border border-dashed border-white/10 rounded-lg px-3 py-2 flex items-center justify-center">
              <span className="text-white/20 text-xs">—</span>
            </div>
          ))}
        </div>
      ) : (
        <SetGrid sets={group.sets} activityId={activityId} onUpdate={onUpdate} />
      )}
    </div>
  );
}

function PlanGroupList({ planGroups, activityId, onUpdate }) {
  const units = [];
  let i = 0;
  while (i < planGroups.length) {
    const g = planGroups[i];
    if (g.superset_id != null) {
      const bundle = [g];
      while (i + 1 < planGroups.length && planGroups[i + 1].superset_id === g.superset_id) {
        i++;
        bundle.push(planGroups[i]);
      }
      units.push({ type: 'superset', iterations: g.superset_iterations, groups: bundle });
    } else {
      units.push({ type: 'solo', group: g });
    }
    i++;
  }

  return (
    <div className="space-y-3">
      {units.map((unit, ui) => {
        if (unit.type === 'solo') {
          return (
            <ExerciseBlock key={`solo-${ui}`} group={unit.group} activityId={activityId} onUpdate={onUpdate} />
          );
        }
        const allSkipped = unit.groups.every(g => g.skipped);
        return (
          <div
            key={`superset-${ui}`}
            className={`border border-white/8 rounded-xl px-3 pt-2.5 pb-3 space-y-3 ${allSkipped ? 'opacity-40' : ''}`}
          >
            <p className="text-white/30 text-xs font-medium tracking-wider uppercase">
              Superset ×{unit.iterations}
            </p>
            {unit.groups.map((g, gi) => (
              <ExerciseBlock key={`${g.garmin_exercise_name}-${gi}`} group={g} activityId={activityId} onUpdate={onUpdate} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function FlatGroupList({ sets, activityId, onUpdate }) {
  const byExercise = sets.reduce((acc, s) => {
    const k = s.display_name;
    if (!acc[k]) acc[k] = [];
    acc[k].push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-3">
      {Object.entries(byExercise).map(([name, exSets]) => (
        <div key={name}>
          <p className="text-xs font-medium text-white/50 uppercase tracking-wide mb-1.5">{name}</p>
          <SetGrid sets={exSets} activityId={activityId} onUpdate={onUpdate} />
        </div>
      ))}
    </div>
  );
}

export default function ActivityDetail({ id }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadData = () => api.getActivity(id).then(setData).catch(console.error);

  useEffect(() => {
    setLoading(true);
    setData(null);
    loadData().finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 space-y-3">
      {[...Array(6)].map((_, i) => <div key={i} className="h-8 bg-white/5 rounded-lg animate-pulse" />)}
    </div>
  );
  if (!data) return null;

  const { activity, sets, planGroups } = data;

  const totalRecorded = sets.length;
  const skippedCount = planGroups ? planGroups.filter(g => g.skipped).length : 0;
  const doneCount = planGroups ? planGroups.filter(g => !g.skipped).length : Object.keys(
    sets.reduce((acc, s) => { acc[s.display_name] = true; return acc; }, {})
  ).length;

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
            <p className="text-lg font-semibold text-white">{totalRecorded}</p>
            <p className="text-white/40 text-xs">Sets</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3 text-center">
            <p className="text-lg font-semibold text-white">{doneCount}</p>
            <p className="text-white/40 text-xs">Exercises</p>
          </div>
          {skippedCount > 0 ? (
            <div className="bg-white/5 rounded-lg p-3 text-center">
              <p className="text-lg font-semibold text-white/50">{skippedCount}</p>
              <p className="text-white/40 text-xs">Skipped</p>
            </div>
          ) : (
            <div className="bg-white/5 rounded-lg p-3 text-center">
              <p className="text-lg font-semibold text-white">
                {activity.duration_seconds > 0 ? Math.round(activity.duration_seconds / 60) : '—'}
              </p>
              <p className="text-white/40 text-xs">Min</p>
            </div>
          )}
        </div>
      </div>

      {/* Sets */}
      <div className="px-5 py-4">
        {sets.length === 0 && !planGroups ? (
          <p className="text-white/30 text-sm text-center py-4">No sets recorded</p>
        ) : planGroups ? (
          <PlanGroupList planGroups={planGroups} activityId={activity.id} onUpdate={loadData} />
        ) : (
          <FlatGroupList sets={sets} activityId={activity.id} onUpdate={loadData} />
        )}
      </div>
    </div>
  );
}
