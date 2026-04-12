import { createClient } from '@supabase/supabase-js';

// 통합 허브 Supabase
const supabaseUrl = 'https://nhgkzquqbxbzwejzcdft.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oZ2t6cXVxYnhiendlanpjZGZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMjc5NzgsImV4cCI6MjA4OTgwMzk3OH0.K8CIaX3nPQ9EzBvhjpMol8Ng9i-7iM71HxboAXhx0QM';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
