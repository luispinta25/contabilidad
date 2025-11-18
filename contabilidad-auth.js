(function () {
    "use strict";

    const state = {
        user: null,
        role: null,
        nombres: "",
        apellidos: ""
    };

    function deriveNameFromEmail(email) {
        if (!email || typeof email !== "string") {
            return "";
        }
        const atIndex = email.indexOf("@");
        if (atIndex <= 0) {
            return email;
        }
        return email.slice(0, atIndex);
    }

    function syncGlobals() {
        window.currentUser = state.user;
        window.userRole = state.role;
        window.userNombres = state.nombres;
        window.userApellidos = state.apellidos;
    }

    function clearState() {
        state.user = null;
        state.role = null;
        state.nombres = "";
        state.apellidos = "";
        syncGlobals();
    }

    async function loadUserRole() {
        if (!state.user) {
            clearState();
            return null;
        }

        const client = getSupabaseClient();
        if (!client) {
            return null;
        }

        try {
            const { data, error } = await client
                .from("usuarios_ferreteria")
                .select("rol, nombres, apellidos")
                .eq("user_id", state.user.id)
                .maybeSingle();

            if (error && error.code !== "PGRST116") {
                throw error;
            }

            if (data) {
                state.role = data.rol || "usuario";
                state.nombres = data.nombres || deriveNameFromEmail(state.user.email);
                state.apellidos = data.apellidos || "";
            } else {
                state.role = "usuario";
                state.nombres = deriveNameFromEmail(state.user.email);
                state.apellidos = "";
            }
        } catch (err) {
            console.error("Error al cargar rol del usuario:", err);
            state.role = "usuario";
            state.nombres = deriveNameFromEmail(state.user?.email);
            state.apellidos = "";
        }

        syncGlobals();
        return {
            role: state.role,
            nombres: state.nombres,
            apellidos: state.apellidos
        };
    }

    async function ensureSession() {
        const client = getSupabaseClient();
        if (!client) {
            clearState();
            return null;
        }

        try {
            const { data, error } = await client.auth.getSession();
            if (error) {
                throw error;
            }

            const sessionUser = data?.session?.user || null;
            if (sessionUser) {
                state.user = sessionUser;
                syncGlobals();
                await loadUserRole();
                return state.user;
            }

            clearState();
            return null;
        } catch (error) {
            console.error("Error al recuperar sesión de Supabase:", error);
            clearState();
            return null;
        }
    }

    async function login(email, password) {
        const client = getSupabaseClient();
        if (!client) {
            throw new Error("Supabase no está disponible");
        }

        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) {
            throw error;
        }

        state.user = data.user;
        syncGlobals();
        await loadUserRole();
        return {
            user: state.user,
            role: state.role
        };
    }

    async function logout() {
        const client = getSupabaseClient();
        if (client) {
            try {
                const { error } = await client.auth.signOut();
                if (error) {
                    throw error;
                }
            } catch (error) {
                console.error("Error al cerrar sesión en Supabase:", error);
            }
        }
        clearState();
    }

    function getCurrentUser() {
        return state.user;
    }

    function getRole() {
        return state.role;
    }

    function hasRole(requiredRole) {
        if (!requiredRole) {
            return false;
        }
        const hierarchy = {
            admin: 3,
            contador: 2,
            usuario: 1
        };
        const current = hierarchy[state.role] || 0;
        const required = hierarchy[requiredRole] || 0;
        return current >= required;
    }

    function hasAnyRole(roles) {
        if (!Array.isArray(roles) || roles.length === 0) {
            return false;
        }
        return roles.some(role => state.role === role);
    }

    window.contabilidadAuth = {
        ensureSession,
        login,
        logout,
        loadUserRole,
        getCurrentUser,
        getRole,
        hasRole,
        hasAnyRole,
        getUserInfo() {
            return {
                user: state.user,
                role: state.role,
                nombres: state.nombres,
                apellidos: state.apellidos
            };
        }
    };

    window.loadUserRole = loadUserRole;
    syncGlobals();
})();
