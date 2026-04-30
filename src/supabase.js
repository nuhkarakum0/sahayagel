import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://yalehsynrpeecglvunjz.supabase.co'
const supabaseKey = 'sb_publishable_qUtk0bnil8pTwK5Vh_4xmQ_wg2c-S0c'

export const supabase = createClient(supabaseUrl, supabaseKey)