import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AppLayout from "./components/layout/AppLayout";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Admin from "./pages/Admin";
import Dashboard from "./pages/Dashboard";
import NetworkMap from "./pages/NetworkMap";
import Devices from "./pages/Devices";
import DeviceDetail from "./pages/DeviceDetail";
import OnuList from "./pages/OnuList";
import OnuDetail from "./pages/OnuDetail";
import RouterList from "./pages/RouterList";
import RouterDetail from "./pages/RouterDetail";
import CoreRouters from "./pages/CoreRouters";
import Unregistered from "./pages/Unregistered";
import Discovered from "./pages/Discovered";
import Events from "./pages/Events";
import Notifications from "./pages/Notifications";
import Macros from "./pages/Macros";
import Backups from "./pages/Backups";
import Analytics from "./pages/Analytics";
import Users from "./pages/Users";
import Groups from "./pages/Groups";
import SettingsPage from "./pages/Settings";
import NotFound from "./pages/NotFound";
import Icon from "@/components/ui/icon";

const queryClient = new QueryClient();

function ProtectedRoutes() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        <Icon name="Loader2" size={28} className="animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/" replace />;
  return (
    <AppLayout>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/map" element={<NetworkMap />} />
        <Route path="/devices" element={<Devices />} />
        <Route path="/devices/:id" element={<DeviceDetail />} />
        <Route path="/onu" element={<OnuList />} />
        <Route path="/onu/:id" element={<OnuDetail />} />
        <Route path="/routers" element={<RouterList />} />
        <Route path="/routers/:id" element={<RouterDetail />} />
        <Route path="/core-routers" element={<CoreRouters />} />
        <Route path="/unregistered" element={<Unregistered />} />
        <Route path="/discovered" element={<Discovered />} />
        <Route path="/events" element={<Events />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/macros" element={<Macros />} />
        <Route path="/backups" element={<Backups />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/users" element={<Users />} />
        <Route path="/groups" element={<Groups />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppLayout>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/*" element={<ProtectedRoutes />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;