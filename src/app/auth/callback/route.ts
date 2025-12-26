import { NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const next = searchParams.get('next') ?? '/'

    if (code) {
        const cookieStore = await cookies()

        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll()
                    },
                    setAll(cookiesToSet) {
                        try {
                            cookiesToSet.forEach(({ name, value, options }) => {
                                cookieStore.set(name, value, options as CookieOptions)
                            })
                        } catch {
                            // Ignore - called from Server Component
                        }
                    },
                },
            }
        )

        const { data, error } = await supabase.auth.exchangeCodeForSession(code)

        if (!error && data.user) {
            // Ensure profile exists
            const { data: profile } = await supabase
                .from('profiles')
                .select('id')
                .eq('id', data.user.id)
                .single()

            if (!profile) {
                // Create profile for new user
                await supabase.from('profiles').insert({
                    id: data.user.id,
                    is_onboarded: false
                })
                // Redirect to onboarding for new users
                return NextResponse.redirect(`${origin}/onboarding`)
            }

            return NextResponse.redirect(`${origin}${next}`)
        }
    }

    // Return to login on error
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
