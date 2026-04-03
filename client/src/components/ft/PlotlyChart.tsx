/**
 * PlotlyChart - Wrapper for react-plotly.js using bundled plotly.js
 *
 * Uses the bundled plotly.js npm package rather than CDN loading,
 * which is more reliable and avoids window.Plotly undefined crashes.
 */
import Plotly from 'plotly.js';
import createPlotlyComponent from 'react-plotly.js/factory';

// Create the Plot component using the bundled Plotly instance
const PlotlyChart = createPlotlyComponent(Plotly as any);

export default PlotlyChart;
