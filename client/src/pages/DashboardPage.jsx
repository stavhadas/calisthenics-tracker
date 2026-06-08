import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { format, formatDistanceToNow } from 'date-fns';
import Sparkline from '../components/Sparkline';

function unitLabel(trackAs) {
  return trackAs === 'time' || trackAs === 'seconds' ? 's' : ' reps';
}

function InsightCard({ insight }) {
  const { displayName, best, prevBest, delta, setCount, prevSetCount, isNewPB, isNew, trackAs } = insight;
  const unit = unitLabel(trackAs);

  let borderClass, bgClass;
  if (isNewPB)          { borderClass = 'border-yellow-500/40'; bgClass = 'bg-yellow-500/5'; }
  else if (delta > 0)   { borderClass = 'border-emerald-500/30'; bgClass = 'bg-emerald-500/5'; }
  else if (delta < 0)   { borderClass = 'border-red-500/20'; bgClass = 'bg-red-500/5'; }
  else if (isNew)       { borderClass = 'border-indigo-500/30'; bgClass = 'bg-indigo-500/5'; }
  else                  { borderClass = 'border-white/8'; bgClass = ''; }

  let deltaEl = null;
  if (delta != null) {
    if (delta > 0)      deltaEl = <span className="text-emerald-400">↑ +{delta}</span>;
    else if (delta < 0) deltaEl = <span className="text-red-400">↓ {delta}</span>;
    else                deltaEl = <span className="text-white/30">→</span>;
  }

  return (
    <div className={`border rounded-xl p-4 ${borderClass} ${bgClass}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-white/70 text-sm font-medium leading-tight">{displayName}</p>
        <div className="flex gap-1 shrink-0">
          {isNewPB && (
            <span className="text-xs font-bold text-yellow-400 bg-yellow-500/10 px-1.5 py-0.5 rounded-full">PB</span>
          )}
          {isNew && !isNewPB && (
            <span className="text-xs text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded-full">New</span>
          )}
        </div>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-white">{best ?? '—'}</span>
        <span className="text-white/30 text-xs">{unit.trim()}</span>
        {deltaEl && <span className="text-sm font-medium">{deltaEl}</span>}
      </div>

      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-white/25">
        <span>{setCount} sets</span>
        {prevSetCount != null && prevSetCount !== setCount && (
          <span className={setCount > prevSetCount ? 'text-emerald-500/60' : 'text-red-500/60'}>
            (was {prevSetCount})
          </span>
        )}
        {prevBest != null && delta != null && (
          <span className="ml-auto">prev {prevBest}{unit}</span>
        )}
      </div>
    </div>
  );
}

function MissingCard({ ex }) {
  const unit = unitLabel(ex.trackAs);
  return (
    <div className="border border-white/5 rounded-xl p-4 opacity-40">
      <p className="text-white/50 text-sm font-medium">{ex.displayName}</p>
      <p className="text-white/25 text-xs mt-1">Not done this session</p>
      {ex.prevBest != null && (
        <p className="text-white/30 text-sm mt-2">{ex.prevBest}{unit} last time</p>
      )}
    </div>
  );
}

function SparklineCard({ ex }) {
  const latest = ex.sparkline.at(-1)?.value ?? null;
  const pb = ex.sparkline.length ? Math.max(...ex.sparkline.map(s => s.value ?? 0)) : null;
  const unit = unitLabel(ex.trackAs);
  const trend = ex.sparkline.length >= 2
    ? ex.sparkline.at(-1).value - ex.sparkline.at(-2).value
    : null;

  return (
    <div className="bg-white/3 border border-white/6 rounded-xl p-3">
      <div className="flex items-start justify-between mb-1">
        <p className="text-white/65 text-xs font-medium leading-tight">{ex.displayName}</p>
        {trend != null && trend !== 0 && (
          <span className={`text-xs shrink-0 ml-1 ${trend > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {trend > 0 ? `↑${trend}` : `↓${Math.abs(trend)}`}
          </span>
        )}
      </div>
      <Sparkline data={ex.sparkline} />
      <div className="flex items-center justify-between mt-1.5 text-xs">
        <span className="text-white/30">
          Latest: <span className="text-white/55">{latest ?? '—'}{unit}</span>
        </span>
        {pb != null && pb !== latest && (
          <span className="text-indigo-400/70">PB {pb}{unit}</span>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getDashboard()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-white/30 text-sm">Loading…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  if (!data?.lastActivity) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
        <div className="text-5xl">🏋️</div>
        <p className="text-white/60 text-lg font-medium">No activities yet</p>
        <p className="text-white/30 text-sm max-w-xs">Connect Garmin and sync to see your progress dashboard.</p>
      </div>
    );
  }

  const { lastActivity, prevActivity, insights, missing, currentLevel, exerciseProgress } = data;

  // Sort insights: PBs → improvements → unchanged → declines → new
  const sorted = [
    ...insights.filter(i => i.isNewPB),
    ...insights.filter(i => !i.isNewPB && i.delta > 0),
    ...insights.filter(i => i.delta === 0),
    ...insights.filter(i => i.delta != null && i.delta < 0 && !i.isNewPB),
    ...insights.filter(i => i.isNew && !i.isNewPB),
  ];

  const improved = insights.filter(i => i.delta > 0 || i.isNewPB).length;
  const declined = insights.filter(i => i.delta < 0 && !i.isNewPB).length;
  const newPBs   = insights.filter(i => i.isNewPB).length;

  return (
    <div className="space-y-8">
      {/* Last session header */}
      <div className="bg-gradient-to-r from-indigo-600/20 to-purple-600/10 border border-indigo-500/20 rounded-2xl p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-white/40 text-xs uppercase tracking-wider mb-1">Last session</p>
            <h1 className="text-xl font-bold text-white">{lastActivity.name}</h1>
            <p className="text-white/45 text-sm mt-1">
              {format(new Date(lastActivity.started_at), 'EEEE, MMMM d yyyy')}
              {' · '}
              {Math.round(lastActivity.duration_seconds / 60)} min
            </p>
          </div>

          {prevActivity ? (
            <div className="text-right text-xs text-white/30 shrink-0">
              <p>Compared to</p>
              <p className="text-white/50 mt-0.5">{format(new Date(prevActivity.started_at), 'MMM d')}</p>
              <p className="text-white/20 mt-0.5">{formatDistanceToNow(new Date(prevActivity.started_at))} ago</p>
            </div>
          ) : (
            <p className="text-white/25 text-sm self-end">First session of this type</p>
          )}
        </div>

        {(improved > 0 || declined > 0 || newPBs > 0) && (
          <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-white/8 text-sm">
            {newPBs > 0 && (
              <span className="text-yellow-400 font-medium">🏆 {newPBs} new PB{newPBs > 1 ? 's' : ''}</span>
            )}
            {improved > 0 && (
              <span className="text-emerald-400">↑ {improved} improved</span>
            )}
            {declined > 0 && (
              <span className="text-red-400">↓ {declined} declined</span>
            )}
          </div>
        )}
      </div>

      {/* Session insights */}
      {sorted.length > 0 && (
        <section>
          <h2 className="text-white/40 text-xs uppercase tracking-wider font-medium mb-3">
            {prevActivity ? 'What changed' : 'This session'}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {sorted.map(ins => (
              <InsightCard key={ins.garminName} insight={ins} />
            ))}
            {missing.map(ex => (
              <MissingCard key={ex.garminName} ex={ex} />
            ))}
          </div>
        </section>
      )}

      {/* Current level progress sparklines */}
      {currentLevel != null && exerciseProgress.length > 0 && (
        <section>
          <h2 className="text-white/40 text-xs uppercase tracking-wider font-medium mb-3">
            Level {currentLevel} — progress
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {exerciseProgress.map(ex => (
              <SparklineCard key={ex.garminName} ex={ex} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
