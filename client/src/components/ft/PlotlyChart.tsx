/**
 * PlotlyChart - Wrapper for react-plotly.js that works with CDN-loaded Plotly
 *
 * Uses window.Plotly (loaded from CDN in index.html) via the factory pattern.
 * This avoids bundling plotly.js which has Node.js stream dependencies
 * that cannot be polyfilled in Vite browser builds.
 */
import _createPlotlyComponent from 'react-plotly.js/factory';

// Declare the global Plotly type from CDN
declare global {
  interface Window {
    Plotly: typeof import('plotly.js');
  }
}

// react-plotly.js/factory is CommonJS — Vite may wrap it, so unwrap .default if needed
const createPlotlyComponent: typeof _createPlotlyComponent =
  (_createPlotlyComponent as any).default ?? _createPlotlyComponent;

const PlotlyChart = createPlotlyComponent(window.Plotly);

export default PlotlyChart;
