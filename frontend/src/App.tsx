import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import AnalyzerPage from "./pages/AnalyzerPage";
import { ThemeProvider } from "./context/ThemeContext";

/**
 * Root application component.
 *
 * Defines the two primary routes:
 *   /     → LandingPage
 *   /app  → AnalyzerPage
 *
 * Direct navigation to unknown routes safely redirects to /.
 */
function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/app" element={<AnalyzerPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
