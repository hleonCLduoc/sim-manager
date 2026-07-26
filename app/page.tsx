'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Scorecards } from '@/components/scorecards';
import { MasterSearch } from '@/components/master-search';
import { LocationsPanel } from '@/components/locations-panel';
import { InstallationsForm } from '@/components/installations-form';
import { InstallationsHistory } from '@/components/installations-history';
import { InventoryTable } from '@/components/inventory-table';
import { BatchArea } from '@/components/batch-area';
import { Reports } from '@/components/reports';
import { UserManagement } from '@/components/user-management';
import { AuthScreen } from '@/components/auth-screen';
import { useAppData } from '@/hooks/use-app-data';
import { useAuth } from '@/hooks/use-auth';
import {
  Cpu,
  LayoutDashboard,
  Wrench,
  Boxes,
  ClipboardPaste,
  FileSpreadsheet,
  UserCog,
  LogOut,
  ChevronDown,
  Shield,
  Loader2,
} from 'lucide-react';

export default function Home() {
  const { user, loading, signOut, can, isSuperAdmin } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return <App user={user} onSignOut={signOut} can={can} isSuperAdmin={isSuperAdmin} />;
}

function App({
  user,
  onSignOut,
  can,
  isSuperAdmin,
}: {
  user: { id: string; email: string; profile: { display_name: string | null; role: string } | null };
  onSignOut: () => void;
  can: (perm: 'can_batch_import' | 'can_batch_delete' | 'can_manage_users') => boolean;
  isSuperAdmin: boolean;
}) {
  const { sims, locations, installations, stats, loading, refresh } = useAppData();
  const [tab, setTab] = useState('instalaciones');

  const canManageUsers = can('can_manage_users');
  const canBatch = can('can_batch_import') || can('can_batch_delete');

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight sm:text-lg">
                SIM Manager
              </h1>
              <p className="hidden text-xs text-muted-foreground sm:block">
                Inventario e instalación de tarjetas SIM
              </p>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2 px-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {(user.profile?.display_name || user.email)[0]?.toUpperCase()}
                </div>
                <span className="hidden text-sm font-medium sm:inline">
                  {user.profile?.display_name || user.email.split('@')[0]}
                </span>
                {isSuperAdmin && (
                  <Shield className="h-3.5 w-3.5 text-primary" />
                )}
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">
                    {user.profile?.display_name || user.email.split('@')[0]}
                  </span>
                  <span className="text-xs text-muted-foreground">{user.email}</span>
                  {isSuperAdmin && (
                    <span className="mt-1 inline-flex w-fit items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                      <Shield className="h-3 w-3" />
                      Super Admin
                    </span>
                  )}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onSignOut} className="text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Cerrar sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <Tabs value={tab} onValueChange={setTab} className="space-y-6">
          <div className="overflow-x-auto">
            <TabsList className="flex w-full justify-start gap-1 sm:w-auto">
              <TabsTrigger value="instalaciones" className="gap-2">
                <Wrench className="h-4 w-4" />
                <span className="hidden sm:inline">Instalaciones</span>
                <span className="sm:hidden">Instalar</span>
              </TabsTrigger>
              <TabsTrigger value="dashboard" className="gap-2">
                <LayoutDashboard className="h-4 w-4" />
                <span className="hidden sm:inline">Dashboard</span>
                <span className="sm:hidden">Panel</span>
              </TabsTrigger>
              <TabsTrigger value="inventario" className="gap-2">
                <Boxes className="h-4 w-4" />
                <span className="hidden sm:inline">Inventario</span>
                <span className="sm:hidden">Stock</span>
              </TabsTrigger>
              <TabsTrigger value="informes" className="gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                <span className="hidden sm:inline">Informes</span>
                <span className="sm:hidden">Reportes</span>
              </TabsTrigger>
              {canBatch && (
                <TabsTrigger value="masivo" className="gap-2">
                  <ClipboardPaste className="h-4 w-4" />
                  <span className="hidden sm:inline">Carga masiva</span>
                  <span className="sm:hidden">Carga</span>
                </TabsTrigger>
              )}
              {canManageUsers && (
                <TabsTrigger value="usuarios" className="gap-2">
                  <UserCog className="h-4 w-4" />
                  <span className="hidden sm:inline">Usuarios</span>
                  <span className="sm:hidden">Users</span>
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          {/* INSTALACIONES — pantalla principal */}
          <TabsContent value="instalaciones" className="space-y-6 outline-none">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <InstallationsForm onRegistered={refresh} />
              <InstallationsHistory items={installations} loading={loading} />
            </div>
          </TabsContent>

          {/* DASHBOARD */}
          <TabsContent value="dashboard" className="space-y-6 outline-none">
            <Scorecards stats={stats} loading={loading} />
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">
                Ubicaciones
              </h2>
              <LocationsPanel
                locations={locations}
                installations={installations}
                sims={sims}
                loading={loading}
              />
            </section>
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">
                Buscador maestro
              </h2>
              <MasterSearch />
            </section>
          </TabsContent>

          {/* INVENTARIO */}
          <TabsContent value="inventario" className="space-y-4 outline-none">
            <h2 className="text-lg font-semibold">Inventario maestro</h2>
            <InventoryTable sims={sims} loading={loading} />
          </TabsContent>

          {/* INFORMES */}
          <TabsContent value="informes" className="space-y-4 outline-none">
            <Reports sims={sims} loading={loading} />
          </TabsContent>

          {/* CARGA MASIVA */}
          {canBatch && (
            <TabsContent value="masivo" className="space-y-4 outline-none">
              <BatchArea onImported={refresh} onDeleted={refresh} />
            </TabsContent>
          )}

          {/* USUARIOS */}
          {canManageUsers && (
            <TabsContent value="usuarios" className="space-y-4 outline-none">
              <UserManagement onProfileChanged={refresh} />
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  );
}
