import React, { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from './client';

export interface UserPermissions {
  dashboard: boolean;
  crm_contacts: boolean;
  contact_lists: boolean;
  crm_chat: boolean;
  campaigns: boolean;
  kanban: boolean;
  whatsapp: boolean;
  playground: boolean;
  agents: boolean;
  webhooks: boolean;
  redsis: boolean;
  email_smtp: boolean;
  sms_twilio: boolean;
  inventory: boolean;
  reports: boolean;
  user_management: boolean;
}

export const DEFAULT_PERMISSIONS: UserPermissions = {
  dashboard: true,
  crm_contacts: true,
  contact_lists: true,
  crm_chat: true,
  campaigns: true,
  kanban: true,
  whatsapp: true,
  playground: true,
  agents: true,
  webhooks: true,
  redsis: true,
  email_smtp: true,
  sms_twilio: true,
  inventory: true,
  reports: true,
  user_management: false,
};

export interface UserProfile {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  role: 'admin' | 'team_member';
  is_active: boolean;
  permissions: UserPermissions | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface SessionContextType {
  session: Session | null;
  isLoading: boolean;
  userProfile: UserProfile | null;
  isAdmin: boolean;
  hasPermission: (key: keyof UserPermissions) => boolean;
  refreshProfile: () => Promise<void>;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const SessionContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  const fetchUserProfile = useCallback(async (userId: string, userEmail: string) => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        // Se não encontrar perfil, tentar criar
        if (error.code === 'PGRST116') {
          const { data: newProfile, error: createError } = await supabase
            .from('user_profiles')
            .insert({
              user_id: userId,
              email: userEmail,
              full_name: userEmail.split('@')[0],
              role: userEmail === 'calcadosdrielle@gmail.com' ? 'admin' : 'team_member'
            })
            .select()
            .single();

          if (!createError && newProfile) {
            setUserProfile(newProfile as UserProfile);
          }
        }
        return;
      }

      setUserProfile(data as UserProfile);
    } catch (err) {
      console.error('Error fetching user profile:', err);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user) {
      await fetchUserProfile(session.user.id, session.user.email || '');
    }
  }, [session, fetchUserProfile]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      if (currentSession?.user) {
        fetchUserProfile(currentSession.user.id, currentSession.user.email || '');
      } else {
        setUserProfile(null);
      }
      setIsLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      if (initialSession?.user) {
        fetchUserProfile(initialSession.user.id, initialSession.user.email || '');
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchUserProfile]);

  const isAdmin = userProfile?.role === 'admin';

  const hasPermission = useCallback((key: keyof UserPermissions): boolean => {
    // Admin tem todas as permissões
    if (isAdmin) return true;
    
    // Se não tem perfil, negar acesso
    if (!userProfile) return false;
    
    // Verificar permissão específica
    const perms = userProfile.permissions || DEFAULT_PERMISSIONS;
    return perms[key] ?? false;
  }, [isAdmin, userProfile]);

  return (
    <SessionContext.Provider value={{ session, isLoading, userProfile, isAdmin, hasPermission, refreshProfile }}>
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionContextProvider');
  }
  return context;
};