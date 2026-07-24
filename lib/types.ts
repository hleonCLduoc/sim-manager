export type SimStatus = 'libre' | 'instalada';

export interface Sim {
  id: string;
  sim_number: string;
  plan: string | null;
  status: SimStatus;
  imei: string | null;
  needs_review: boolean;
  created_at: string;
  updated_at: string;
}

export interface Location {
  id: string;
  name: string;
  detail: string | null;
  created_at: string;
}

export type InstallationAction = 'instalar' | 'retirar';

export interface Installation {
  id: string;
  sim_id: string | null;
  sim_number: string;
  location_id: string | null;
  location_name: string | null;
  location_detail: string | null;
  imei: string | null;
  action: InstallationAction;
  installed_at: string;
  notes: string | null;
  created_at: string;
}

export interface RegisterInstallationResult {
  success: boolean;
  error?: string;
  created_sim?: boolean;
  needs_review?: boolean;
  sim?: Sim;
  installation?: Installation;
}

export type UserRole = 'super_admin' | 'usuario';

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  role: UserRole;
  can_batch_import: boolean;
  can_batch_delete: boolean;
  can_manage_users: boolean;
  created_at: string;
}

export interface AuthUser {
  id: string;
  email: string;
  profile: Profile | null;
}

export interface DeleteSimsResult {
  success: boolean;
  error?: string;
  deleted?: number;
  found?: string[];
  not_found?: string[];
}

export interface CreateUserResult {
  success: boolean;
  error?: string;
  user_id?: string;
}
