import { useId } from 'react';
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts';

export default function Sparkline({ data, trackAs = 'reps' }) {
  const uid = useId().replace(/:/g, '');
  const unit = trackAs === 'time' || trackAs === 'seconds' ? 's' : '';

  if (!data || data.length === 0) {
    return <div className="h-12 flex items-center justify-center text-white/15 text-xs">—</div>;
  }

  // Single data point: show the value prominently
  if (data.length < 2) {
    return (
      <div className="h-12 flex items-center gap-2">
        <span className="text-2xl font-bold text-white/65">{data[0].value}{unit}</span>
        <span className="text-white/25 text-xs mt-1">1 session</span>
      </div>
    );
  }

  const first = data[0].value ?? 0;
  const last = data.at(-1).value ?? 0;
  const trendColor = last > first ? '#34d399' : last < first ? '#f87171' : '#818cf8';
  const gradId = `sg-${uid}`;

  return (
    <ResponsiveContainer width="100%" height={48}>
      <AreaChart data={data} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="10%" stopColor={trendColor} stopOpacity={0.25} />
            <stop offset="90%" stopColor={trendColor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="value"
          stroke={trendColor}
          fill={`url(#${gradId})`}
          dot={false}
          strokeWidth={1.5}
          isAnimationActive={false}
        />
        <Tooltip
          contentStyle={{
            background: '#1e2535',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            fontSize: 11,
            padding: '4px 8px',
          }}
          itemStyle={{ color: '#fff' }}
          labelFormatter={() => ''}
          formatter={(v) => [`${v}${unit}`, '']}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
