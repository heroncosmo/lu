import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/integrations/supabase/SessionContextProvider';

// Interface para permissões granulares
export interface UserPermissions {
  dashboard: boolean;
  crm_contacts: boolean;
  contact_lists: boolean;
  crm_chat: boolean;
  campaigns: boolean;
  kanban: boolean;
  whatsapp: boolean;
  playground: boolean;
  create_prospecting: boolean;
  agents: boolean;
  webhooks: boolean;
  redsis: boolean;
  email_smtp: boolean;
  sms_twilio: boolean;
  inventory: boolean;
  reports: boolean;
  user_management: boolean;
}

// Permissões padrão para novos usuários
export const DEFAULT_PERMISSIONS: UserPermissions = {
  dashboard: true,
  crm_contacts: true,
  contact_lists: true,
  crm_chat: true,
  campaigns: true,
  kanban: true,
  whatsapp: true,
  playground: true,
  create_prospecting: true,
  agents: true,
  webhooks: true,
  redsis: true,
  email_smtp: true,
  sms_twilio: true,
  inventory: true,
  reports: true,
  user_management: false,
};

// Permissões de admin (tudo liberado)
export const ADMIN_PERMISSIONS: UserPermissions = {
  ...DEFAULT_PERMISSIONS,
  user_management: true,
};

export interface UserProfile {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  role: 'admin' | 'team_member';
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  permissions: UserPermissions;
}

interface UseUserProfileReturn {
  profile: UserProfile | null;
  isLoading: boolean;
  error: Error | null;
  isAdmin: boolean;
  permissions: UserPermissions;
  hasPermission: (key: keyof UserPermissions) => boolean;
  refetch: () => Promise<void>;
}

export function useUserProfile(): UseUserProfileReturn {
  const { session } = useSession();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!session?.user?.id) {
      setProfile(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', session.user.id)
        .single();

      if (fetchError) {
        // Se não encontrar perfil, pode ser que ainda não foi criado
        if (fetchError.code === 'PGRST116') {
          // Tentar criar o perfil
          const { data: newProfile, error: createError } = await supabase
            .from('user_profiles')
            .insert({
              user_id: session.user.id,
              email: session.user.email!,
              full_name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0],
              role: session.user.email === 'calcadosdrielle@gmail.com' ? 'admin' : 'team_member'
            })
            .select()
            .single();

          if (createError) {
            throw createError;
          }

          setProfile(newProfile as UserProfile);
        } else {
          throw fetchError;
        }
      } else {
        setProfile(data as UserProfile);
      }
    } catch (err) {
      console.error('Error fetching user profile:', err);
      setError(err instanceof Error ? err : new Error('Erro ao carregar perfil'));
    } finally {
      setIsLoading(false);
    }
  }, [session?.user?.id, session?.user?.email, session?.user?.user_metadata?.full_name]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Função helper para verificar permissão
  const hasPermission = useCallback((key: keyof UserPermissions): boolean => {
    if (!profile) return false;
    if (profile.role === 'admin') return true; // Admin tem tudo
    return profile.permissions?.[key] ?? false;
  }, [profile]);

  return {
    profile,
    isLoading,
    error,
    isAdmin: profile?.role === 'admin',
    permissions: profile?.permissions ?? DEFAULT_PERMISSIONS,
    hasPermission,
    refetch: fetchProfile,
  };
}

// Hook para buscar todos os usuários (apenas para admins)
export function useAllUsers() {
  const { isAdmin } = useUserProfile();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Usar função RPC para buscar todos os usuários (contorna RLS)
      const { data, error: fetchError } = await supabase
        .rpc('get_all_user_profiles');

      if (fetchError) {
        throw fetchError;
      }

      setUsers((data || []) as UserProfile[]);
    } catch (err) {
      console.error('Error fetching users:', err);
      setError(err instanceof Error ? err : new Error('Erro ao carregar usuários'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    } else {
      setIsLoading(false);
    }
  }, [isAdmin, fetchUsers]);

  const createUser = async (email: string, password: string, fullName: string, role: 'admin' | 'team_member', permissions?: UserPermissions) => {
    try {
      // Método 1: Tentar usar Edge Function (mais seguro, não requer confirmação de email)
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('Não autenticado');
      }

      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              email,
              password,
              full_name: fullName,
              role,
              permissions: permissions || (role === 'admin' ? ADMIN_PERMISSIONS : DEFAULT_PERMISSIONS),
            }),
          }
        );

        if (response.ok) {
          const result = await response.json();
          await fetchUsers();
          return { success: true, user: result.user };
        }
      } catch {
        console.log('Edge function not available, falling back to signUp method');
      }

      // Método 2: Fallback para signUp padrão (requer confirmação de email)
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (authError) {
        throw authError;
      }

      if (!authData.user) {
        throw new Error('Usuário não foi criado');
      }

      // Atualizar o perfil com role e permissões
      const userPermissions = permissions || (role === 'admin' ? ADMIN_PERMISSIONS : DEFAULT_PERMISSIONS);
      await supabase.rpc('admin_update_user_profile', {
        target_user_id: authData.user.id,
        new_role: role,
        new_full_name: fullName,
        new_permissions: userPermissions,
      });

      await fetchUsers();
      return { 
        success: true, 
        user: authData.user,
        message: 'Usuário criado! Um email de confirmação foi enviado.'
      };
    } catch (err) {
      console.error('Error creating user:', err);
      return { 
        success: false, 
        error: err instanceof Error ? err.message : 'Erro ao criar usuário' 
      };
    }
  };

  const updateUser = async (userId: string, updates: Partial<Pick<UserProfile, 'full_name' | 'role' | 'is_active' | 'permissions'>>) => {
    try {
      // Usar função RPC para atualizar (contorna RLS)
      const { error: updateError } = await supabase
        .rpc('admin_update_user_profile', {
          target_user_id: userId,
          new_full_name: updates.full_name || null,
          new_role: updates.role || null,
          new_is_active: updates.is_active ?? null,
          new_permissions: updates.permissions || null,
        });

      if (updateError) {
        throw updateError;
      }

      await fetchUsers();
      return { success: true };
    } catch (err) {
      console.error('Error updating user:', err);
      return { 
        success: false, 
        error: err instanceof Error ? err.message : 'Erro ao atualizar usuário' 
      };
    }
  };

  const deleteUser = async (userId: string) => {
    try {
      // Desativar usuário (soft delete) via RPC
      const { error: updateError } = await supabase
        .rpc('admin_update_user_profile', {
          target_user_id: userId,
          new_is_active: false,
        });

      if (updateError) {
        throw updateError;
      }

      await fetchUsers();
      return { success: true };
    } catch (err) {
      console.error('Error deleting user:', err);
      return { 
        success: false, 
        error: err instanceof Error ? err.message : 'Erro ao excluir usuário' 
      };
    }
  };

  return {
    users,
    isLoading,
    error,
    refetch: fetchUsers,
    createUser,
    updateUser,
    deleteUser,
  };
}
