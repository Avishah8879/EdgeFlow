/**
 * PlotlyChart - Wrapper for react-plotly.js that works with CDN-loaded Plotly
 *
 * This component handles the case where Plotly is loaded from CDN (window.Plotly)
 * rather than being bundled. It uses createPlotlyComponent from react-plotly.js
 * to create a React component that uses the global Plotly instance.
 *
 * This approach avoids bundling the 4.7MB plotly.js library, which causes
 * memory issues during Vite builds on memory-constrained environments.
 */
import createPlotlyComponent from 'react-plotly.js/factory';

// Declare the global Plotly type from CDN
declare global {
  interface Window {
    Plotly: typeof import('plotly.js');
  }
}

// Create the Plot component using the global Plotly instance loaded via CDN
const PlotlyChart = createPlotlyComponent(window.Plotly);

export default PlotlyChart;
