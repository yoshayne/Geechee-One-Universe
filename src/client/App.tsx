import { Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import AdminLogin from "./pages/AdminLogin";
import AdminLayout from "./admin/AdminLayout";
import AdminFilms from "./admin/AdminFilms";
import AdminFilmForm from "./admin/AdminFilmForm";
import AdminBulkImport from "./admin/AdminBulkImport";
import AdminUrlImport from "./admin/AdminUrlImport";
import AdminTeam from "./admin/AdminTeam";
import AdminPersonForm from "./admin/AdminPersonForm";
import AdminTeamImport from "./admin/AdminTeamImport";
import AdminPlatforms from "./admin/AdminPlatforms";
import AdminSubscribers from "./admin/AdminSubscribers";
import AdminSettings from "./admin/AdminSettings";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/films/:slug" element={<Home />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminFilms />} />
        <Route path="films/import" element={<AdminBulkImport />} />
        <Route path="films/import-url" element={<AdminUrlImport />} />
        <Route path="films/new" element={<AdminFilmForm />} />
        <Route path="films/:id" element={<AdminFilmForm />} />
        <Route path="team" element={<AdminTeam />} />
        <Route path="team/import" element={<AdminTeamImport />} />
        <Route path="team/new" element={<AdminPersonForm />} />
        <Route path="team/:id" element={<AdminPersonForm />} />
        <Route path="platforms" element={<AdminPlatforms />} />
        <Route path="subscribers" element={<AdminSubscribers />} />
        <Route path="settings" element={<AdminSettings />} />
      </Route>
    </Routes>
  );
}
