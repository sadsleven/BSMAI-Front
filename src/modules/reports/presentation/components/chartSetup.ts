import {
  Chart as ChartJS,
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  DoughnutController,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartOptions,
} from 'chart.js';

/** Registro único de los módulos de Chart.js usados por los reportes. */
ChartJS.register(
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  DoughnutController,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
);

ChartJS.defaults.font.family =
  "'Inter Variable', 'Inter', system-ui, sans-serif";
ChartJS.defaults.font.size = 12;
ChartJS.defaults.color = '#64748b';

/** Paleta cohesiva con el tema clínico AFMI (azul + cian). Hex para canvas. */
export const CHART_COLORS = {
  blue: '#2d68c4',
  blueStrong: '#24509e',
  cyan: '#2ba6c9',
  cyanStrong: '#1e8499',
  success: '#2c9d6b',
  warning: '#d99413',
  destructive: '#d6453a',
  neutral: '#94a3b8',
  violet: '#7c5cd6',
  amber: '#e0a012',
} as const;

/** Secuencia categórica para series con muchas categorías (estados, tipos, etc.). */
export const CATEGORICAL_PALETTE: string[] = [
  CHART_COLORS.blue,
  CHART_COLORS.cyan,
  CHART_COLORS.success,
  CHART_COLORS.warning,
  CHART_COLORS.violet,
  CHART_COLORS.destructive,
  CHART_COLORS.cyanStrong,
  CHART_COLORS.amber,
  CHART_COLORS.blueStrong,
  CHART_COLORS.neutral,
];

/** Convierte un hex `#rrggbb` a `rgba()` con la opacidad indicada. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Asigna un color de la paleta categórica a cada índice (cíclico). */
export function paletteFor(count: number): string[] {
  return Array.from({ length: count }, (_, i) => CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length]);
}

const GRID_COLOR = 'rgba(100, 116, 139, 0.12)';

/** Opciones base para gráficos de barras/líneas con eje numérico. */
export const baseCartesianOptions: ChartOptions<'bar' | 'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: {
      display: true,
      position: 'bottom',
      labels: { usePointStyle: true, boxWidth: 8, boxHeight: 8, padding: 16 },
    },
    tooltip: {
      backgroundColor: '#0f172a',
      padding: 10,
      cornerRadius: 8,
      titleFont: { weight: 'bold' },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } },
    y: { beginAtZero: true, grid: { color: GRID_COLOR }, border: { display: false } },
  },
};

/** Opciones base para doughnut/pie. */
export const baseDoughnutOptions: ChartOptions<'doughnut'> = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: '62%',
  plugins: {
    legend: {
      display: true,
      position: 'right',
      labels: { usePointStyle: true, boxWidth: 8, boxHeight: 8, padding: 14 },
    },
    tooltip: {
      backgroundColor: '#0f172a',
      padding: 10,
      cornerRadius: 8,
      titleFont: { weight: 'bold' },
    },
  },
};
