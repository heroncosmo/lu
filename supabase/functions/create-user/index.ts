/**
 * Edge Function: Create User by Admin
 * Permite que administradores criem novos usuários no sistema
 * Usa service_role_key para criar usuários via Admin API
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface UserPermissions {
  dashboard?: boolean;
  crm_contacts?: boolean;
  contact_lists?: boolean;
  crm_chat?: boolean;
  kanban?: boolean;
  campaign_management?: boolean;
  campaign_builder?: boolean;
  campaign_details?: boolean;
  funnel_simulator?: boolean;
  sales?: boolean;
  reports?: boolean;
  user_management?: boolean;
  agent_configuration?: boolean;
  whatsapp_instances?: boolean;
  settings?: boolean;
  integration_settings?: boolean;
}

interface CreateUserRequest {
  email: string;
  password: string;
  full_name: string;
  role: 'admin' | 'team_member';
  permissions?: UserPermissions;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verificar autenticação
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Cliente Supabase com token do usuário (para verificar se é admin)
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    // Cliente Admin (para criar usuários)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Verificar usuário atual
    const { data: { user: currentUser }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !currentUser) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verificar se é admin
    const { data: adminProfile, error: profileError } = await supabaseClient
      .from("user_profiles")
      .select("role")
      .eq("user_id", currentUser.id)
      .single();

    if (profileError || adminProfile?.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Only admins can create users" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body: CreateUserRequest = await req.json();
    const { email, password, full_name, role, permissions } = body;

    // Validações
    if (!email || !password || !full_name) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: email, password, full_name" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 6 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("=== CREATE USER BY ADMIN ===");
    console.log("Admin:", currentUser.email);
    console.log("Creating user:", email);

    // Criar usuário via Admin API (não requer confirmação de email)
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Confirma email automaticamente
      user_metadata: {
        full_name,
      },
    });

    if (createError) {
      console.error("Error creating user:", createError);
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Criar profile diretamente (não dependemos do trigger pois admin.createUser pode não disparar)
    if (newUser.user) {
      console.log("Creating profile for user:", newUser.user.id);
      
      // Criar profile diretamente com UPSERT (insert ou update se já existir)
      const { error: upsertError } = await supabaseAdmin
        .from("user_profiles")
        .upsert({ 
          id: newUser.user.id,
          user_id: newUser.user.id,
          email: email,
          role: role || 'team_member',
          full_name,
          is_active: true,
          created_by: currentUser.id,
          permissions: permissions || null
        }, { 
          onConflict: 'user_id',
          ignoreDuplicates: false 
        });
          
      if (upsertError) {
        console.error("Error upserting profile:", upsertError);
        
        // Se upsert falhou, tentar insert simples como fallback
        const { error: insertError } = await supabaseAdmin
          .from("user_profiles")
          .insert({ 
            id: newUser.user.id,
            user_id: newUser.user.id,
            email: email,
            role: role || 'team_member',
            full_name,
            is_active: true,
            created_by: currentUser.id,
            permissions: permissions || null
          });
          
        if (insertError) {
          console.error("Error inserting profile:", insertError);
        } else {
          console.log("Profile created via fallback insert");
        }
      } else {
        console.log("Profile created/updated successfully");
      }
    }

    console.log("User created successfully:", newUser.user?.id);

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: newUser.user?.id,
          email: newUser.user?.email,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
