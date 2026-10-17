import { createClient } from '@supabase/supabase-js';
import { LOCAL_ONLY } from './runtime.js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key';

// Keep the cloud client out of the local-only execution path. Cloud-only
// components remain available for an explicit cloud build, but cannot make a
// request in a local build.
export const supabase = LOCAL_ONLY ? null : createClient(supabaseUrl, supabaseAnonKey);
