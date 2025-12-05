// Declarações para módulos Deno importados via URL
declare module "https://deno.land/std@0.177.0/http/server.ts" {
  export function serve(
    handler: (request: Request) => Response | Promise<Response>,
    options?: { port?: number; hostname?: string }
  ): Promise<void>;
}

// Declarações para módulos Supabase importados via URL
declare module "https://esm.sh/@supabase/supabase-js@2.39.7" {
  export * from "@supabase/supabase-js";
}

// Declaração global para o objeto Deno, resolvendo 'Cannot find name Deno'
declare global {
  const Deno: {
    env: {
      get(key: string): string | undefined;
    };
  };
}