/** Thin ECharts wrapper + theme tokens shared by every chart. */
import { createContext, useContext, useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, BoxplotChart, HeatmapChart, LineChart, PieChart, ScatterChart } from 'echarts/charts';
import { GridComponent, LegendComponent, MarkLineComponent, TooltipComponent, VisualMapComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  BarChart, BoxplotChart, HeatmapChart, LineChart, PieChart, ScatterChart,
  GridComponent, LegendComponent, MarkLineComponent, TooltipComponent, VisualMapComponent, CanvasRenderer,
]);

export type EChartsOption = echarts.EChartsCoreOption;

export interface ChartTheme {
  dark: boolean;
  surface: string;
  text: string;
  muted: string;
  grid: string;
  /** Categorical slots in fixed order (reference palette). */
  series: string[];
  good: string;
  critical: string;
  /** Sequential blue, light → dark. */
  sequential: string[];
  /** Diverging blue ↔ gray ↔ red. */
  diverging: string[];
}

const LIGHT: ChartTheme = {
  dark: false,
  surface: '#fcfcfb',
  text: '#0b0b0b',
  muted: '#52514e',
  grid: '#e7e6e2',
  series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
  good: '#0ca30c',
  critical: '#d03b3b',
  sequential: ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'],
  diverging: ['#256abf', '#86b6ef', '#f0efec', '#ef9a8f', '#d03b3b'],
};

const DARK: ChartTheme = {
  dark: true,
  surface: '#1a1a19',
  text: '#f0efec',
  muted: '#c3c2b7',
  grid: '#33332f',
  series: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
  good: '#0ca30c',
  critical: '#e66767',
  sequential: ['#184f95', '#1c5cab', '#256abf', '#2a78d6', '#5598e7', '#86b6ef', '#cde2fb'],
  diverging: ['#3987e5', '#1c5cab', '#383835', '#a8403f', '#e66767'],
};

export const chartTheme = (dark: boolean) => (dark ? DARK : LIGHT);
export const ChartThemeContext = createContext<ChartTheme>(LIGHT);
export const useChartTheme = () => useContext(ChartThemeContext);

/** Axis/tooltip defaults so every chart has recessive axes and readable text. */
export function baseOption(th: ChartTheme): EChartsOption {
  const axis = {
    axisLine: { lineStyle: { color: th.grid } },
    axisTick: { show: false },
    axisLabel: { color: th.muted, fontSize: 11 },
    splitLine: { lineStyle: { color: th.grid } },
    nameTextStyle: { color: th.muted, fontSize: 11 },
  };
  return {
    backgroundColor: 'transparent',
    textStyle: { color: th.text, fontFamily: 'inherit' },
    grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
    legend: { top: 0, textStyle: { color: th.muted }, icon: 'roundRect', itemWidth: 12, itemHeight: 8 },
    tooltip: {
      backgroundColor: th.dark ? '#262624' : '#ffffff',
      borderColor: th.grid,
      textStyle: { color: th.text, fontSize: 12 },
      confine: true,
    },
    xAxis: axis,
    yAxis: axis,
  };
}

/** Compact euro labels for axes: 1.2M, 350k. */
export function compactEur(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return `€${(v / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `€${(v / 1e3).toFixed(0)}k`;
  return `€${v.toFixed(0)}`;
}

export function Chart({ option, height = 320, ariaLabel }: { option: EChartsOption; height?: number; ariaLabel: string }) {
  const el = useRef<HTMLDivElement>(null);
  const inst = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!el.current) return;
    const chart = echarts.init(el.current, undefined, { renderer: 'canvas' });
    inst.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      chart.dispose();
      inst.current = null;
    };
  }, []);

  useEffect(() => {
    inst.current?.setOption(option, true);
  }, [option]);

  return <div ref={el} className="chart" style={{ height }} role="img" aria-label={ariaLabel} />;
}
