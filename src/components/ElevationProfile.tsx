import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, {
	Circle,
	Defs,
	Line,
	LinearGradient,
	Path,
	Polyline,
	Rect,
	Stop,
	Text as SvgText,
} from 'react-native-svg';
import { useRouteStore } from '../store/routeStore';
import { useSettingsStore } from '../store/settingsStore';
import { formatDist, formatEle, type UnitSystem } from '../utils/units';

const CHART_HEIGHT = 80;
const PAD = { top: 4, bottom: 20, left: 36, right: 8 };

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
	unitSystem: UnitSystem,
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

	const xTicks = [0, 0.5, 1].map((t) => ({
		x: toX(maxDist * t),
		label: formatDist(maxDist * t, unitSystem),
	}));

	const yTicks = [
		{ y: toY(maxEle), label: formatEle(maxEle, unitSystem) },
		{ y: toY(minEle), label: formatEle(minEle, unitSystem) },
	];

	return { areaPath, linePath, xTicks, yTicks, pointCoords };
}

interface Props {
	width: number;
}

export default function ElevationProfile({ width }: Props) {
	const elevationData = useRouteStore((s) => s.elevationData);
	const routeStats = useRouteStore((s) => s.routeStats);
	const route = useRouteStore((s) => s.route);
	const setFocusCoordinate = useRouteStore((s) => s.setFocusCoordinate);
	const setElevationMarkerCoord = useRouteStore(
		(s) => s.setElevationMarkerCoord,
	);
	const unitSystem = useSettingsStore((s) => s.unitSystem);

	const [tappedIdx, setTappedIdx] = useState<number | null>(null);

	const chart = useMemo(
		() => buildChart(elevationData, width, unitSystem),
		[elevationData, width, unitSystem],
	);

	const findIdx = useCallback(
		(touchX: number, touchY: number): number | null => {
			if (!chart || elevationData.length < 2) return null;
			if (touchX < PAD.left || touchX > width - PAD.right) return null;
			if (touchY < 0 || touchY > CHART_HEIGHT) return null;
			const innerW = width - PAD.left - PAD.right;
			const maxDist = elevationData[elevationData.length - 1][0];
			const touchDist = ((touchX - PAD.left) / innerW) * maxDist;
			let closestIdx = 0;
			let closestDiff = Infinity;
			for (let i = 0; i < elevationData.length; i++) {
				const diff = Math.abs(elevationData[i][0] - touchDist);
				if (diff < closestDiff) {
					closestDiff = diff;
					closestIdx = i;
				}
			}
			return closestIdx;
		},
		[chart, elevationData, width],
	);

	const updatePoint = useCallback(
		(idx: number, flyCamera: boolean) => {
			if (!route) return;
			const coord = route.geometry.coordinates[idx];
			if (coord) {
				if (flyCamera) setFocusCoordinate([coord[0], coord[1]]);
				setElevationMarkerCoord([coord[0], coord[1]]);
			}
			setTappedIdx(idx);
		},
		[route, setFocusCoordinate, setElevationMarkerCoord],
	);

	if (!chart || !routeStats) return null;

	const tappedPt = tappedIdx !== null ? chart.pointCoords[tappedIdx] : null;
	const tappedEle = tappedIdx !== null ? elevationData[tappedIdx][1] : null;
	const tappedDist = tappedIdx !== null ? elevationData[tappedIdx][0] : null;

	return (
		<View style={styles.container}>
			{/* Stats row — total route stats + scrub position on the right */}
			<View style={styles.statsRow}>
				<Text style={styles.statText}>
					{formatDist(routeStats.distanceKm, unitSystem)}
				</Text>
				<Text style={[styles.statText, styles.gain]}>
					{'\u2191'} {formatEle(routeStats.gainM, unitSystem)}
				</Text>
				<Text style={[styles.statText, styles.loss]}>
					{'\u2193'} {formatEle(routeStats.lossM, unitSystem)}
				</Text>
				{tappedEle !== null && tappedDist !== null && (
					<Text style={[styles.statText, styles.scrubStat]}>
						{'\u2191'} {formatEle(tappedEle, unitSystem)} {'\u00b7'}{' '}
						{formatDist(tappedDist, unitSystem)}
					</Text>
				)}
			</View>

			{/* SVG chart — touch and scrub; dot persists on release */}
			<View
				onStartShouldSetResponder={() => true}
				onResponderGrant={(e) => {
					const idx = findIdx(e.nativeEvent.locationX, e.nativeEvent.locationY);
					if (idx !== null) updatePoint(idx, true);
				}}
				onResponderMove={(e) => {
					const idx = findIdx(e.nativeEvent.locationX, e.nativeEvent.locationY);
					if (idx !== null) updatePoint(idx, false);
				}}
			>
				<Svg width={width} height={CHART_HEIGHT}>
					<Defs>
						<LinearGradient id="eleGrad" x1="0" y1="0" x2="0" y2="1">
							<Stop offset="0" stopColor="#3b82f6" stopOpacity="0.4" />
							<Stop offset="1" stopColor="#3b82f6" stopOpacity="0.05" />
						</LinearGradient>
					</Defs>

					<Rect
						x={PAD.left}
						y={PAD.top}
						width={width - PAD.left - PAD.right}
						height={CHART_HEIGHT - PAD.top - PAD.bottom}
						fill="none"
						stroke="#e5e7eb"
						strokeWidth={1}
					/>

					<Path d={chart.areaPath} fill="url(#eleGrad)" />

					<Polyline
						points={chart.pointCoords.map((p) => `${p.x},${p.y}`).join(' ')}
						fill="none"
						stroke="#3b82f6"
						strokeWidth={2}
						strokeLinejoin="round"
						strokeLinecap="round"
					/>

					{chart.xTicks.map((t) => (
						<SvgText
							key={`xt-${t.label}`}
							x={t.x}
							y={CHART_HEIGHT - 4}
							fontSize={9}
							fill="#6b7280"
							textAnchor="middle"
						>
							{t.label}
						</SvgText>
					))}

					{chart.yTicks.map((t) => (
						<SvgText
							key={`yt-${t.label}`}
							x={PAD.left - 3}
							y={t.y + 3}
							fontSize={9}
							fill="#6b7280"
							textAnchor="end"
						>
							{t.label}
						</SvgText>
					))}

					{tappedPt !== null && (
						<>
							<Line
								x1={tappedPt.x}
								y1={PAD.top}
								x2={tappedPt.x}
								y2={CHART_HEIGHT - PAD.bottom}
								stroke="#374151"
								strokeWidth={1}
								strokeDasharray="3,2"
							/>
							<Circle
								cx={tappedPt.x}
								cy={tappedPt.y}
								r={4}
								fill="#3b82f6"
								stroke="#fff"
								strokeWidth={1.5}
							/>
						</>
					)}
				</Svg>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		paddingTop: 8,
	},
	statsRow: {
		flexDirection: 'row',
		alignItems: 'center',
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
	scrubStat: {
		marginLeft: 'auto',
		color: '#6b7280',
	},
});
