"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Mail, Building2, Calendar, User, Send } from "lucide-react"

interface SentEmail {
    id: string
    recipient_email: string
    recipient_name: string | null
    company_name: string | null
    subject: string
    body: string
    sent_at: string
}

export function EmailHistoryTab() {
    const [emails, setEmails] = useState<SentEmail[]>([])
    const [loading, setLoading] = useState(true)
    const supabase = createClient()

    useEffect(() => {
        fetchEmails()
    }, [])

    const fetchEmails = async () => {
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('sent_emails')
                .select('*')
                .order('sent_at', { ascending: false })

            if (error) throw error
            setEmails(data || [])
        } catch (err) {
            console.error('Failed to fetch emails:', err)
        } finally {
            setLoading(false)
        }
    }

    // Calculate stats
    const today = new Date().toDateString()
    const todayCount = emails.filter(e => new Date(e.sent_at).toDateString() === today).length
    const totalCount = emails.length

    return (
        <Card className="mx-auto max-w-4xl">
            <CardHeader>
                <div className="flex items-start justify-between">
                    <div className="space-y-1.5">
                        <CardTitle className="flex items-center gap-2 text-2xl">
                            <Send className="h-5 w-5 text-primary" />
                            Email History
                        </CardTitle>
                        <CardDescription className="text-base">
                            Track all emails you've sent through the platform
                        </CardDescription>
                    </div>
                    <div className="flex gap-3">
                        <Badge variant="outline" className="text-sm px-3 py-1">
                            Today: {todayCount}
                        </Badge>
                        <Badge variant="secondary" className="text-sm px-3 py-1">
                            Total: {totalCount}
                        </Badge>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="text-center py-8 text-muted-foreground">Loading...</div>
                ) : emails.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                        <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No emails sent yet.</p>
                        <p className="text-sm">Emails you send will appear here.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {emails.map((email) => (
                            <div
                                key={email.id}
                                className="flex items-center justify-between rounded-lg border bg-card p-4 hover:bg-accent/30 transition-colors"
                            >
                                <div className="flex items-center gap-4 min-w-0">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                                        <Send className="h-5 w-5 text-primary" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium truncate">{email.recipient_name || 'Unknown'}</span>
                                            <span className="text-muted-foreground text-sm truncate">({email.recipient_email})</span>
                                        </div>
                                        {email.company_name && (
                                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                                <Building2 className="h-3.5 w-3.5" />
                                                {email.company_name}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Badge variant="outline" className="bg-green-50/50 text-green-700 border-green-200">
                                        Sent
                                    </Badge>
                                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                                        {new Date(email.sent_at).toLocaleDateString()}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
