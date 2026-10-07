import { Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import AdminLogin from "./pages/AdminLogin";
import AdminLayout from "./admin/AdminLayout";
import AdminFilms from "./admin/AdminFilms";
import AdminFilmForm from "./admin/AdminFilmForm";
import AdminBulkImport from "./admin/AdminBulkImport";
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
        <Route path="films/new" element={<AdminFilmForm />} />
        <Route path="films/:id" element={<AdminFilmForm />} />
        <Route path="platforms" element={<AdminPlatforms />} />
        <Route path="subscribers" element={<AdminSubscribers />} />
        <Route path="settings" element={<AdminSettings />} />
      </Route>
    </Routes>
  );
}
