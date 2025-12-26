import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export async function getApolloKey(userId?: string) {
    // 1. Try to get user-specific key from DB if userId provided
    if (userId) {
        const cookieStore = await cookies()
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() { return cookieStore.getAll() },
                    setAll() { }
                }
            }
        )

        const { data: profile } = await supabase
            .from('profiles')
            .select('apollo_api_key')
            .eq('id', userId)
            .single()

        if (profile?.apollo_api_key) {
            return profile.apollo_api_key
        }
    }

    // 2. Fallback to server env var
    return process.env.APOLLO_API_KEY
}
