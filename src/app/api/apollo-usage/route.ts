import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getApolloKey } from "@/lib/api-helper";

export async function POST(request: NextRequest) {
    try {
        const cookieStore = await cookies();

        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll();
                    },
                    setAll() { },
                },
            }
        );

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get Apollo key using helper (checks profile first, then env)
        const apolloKey = await getApolloKey(user.id);

        if (!apolloKey) {
            return NextResponse.json({
                success: false,
                error: 'No Apollo API key configured',
                hasKey: false
            });
        }

        // Call Apollo auth/health endpoint to validate key and get rate limits
        const response = await fetch('https://api.apollo.io/v1/auth/health', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache',
                'x-api-key': apolloKey
            }
        });

        const headers = response.headers;

        // Extract rate limit info from headers
        const rateLimits = {
            minuteRequestsLeft: headers.get('x-minute-requests-left'),
            minuteUsage: headers.get('x-minute-usage'),
            hourlyRequestsLeft: headers.get('x-hourly-requests-left'),
            hourlyUsage: headers.get('x-hourly-usage'),
            dailyRequestsLeft: headers.get('x-daily-requests-left'),
            dailyUsage: headers.get('x-daily-usage'),
            rateLimitMinute: headers.get('x-rate-limit-minute'),
            rateLimitHourly: headers.get('x-rate-limit-hourly'),
            rateLimitDaily: headers.get('x-rate-limit-daily'),
        };

        if (response.ok) {
            const data = await response.json();
            return NextResponse.json({
                success: true,
                hasKey: true,
                isValid: data.is_logged_in === true,
                rateLimits
            });
        } else {
            return NextResponse.json({
                success: false,
                hasKey: true,
                isValid: false,
                error: 'Apollo API key is invalid or expired',
                rateLimits
            });
        }

    } catch (error) {
        console.error('Apollo usage check error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to check Apollo usage', details: String(error) },
            { status: 500 }
        );
    }
}
