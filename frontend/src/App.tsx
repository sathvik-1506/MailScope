import { BrowserRouter, Route, Routes } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import WorkspaceLayout from "./components/layout/WorkspaceLayout";
import OverviewPage from "./pages/OverviewPage";
import AnalyzerPage from "./pages/AnalyzerPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import HistoryPage from "./pages/HistoryPage";
import ExportsPage from "./pages/ExportsPage";
import SettingsPage from "./pages/SettingsPage";
import NotFoundPage from "./pages/NotFoundPage";
import { ThemeProvider } from "./context/ThemeContext";
import { AnalysisProvider } from "./context/AnalysisContext";

/**
 * Root application component.
 *
 * Configures the multi-page router:
 *   /             → LandingPage (public home)
 *   /app          → WorkspaceLayout
 *     /app        → OverviewPage (deliverability dashboard)
 *     /app/analyze → AnalyzerPage (email batch verification)
 *     /app/analytics → AnalyticsPage (aggregate metrics & charts)
 *     /app/history → HistoryPage (analysis run logs)
 *     /app/exports → ExportsPage (export center & sanitized CSVs)
 *     /app/settings → SettingsPage (theme & engine preferences)
 *   *             → NotFoundPage (404 error page)
 */
function App() {
  return (
    <ThemeProvider>
      <AnalysisProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />

            {/* Workspace Routes */}
            <Route path="/app" element={<WorkspaceLayout />}>
              <Route index element={<OverviewPage />} />
              <Route path="analyze" element={<AnalyzerPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="history" element={<HistoryPage />} />
              <Route path="exports" element={<ExportsPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>

            {/* Not Found */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BrowserRouter>
      </AnalysisProvider>
    </ThemeProvider>
  );
}

export default App;
