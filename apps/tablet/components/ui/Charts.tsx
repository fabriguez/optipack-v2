import { View, Text } from 'react-native';
import Svg, { Rect, G, Line, Path, Circle, Text as SvgText } from 'react-native-svg';
import { colors } from '@/lib/theme/colors';

const CHART_COLORS = ['#1B5E20', '#388E3C', '#4CAF50', '#66BB6A', '#A5D6A7', '#C8E6C9'];

interface BarDatum {
  day: string;
  colis: number;
}

export function BarChart({ data, height = 240 }: { data: BarDatum[]; height?: number }) {
  const width = 520; // logical viewBox width, scaled responsively by Svg
  const padLeft = 32;
  const padRight = 12;
  const padTop = 12;
  const padBottom = 28;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;
  const max = Math.max(1, ...data.map((d) => d.colis));
  const step = innerW / Math.max(1, data.length);
  const barW = Math.min(40, step * 0.55);

  // 4 horizontal grid lines + labels
  const ticks = 4;
  const gridLines = Array.from({ length: ticks + 1 }, (_, i) => {
    const value = Math.round((max / ticks) * i);
    const y = padTop + innerH - (innerH / ticks) * i;
    return { value, y };
  });

  return (
    <View style={{ height }}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
        {gridLines.map((g, i) => (
          <G key={i}>
            <Line x1={padLeft} y1={g.y} x2={width - padRight} y2={g.y} stroke={colors.gray[100]} strokeWidth={1} strokeDasharray="3 3" />
            <SvgText x={padLeft - 6} y={g.y + 4} fontSize={10} fill={colors.gray[400]} textAnchor="end">
              {g.value}
            </SvgText>
          </G>
        ))}
        {data.map((d, i) => {
          const h = (d.colis / max) * innerH;
          const x = padLeft + step * i + (step - barW) / 2;
          const y = padTop + innerH - h;
          return (
            <G key={i}>
              <Rect x={x} y={y} width={barW} height={Math.max(0, h)} rx={6} fill="#4CAF50" />
              <SvgText x={x + barW / 2} y={height - 10} fontSize={11} fill={colors.gray[500]} textAnchor="middle">
                {d.day}
              </SvgText>
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

interface PieDatum {
  name: string;
  value: number;
}

function polar(cx: number, cy: number, r: number, angle: number) {
  const a = (angle - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arcPath(cx: number, cy: number, rOuter: number, rInner: number, start: number, end: number) {
  const startOuter = polar(cx, cy, rOuter, end);
  const endOuter = polar(cx, cy, rOuter, start);
  const startInner = polar(cx, cy, rInner, start);
  const endInner = polar(cx, cy, rInner, end);
  const large = end - start > 180 ? 1 : 0;
  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${rOuter} ${rOuter} 0 ${large} 0 ${endOuter.x} ${endOuter.y}`,
    `L ${startInner.x} ${startInner.y}`,
    `A ${rInner} ${rInner} 0 ${large} 1 ${endInner.x} ${endInner.y}`,
    'Z',
  ].join(' ');
}

export function DonutChart({ data, size = 180 }: { data: PieDatum[]; size?: number }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 4;
  const rInner = rOuter - 26;

  let cursor = 0;
  const segments = data.map((d, i) => {
    const angle = total > 0 ? (d.value / total) * 360 : 0;
    const start = cursor;
    const end = cursor + angle;
    cursor = end;
    return { ...d, start, end, color: CHART_COLORS[i % CHART_COLORS.length] };
  });

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {total > 0 ? (
          segments.map((s, i) =>
            s.end - s.start >= 359.99 ? (
              <Circle key={i} cx={cx} cy={cy} r={(rOuter + rInner) / 2} stroke={s.color} strokeWidth={rOuter - rInner} fill="none" />
            ) : (
              <Path key={i} d={arcPath(cx, cy, rOuter, rInner, s.start, s.end)} fill={s.color} />
            ),
          )
        ) : (
          <Circle cx={cx} cy={cy} r={(rOuter + rInner) / 2} stroke={colors.gray[100]} strokeWidth={rOuter - rInner} fill="none" />
        )}
      </Svg>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginTop: 12 }}>
        {segments.map((s, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: s.color }} />
            <Text style={{ fontSize: 12, color: colors.gray[600] }}>
              {s.name} ({s.value})
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export { CHART_COLORS };
