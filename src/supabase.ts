import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ufkkptcojdsdylzhlubo.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVma2twdGNvamRzZHlsemhsdWJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3ODIyMTEsImV4cCI6MjA5MDM1ODIxMX0.IaDBZioB8VjzfF5P4L0sWRE2ctvN010nBVb11Uik3fs';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
