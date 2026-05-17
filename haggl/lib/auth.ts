import { createClient, type SupabaseClient, type Session, type User } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;
let _adminClient: SupabaseClient | null = null;

function getPublicClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY required");
  _client = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return _client;
}

function getAdminClient(): SupabaseClient {
  if (_adminClient) return _adminClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY required for admin operations");
  _adminClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _adminClient;
}

export function getAuth(): SupabaseClient {
  return getPublicClient();
}

export function getAdminAuth(): SupabaseClient {
  return getAdminClient();
}

export async function signInWithEmail(email: string, password: string): Promise<{ session: Session | null; user: User | null; error?: string }> {
  const { data, error } = await getPublicClient().auth.signInWithPassword({ email, password });
  if (error) return { session: null, user: null, error: error.message };
  return { session: data.session, user: data.user };
}

export async function signUpWithEmail(email: string, password: string, name: string): Promise<{ session: Session | null; user: User | null; error?: string }> {
  const { data, error } = await getPublicClient().auth.signUp({
    email,
    password,
    options: { data: { name } },
  });
  if (error) return { session: null, user: null, error: error.message };
  return { session: data.session, user: data.user };
}

export async function signOut(): Promise<void> {
  await getPublicClient().auth.signOut();
}

export async function getSession(): Promise<Session | null> {
  const { data } = await getPublicClient().auth.getSession();
  return data.session;
}

export async function getCurrentUser(): Promise<User | null> {
  const { data } = await getPublicClient().auth.getUser();
  return data.user;
}

export async function resetPassword(email: string): Promise<{ error?: string }> {
  const { error } = await getPublicClient().auth.resetPasswordForEmail(email);
  if (error) return { error: error.message };
  return {};
}

export async function verifyToken(token: string): Promise<{ user: User | null; error?: string }> {
  const { data, error } = await getAdminClient().auth.getUser(token);
  if (error) return { user: null, error: error.message };
  return { user: data.user };
}

export async function getOrganizationForUser(userId: string): Promise<string | null> {
  const { data, error } = await getAdminClient().from("users").select("organization_id").eq("id", userId).single();
  if (error || !data) return null;
  return (data as { organization_id: string }).organization_id;
}
