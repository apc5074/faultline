import type { AuthError, User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Seam for route-level OAuth tests without calling GitHub. */
export type AuthAdapter = {
  getUser(): Promise<User | null>;
  signInWithOAuth(input: { redirectTo: string }): Promise<{ url: string | null; error: AuthError | null }>;
  linkIdentity(input: { redirectTo: string }): Promise<{ url: string | null; error: AuthError | null }>;
  exchangeCodeForSession(code: string, flowId?: string | null): Promise<{ error: AuthError | null }>;
  signOut(): Promise<{ error: AuthError | null }>;
};

export function createSupabaseAuthAdapter(supabase: SupabaseClient): AuthAdapter {
  return {
    async getUser() {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) return null;
      return data.user;
    },
    async signInWithOAuth({ redirectTo }) {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: { redirectTo },
      });
      return { url: data.url, error };
    },
    async linkIdentity({ redirectTo }) {
      const { data, error } = await supabase.auth.linkIdentity({
        provider: "github",
        options: { redirectTo },
      });
      return { url: data.url, error };
    },
    async exchangeCodeForSession(code, flowId) {
      const { error } = await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
      return { error };
    },
    async signOut() {
      const { error } = await supabase.auth.signOut();
      return { error };
    },
  };
}
