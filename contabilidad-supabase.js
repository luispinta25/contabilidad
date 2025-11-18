(function () {
    "use strict";

    const DEFAULT_CONFIG = {
        url: "https://lpsupabase.manasakilla.com",
        anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogImFub24iLAogICJpc3MiOiAic3VwYWJhc2UiLAogICJpYXQiOiAxNzE1MDUwODAwLAogICJleHAiOiAxODcyODE3MjAwCn0.mKBTuXoyxw3lXRGl1VpSlGbSeiMnRardlIx1q5n-o0k",
        storageKey: "contabilidad.supabase.auth"
    };

    const overrides = window.CONTABILIDAD_SUPABASE_CONFIG || {};
    const SUPABASE_URL = overrides.url || DEFAULT_CONFIG.url;
    const SUPABASE_ANON_KEY = overrides.anonKey || DEFAULT_CONFIG.anonKey;
    const STORAGE_KEY = overrides.storageKey || DEFAULT_CONFIG.storageKey;

    let contabilidadSupabaseClient = null;

    function initContabilidadSupabase() {
        if (contabilidadSupabaseClient) {
            return contabilidadSupabaseClient;
        }

        if (!window.supabase || typeof window.supabase.createClient !== "function") {
            console.error("Supabase library is not available. Did you include @supabase/supabase-js before contabilidad-supabase.js?");
            return null;
        }

        contabilidadSupabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
                persistSession: true,
                storageKey: STORAGE_KEY,
                autoRefreshToken: true,
                detectSessionInUrl: true
            }
        });

        return contabilidadSupabaseClient;
    }

    function getContabilidadSupabaseClient() {
        if (!contabilidadSupabaseClient) {
            initContabilidadSupabase();
        }
        return contabilidadSupabaseClient;
    }

    window.contabilidadSupabase = {
        init: initContabilidadSupabase,
        getClient: getContabilidadSupabaseClient,
        config: {
            url: SUPABASE_URL,
            storageKey: STORAGE_KEY
        }
    };

    window.getSupabaseClient = getContabilidadSupabaseClient;
})();
