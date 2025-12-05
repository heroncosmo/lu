/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_SUPABASE_URL?: string;
	readonly VITE_SUPABASE_ANON_KEY?: string;
	readonly VITE_REDSIS_USUARIO?: string;
	readonly VITE_REDSIS_SENHA?: string;
	readonly VITE_REDSIS_SERVIDOR?: string;
	readonly VITE_REDSIS_PORTA?: string;
	readonly VITE_REDSIS_API_URL?: string;
	readonly VITE_WHATSAPP_INSTANCE_ID?: string;
	readonly VITE_WHATSAPP_TOKEN?: string;
	readonly VITE_APP_URL?: string;
	readonly VITE_OPENAI_API_KEY?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
