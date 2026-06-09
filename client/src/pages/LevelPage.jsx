import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { format } from 'date-fns';
import ExerciseChart from '../components/ExerciseChart';

function TrackAsToggle({ value, onChange }) {
  const opts = [
    { value: 'reps', label: 'Reps' },
    { value: 'seconds', label: 'Secs' },
    { value: 'time', label: 'Time' },
  ];
  return (
    <div className="flex rounded-lg overflow-hidden border border-white/10">
      {opts.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${
            value === o.value
              ? 'bg-indigo-600 text-white'
              : 'bg-transparent text-white/40 hover:text-white/70'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ExerciseCard({ exercise, onUpdate }) {
  const [expanded, setExpanded] = useState(false);
  const [displayName, setDisplayName] = useState(exercise.custom_display_name || '');
  const [trackAs, setTrackAs] = useState(exercise.track_as || 'reps');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDisplayName(exercise.custom_display_name || '');
    setTrackAs(exercise.track_as || 'reps');
  }, [exercise.custom_display_name, exercise.track_as]);

  const handleNameBlur = async () => {
    if (displayName === (exercise.custom_display_name || '')) return;
    setSaving(true);
    try {
      await api.updateExercise(exercise.garmin_exercise_name, { displayName });
      onUpdate();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const handleTrackAsChange = async (val) => {
    setTrackAs(val);
    setSaving(true);
    try {
      await api.updateExercise(exercise.garmin_exercise_name, { trackAs: val });
      onUpdate();
    } catch (e) {
      setTrackAs(exercise.track_as);
      console.error(e);
    }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-white/[0.03] border border-white/8 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center gap-3 p-4 hover:bg-white/3 transition-colors text-left"
        onClick={() => setExpanded(e => !e)}
      >
        <span
          className="text-white/25 text-xs shrink-0 transition-transform duration-150"
          style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >
          ▶
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium truncate">{exercise.display_name}</p>
          <p className="text-white/30 text-xs mt-0.5">
            {exercise.planned_sets != null && (
              <span className="text-indigo-400/60">{exercise.planned_sets} planned · </span>
            )}
            {exercise.session_count} session{exercise.session_count !== 1 ? 's' : ''}
            {' · '}
            {exercise.total_sets} sets
            {exercise.last_seen && ` · Last ${format(new Date(exercise.last_seen), 'MMM d')}`}
          </p>
        </div>
        <span className="text-white/20 text-xs shrink-0">{exercise.track_as}</span>
      </button>

      {expanded && (
        <div className="border-t border-white/6 px-4 pb-5">
          {exercise.progress.length > 0 ? (
            <div className="mt-4">
              <ExerciseChart points={exercise.progress} trackAs={trackAs} />
            </div>
          ) : (
            <div className="h-24 flex items-center justify-center text-white/20 text-sm mt-4">
              No data
            </div>
          )}

          {/* Inline edit controls */}
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-36">
              <label className="text-white/30 text-xs block mb-1.5">Display name</label>
              <input
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                onBlur={handleNameBlur}
                onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                placeholder={exercise.garmin_exercise_name}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
            <div>
              <label className="text-white/30 text-xs block mb-1.5">Track as</label>
              <TrackAsToggle value={trackAs} onChange={handleTrackAsChange} />
            </div>
            {saving && (
              <span className="text-white/20 text-xs pb-1.5">Saving…</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function LevelPage() {
  const [levels, setLevels] = useState([]);
  const [selectedLevel, setSelectedLevel] = useState(null);
  const [selectedType, setSelectedType] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loadingLevels, setLoadingLevels] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    api.getLevels()
      .then(data => {
        const lvls = data.levels || [];
        setLevels(lvls);
        if (lvls.length) {
          setSelectedLevel(lvls[0].level);
          setSelectedType(lvls[0].types[0]?.type || null);
        }
      })
      .catch(console.error)
      .finally(() => setLoadingLevels(false));
  }, []);

  useEffect(() => {
    if (selectedLevel == null || !selectedType) return;
    setLoadingDetail(true);
    api.getLevelDetail(selectedLevel, selectedType)
      .then(setDetail)
      .catch(console.error)
      .finally(() => setLoadingDetail(false));
  }, [selectedLevel, selectedType]);

  const refreshDetail = () => {
    if (selectedLevel == null || !selectedType) return;
    api.getLevelDetail(selectedLevel, selectedType).then(setDetail).catch(console.error);
  };

  const selectedLevelObj = levels.find(l => l.level === selectedLevel);

  if (loadingLevels) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-white/30 text-sm">Loading…</div>
      </div>
    );
  }

  if (!levels.length) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
        <div className="text-5xl">📊</div>
        <p className="text-white/60 text-lg font-medium">No activities yet</p>
        <p className="text-white/30 text-sm">Sync activities to browse by level.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Level selector */}
      <div>
        <p className="text-white/30 text-xs uppercase tracking-wider mb-2">Level</p>
        <div className="flex flex-wrap gap-2">
          {levels.map(l => (
            <button
              key={l.level}
              onClick={() => {
                setSelectedLevel(l.level);
                setSelectedType(l.types[0]?.type || null);
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedLevel === l.level
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'
              }`}
            >
              {l.level}
            </button>
          ))}
        </div>
      </div>

      {/* Type selector */}
      {selectedLevelObj && (
        <div>
          <p className="text-white/30 text-xs uppercase tracking-wider mb-2">Activity type</p>
          <div className="flex flex-wrap gap-2">
            {selectedLevelObj.types.map(t => (
              <button
                key={t.type}
                onClick={() => setSelectedType(t.type)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedType === t.type
                    ? 'bg-white/15 text-white'
                    : 'bg-white/5 text-white/40 hover:bg-white/8 hover:text-white/70'
                }`}
              >
                {t.type}
                <span className="text-white/30 text-xs">{t.sessionCount}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Exercise list */}
      {loadingDetail ? (
        <div className="flex items-center justify-center h-32">
          <div className="text-white/30 text-sm">Loading…</div>
        </div>
      ) : detail ? (
        <div className="space-y-3">
          <p className="text-white/25 text-xs">
            {detail.exercises.length} exercise{detail.exercises.length !== 1 ? 's' : ''}
            {' · '}
            {detail.activities.length} session{detail.activities.length !== 1 ? 's' : ''}
          </p>
          {detail.exercises.length === 0 ? (
            <p className="text-white/20 text-sm py-8 text-center">No exercises found for this selection.</p>
          ) : (
            detail.exercises.map(ex => (
              <ExerciseCard
                key={ex.garmin_exercise_name}
                exercise={ex}
                onUpdate={refreshDetail}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
