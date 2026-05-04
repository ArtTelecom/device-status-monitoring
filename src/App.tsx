import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import AppLayout from "./components/layout/AppLayout";
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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
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
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;