import type { User } from '@supabase/supabase-js';
import { supabaseAdmin, userFromRequest } from './billing';

/**
 * The signed-in administrator making this request, or null. Checked on the server every time: the bearer
 * token must be valid and the user must be in public.admins, which API roles can't read or change.
 */
export async function adminFromRequest(req: Request): Promise<User | null> {
  const user = await userFromRequest(req);
  if (!user) return null;
  const { data } = await supabaseAdmin().from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
  return data ? user : null;
}
