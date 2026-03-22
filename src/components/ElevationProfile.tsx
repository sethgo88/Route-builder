import React, { useCallback, useMemo } from 'react';
import { type GestureResponderEvent, StyleSheet, Text, View } from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  Path,
  Polyline,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { useRouteStore } from '../store/routeStore';

const CHART_HEIGHT = 80;
const PAD = { top: 4, bottom: 20, left: 36, right: 8 };

function formatEle(m: number): string {
  return `${Math.round(m)}m`;
}

function formatDist(km: number): string {
  return km >= 1 ? `${km.toFixed(1)}km` : `${Math.round(km * 1000)}m`;
}

interface ChartPath {
  areaPath: string;
  linePath: string;
  xTicks: { x: number; label: string }[];
  yTicks: { y: number; label: string }[];
  pointCoords: { x: number; y: number }[];
}

function buildChart(
  data: [number, number][],
  width: number,
): ChartPath | null {
  if (data.length < 2) return null;

  const innerW = width - PAD.left - PAD.right;
  const innerH = CHART_HEIGHT - PAD.top - PAD.bottom;

  const maxDist = data[data.length - 1][0];
  const elevations = data.map((d) => d[1]);
  const minEle = Math.min(...elevations);
  const maxEle = Math.max(...elevations);
  const eleRange = maxEle - minEle || 1;

  const toX = (dist: number) => PAD.left + (dist / maxDist) * innerW;
  const toY = (ele: number) =>
    PAD.top + (1 - (ele - minEle) / eleRange) * innerH;

  const pointCoords = data.map(([dist, ele]) => ({
    x: toX(dist),
    y: toY(ele),
  }));

  const linePoints = pointCoords.map((p) => `${p.x},${p.y}`).join(' ');
  const linePath = `M ${linePoints.split(' ').join(' L ')}`;

  const firstX = pointCoords[0].x;
  const lastX = pointCoords[pointCoords.length - 1].x;
  const baseY = PAD.top + innerH;
  const areaPath = `${linePath} L ${lastX},${baseY} L ${firstX},${baseY} Z`;

  // X ticks: 3 evenly spaced
  const xTicks = [0, 0.5, 1].map((t) => ({
    x: toX(maxDist * t),
    label: formatDist(maxDist * t),
  }));

  // Y ticks: min and max
  const yTicks = [
    { y: toY(maxEle), label: formatEle(maxEle) },
    { y: toY(minEle), label: formatEle(minEle) },
  ];

  return { areaPath, linePath, xTicks, yTicks, pointCoords };
}

interface Props {
  /** Pixel width available for the chart — usually screen width */
  width: number;
}

export default function ElevationProfile({ width }: Props) {
  const elevationData = useRouteStore((s) => s.elevationData);
  const routeStats = useRouteStore((s) => s.routeStats);
  const route = useRouteStore((s) => s.route);
  const setFocusCoordinate = useRouteStore((s) => s.setFocusCoordinate);

  const chart = useMemo(
    () => buildChart(elevationData, width),
    [elevationData, width],
  );

  const handlePress = useCallback(
    (evt: GestureResponderEvent) => {
      if (!chart || !route || elevationData.length < 2) return;
      const touchX = evt.nativeEvent.locationX;
      const innerW = width - PAD.left - PAD.right;
      const maxDist = elevationData[elevationData.length - 1][0];

      // Map touch X to distance
      const touchDist =
        ((touchX - PAD.left) / innerW) * maxDist;

      // Find the closest data point
      let closestIdx = 0;
      let closestDiff = Infinity;
      for (let i = 0; i < elevationData.length; i++) {
        const diff = Math.abs(elevationData[i][0] - touchDist);
        if (diff < closestDiff) {
          closestDiff = diff;
          closestIdx = i;
        }
      }

      const coord = route.geometry.coordinates[closestIdx];
      if (coord) {
        setFocusCoordinate([coord[0], coord[1]]);
      }
    },
    [chart, route, elevationData, width, setFocusCoordinate],
  );

  if (!chart || !routeStats) return null;

  return (
    <View style={styles.container}>
      {/* Stats row */}
      <View style={styles.statsRow}>
        <Text style={styles.statText}>
          {formatDist(routeStats.distanceKm)}
        </Text>
        <Text style={[styles.statText, styles.gain]}>
          ↑ {formatEle(routeStats.gainM)}
        </Text>
        <Text style={[styles.statText, styles.loss]}>
          ↓ {formatEle(routeStats.lossM)}
        </Text>
      </View>

      {/* SVG chart — tap to fly camera to that point */}
      <Svg
        width={width}
        height={CHART_HEIGHT}
        onPress={handlePress}
      >
        <Defs>
          <LinearGradient id="eleGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#3b82f6" stopOpacity="0.4" />
            <Stop offset="1" stopColor="#3b82f6" stopOpacity="0.05" />
          </LinearGradient>
        </Defs>

        {/* Grid background */}
        <Rect
          x={PAD.left}
          y={PAD.top}
          width={width - PAD.left - PAD.right}
          height={CHART_HEIGHT - PAD.top - PAD.bottom}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={1}
        />

        {/* Filled area */}
        <Path d={chart.areaPath} fill="url(#eleGrad)" />

        {/* Line */}
        <Polyline
          points={chart.pointCoords.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* X-axis ticks */}
        {chart.xTicks.map((t, i) => (
          <SvgText
            key={`xt-${i}`}
            x={t.x}
            y={CHART_HEIGHT - 4}
            fontSize={9}
            fill="#6b7280"
            textAnchor="middle"
          >
            {t.label}
          </SvgText>
        ))}

        {/* Y-axis ticks */}
        {chart.yTicks.map((t, i) => (
          <SvgText
            key={`yt-${i}`}
            x={PAD.left - 3}
            y={t.y + 3}
            fontSize={9}
            fill="#6b7280"
            textAnchor="end"
          >
            {t.label}
          </SvgText>
        ))}
      </Svg>

      <Text style={styles.hint}>Tap chart to fly to that location</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 8,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  statText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  gain: { color: '#16a34a' },
  loss: { color: '#dc2626' },
  hint: {
    fontSize: 10,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 4,
  },
});
