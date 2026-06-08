import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';

export default function Sparkline({ data, color = '#818cf8' }) {
  if (!data || data.length < 2) {
    return (
      <div className="h-12 flex items-center">
        <div className="w-full border-t border-dashed border-white/10" />
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={48}>
      <LineChart data={data} margin={{ top: 3, right: 3, bottom: 3, left: 3 }}>
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
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
          formatter={(v) => [v, '']}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
