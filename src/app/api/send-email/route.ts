import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { google } from 'googleapis';

// Helper to encode message in Base64URL format required by Gmail API
function encodeMessage(message: string): string {
    return Buffer.from(message)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

export async function POST(request: NextRequest) {
    try {
        const cookieStore = await cookies();

        // Create Supabase client to get the session
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll();
                    },
                    setAll(cookiesToSet) {
                        // We don't need to set cookies here, just reading
                    },
                },
            }
        );

        const { data: { session } } = await supabase.auth.getSession();

        if (!session || !session.provider_token) {
            return NextResponse.json(
                { error: 'Unauthorized: No active session or Google token found. Please sign in again.' },
                { status: 401 }
            );
        }

        const body = await request.json();
        const { to, subject, message, attachments } = body;

        if (!to || !subject || !message) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Initialize OAuth2 client with the provider token
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: session.provider_token });

        const gmail = google.gmail({ version: 'v1', auth });

        // Construct MIME message
        // Note: This is a simplified construction. For robust attachment handling with multipart/mixed, 
        // using a library like 'nodemailer' or 'mailcomposer' is often easier, but we'll do raw MIME here to limit dependencies.

        const boundary = "foo_bar_baz";
        let emailContent = [
            `From: me`,
            `To: ${to}`,
            `Subject: ${subject}`,
            `MIME-Version: 1.0`,
            `Content-Type: multipart/mixed; boundary="${boundary}"`,
            ``,
            `--${boundary}`,
            `Content-Type: text/plain; charset="UTF-8"`,
            `Content-Transfer-Encoding: 7bit`,
            ``,
            message,
            ``
        ].join('\r\n');

        // Add attachments if any
        if (attachments && Array.isArray(attachments)) {
            for (const att of attachments) {
                // In a real app, we would download the file content from Supabase Storage here.
                // For now, we'll assume the client passed the content or we skip it if complex.
                // Wait, the plan said "Fetch attachments from Supabase Storage".

                // Let's implement fetching from Supabase Storage
                if (att.path) {
                    const { data, error } = await supabase.storage
                        .from('email-attachments')
                        .download(att.path);

                    if (!error && data) {
                        const buffer = Buffer.from(await data.arrayBuffer());
                        const base64Content = buffer.toString('base64');

                        emailContent += [
                            `--${boundary}`,
                            `Content-Type: ${att.type || 'application/octet-stream'}; name="${att.name}"`,
                            `Content-Disposition: attachment; filename="${att.name}"`,
                            `Content-Transfer-Encoding: base64`,
                            ``,
                            base64Content,
                            ``
                        ].join('\r\n');
                    }
                }
            }
        }

        emailContent += `--${boundary}--`;

        const encodedEmail = encodeMessage(emailContent);

        const res = await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
                raw: encodedEmail,
            },
        });

        // Log the sent email to the database
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            await supabase.from('sent_emails').insert({
                user_id: user.id,
                recipient_email: to,
                recipient_name: body.recipientName || null,
                company_name: body.companyName || null,
                subject: subject,
                body: message
            });
        }

        return NextResponse.json({ success: true, messageId: res.data.id });

    } catch (error) {
        console.error('Send email error:', error);
        return NextResponse.json(
            { error: 'Failed to send email', details: String(error) },
            { status: 500 }
        );
    }
}
