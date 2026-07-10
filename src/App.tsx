import { Routes, Route, Navigate } from "react-router-dom";

import { SessionProvider } from "./session/SessionProvider";
import { CalendarPage } from "./components/CalendarPage";
import { ServicePage } from "./components/ServicePage";
import { EscalaPage } from "./components/EscalaPage";
import { AdminPage } from "./components/admin/AdminPage";

export default function App() {
  return (
    <SessionProvider>
      <Routes>
        <Route path="/" element={<CalendarPage />} />
        <Route path="/culto/:data" element={<ServicePage />} />
        <Route path="/escalas" element={<EscalaPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </SessionProvider>
  );
}
