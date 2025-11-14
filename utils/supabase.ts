import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vukqzyxqkplapqtqvkwe.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1a3F6eXhxa3BsYXBxdHF2a3dlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMxMjgxNjUsImV4cCI6MjA3ODcwNDE2NX0.dXuWVUGyMnuhXHoyiXuhEEKXXo8D_97ymgZcrlomL4Q';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
