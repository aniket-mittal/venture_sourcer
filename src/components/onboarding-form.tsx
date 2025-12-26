"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Upload, X, FileIcon, Save, ArrowRight, Wand2, Sparkles, Send } from "lucide-react"
import { RichTextEditor } from "./rich-text-editor"

interface Attachment {
    name: string
    path: string
    type: string
    url: string
}

interface ProfileData {
    apollo_api_key?: string
    email_subject?: string
    email_template?: string
    attachments?: Attachment[]
    variable_mappings?: Record<string, string>
}

interface OnboardingFormProps {
    initialData?: ProfileData
    isOnboarding?: boolean
}

const SYSTEM_GENERATORS = [
    { value: 'firstName', label: 'First Name (from data)' },
    { value: 'lastName', label: 'Last Name (from data)' },
    { value: 'fullName', label: 'Full Name (from data)' },
    { value: 'companyName', label: 'Company Name (from data)' },
    { value: 'companyDomain', label: 'Company Domain (from data)' },
    { value: 'companyIndustry', label: 'Company Industry (from data)' },
    { value: 'companyDescription', label: 'Company Description (from data)' },
    { value: 'companyInterest', label: 'Company Interest (1-2 sentences, research-based)' },
    { value: 'personInterest', label: 'Person Interest (1-2 sentences, research-based)' },
    { value: 'combinedInterest', label: 'Combined Interest (1-2 sentences, research-based)' },
]

export function OnboardingForm({ initialData, isOnboarding = false }: OnboardingFormProps) {
    const [loading, setLoading] = useState(false)
    const [apolloKey, setApolloKey] = useState(initialData?.apollo_api_key || "")
    const [subject, setSubject] = useState(initialData?.email_subject || "")
    const [template, setTemplate] = useState(initialData?.email_template || "")
    const [attachments, setAttachments] = useState<Attachment[]>(initialData?.attachments || [])
    const [mappings, setMappings] = useState<Record<string, string>>(initialData?.variable_mappings || {})
    const [detectedVariables, setDetectedVariables] = useState<string[]>([])
    const [uploading, setUploading] = useState(false)
    const [isAutoMapping, setIsAutoMapping] = useState(false)
    const [isSendingTest, setIsSendingTest] = useState(false)

    const router = useRouter()
    const supabase = createClient()

    // Send test email to self
    const handleSendTestEmail = async () => {
        setIsSendingTest(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user?.email) throw new Error("No user email found")

            // Sample data for test email
            const TEST_DATA: Record<string, string> = {
                firstName: "John",
                lastName: "Doe",
                fullName: "John Doe",
                companyName: "Acme Corp",
                companyDomain: "acme.com",
                companyIndustry: "Technology",
                companyDescription: "Leading innovator in widget technology.",
                companyInterest: "We are impressed by Acme Corp's recent Series B funding and expansion into AI widgets.",
                personInterest: "Your background in Widget Engineering at WidgetCo makes you a perfect fit.",
                combinedInterest: "We are impressed by Acme Corp's recent work. Your background makes you a perfect fit."
            }

            let testBody = template

            // Replace variables with mapped test data
            detectedVariables.forEach(v => {
                const mapKey = mappings[v]
                const testValue = mapKey ? TEST_DATA[mapKey] : `[${v}]`
                // Global replace of the variable
                testBody = testBody.split(v).join(testValue)
            })

            // Clean up any double braces that might remain (if variable detection was imperfect)
            testBody = testBody.replace(/{{|}}/g, '')

            const response = await fetch('/api/send-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: user.email,
                    subject: subject || "Test Email from VSS",
                    message: testBody,
                    recipientName: "John Doe",
                    companyName: "Acme Corp (Test)",
                    attachments: attachments
                })
            })

            if (!response.ok) {
                const err = await response.json()
                throw new Error(err.error || "Failed to send")
            }

            alert(`Test email sent to ${user.email}! Check your inbox.`)
        } catch (error) {
            console.error('Test email error:', error)
            alert(`Failed to send test email: ${error instanceof Error ? error.message : 'Unknown error'}`)
        } finally {
            setIsSendingTest(false)
        }
    }

    // Detect variables whenever template changes
    useEffect(() => {
        const regex = /{{([^}]+)}}/g
        const matches = Array.from(template.matchAll(regex)).map(m => m[0]) // Get full {{Var}}
        const uniqueMatches = Array.from(new Set(matches))

        // Only update if changed prevents infinite loops or unnecessary re-renders
        if (JSON.stringify(uniqueMatches) !== JSON.stringify(detectedVariables)) {
            setDetectedVariables(uniqueMatches)
            autoMapVariables(uniqueMatches)
        }
    }, [template]) // detectedVariables is not a dep to avoid loop

    const autoMapVariables = async (vars: string[]) => {
        // Filter out only unmapped variables
        const unmappedVars = vars.filter(v => !mappings[v])
        if (unmappedVars.length === 0) return

        setIsAutoMapping(true)
        try {
            const response = await fetch('/api/auto-map-variables', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ variables: unmappedVars.map(v => v.replace(/{{|}}/g, '')) }) // strip curlies for LLM
            })

            if (!response.ok) return

            const data = await response.json()
            if (data.mappings) {
                setMappings(prev => {
                    const newMappings = { ...prev }
                    Object.keys(data.mappings).forEach(key => {
                        if (data.mappings[key]) {
                            newMappings[`{{${key}}}`] = data.mappings[key]
                        }
                    })
                    return newMappings
                })
            }
        } catch (err) {
            console.error("Auto-mapping failed", err)
        } finally {
            setIsAutoMapping(false)
        }
    }

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return

        const file = e.target.files[0]

        // Create local preview immediately
        const localUrl = URL.createObjectURL(file)
        const newAttachment: Attachment = {
            name: file.name,
            path: '',
            type: file.type,
            url: localUrl
        }

        // Add to UI immediately
        setAttachments(prev => [...prev, newAttachment])
        setUploading(true)

        try {
            const { data: { user } } = await supabase.auth.getUser()

            if (user) {
                const fileExt = file.name.split('.').pop()
                const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`
                const filePath = `${user.id}/${fileName}`

                const { error: uploadError } = await supabase.storage
                    .from('email-attachments')
                    .upload(filePath, file)

                if (!uploadError) {
                    // Update attachment with storage path
                    const { data: urlData } = supabase.storage
                        .from('email-attachments')
                        .getPublicUrl(filePath)

                    setAttachments(prev =>
                        prev.map(a => a.name === file.name && a.url === localUrl
                            ? { ...a, path: filePath, url: urlData?.publicUrl || localUrl }
                            : a
                        )
                    )
                }
            }
        } catch (error) {
            console.error('Storage upload error (file still added locally):', error)
        } finally {
            setUploading(false)
        }
    }

    const removeAttachment = async (index: number) => {
        const newAttachments = attachments.filter((_, i) => i !== index)
        setAttachments(newAttachments)
    }

    const handleMappingChange = (variable: string, generatorId: string) => {
        setMappings(prev => ({
            ...prev,
            [variable]: generatorId
        }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            // Get user ID first - use getSession for better client-side reliability
            const { data: { session }, error: authError } = await supabase.auth.getSession()
            if (authError || !session?.user) {
                throw new Error('Not authenticated')
            }
            const user = session.user

            // Filter mappings to only include currently valid variables
            const validMappings: Record<string, string> = {}
            detectedVariables.forEach(v => {
                if (mappings[v]) validMappings[v] = mappings[v]
            })

            console.log("Saving profile for user:", user.id)

            const updates = {
                id: user.id,
                apollo_api_key: apolloKey,
                email_subject: subject,
                email_template: template,
                variable_mappings: validMappings,
                attachments: attachments,
                is_onboarded: true,
                updated_at: new Date().toISOString(),
            }
            console.log("Update payload:", updates)

            const { error, data } = await supabase.from('profiles').upsert(updates).select()

            if (error) {
                console.error("Supabase upsert error:", error)
                throw new Error(error.message || JSON.stringify(error))
            }

            console.log("Profile saved successfully:", data)

            if (isOnboarding) {
                router.push("/")
                router.refresh()
            } else {
                alert("Settings saved successfully!")
            }
        } catch (error) {
            console.error('Error saving profile:', error)
            alert(`Failed to save settings: ${error instanceof Error ? error.message : 'Unknown error'}`)
        } finally {
            setLoading(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-8">
            <div className="space-y-6">
                {/* Apollo API Key */}
                <div className="space-y-2">
                    <Label htmlFor="apollo-key">Apollo API Key</Label>
                    <Input
                        id="apollo-key"
                        placeholder="Enter your Apollo API key"
                        value={apolloKey}
                        onChange={(e) => setApolloKey(e.target.value)}
                        required
                        className="font-mono"
                    />
                    <p className="text-xs text-muted-foreground">Used to enrich contact data</p>
                </div>

                {/* Email Subject */}
                <div className="space-y-2">
                    <Label htmlFor="subject">Default Email Subject</Label>
                    <Input
                        id="subject"
                        placeholder="e.g., Partnership Opportunity with VSS"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                    />
                </div>

                {/* Email Template */}
                <div className="space-y-2">
                    <Label htmlFor="template">
                        Email Template
                    </Label>
                    <div className="min-h-[250px] mb-12">
                        <RichTextEditor
                            value={template}
                            onChange={setTemplate}
                            placeholder="Hi {{First Name}},&#10;&#10;{{Company Interest}}&#10;&#10;{{Person Interest}}&#10;&#10;Best,&#10;VSS Team"
                            className="bg-background"
                        />
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Use <code>{"{{Variable Name}}"}</code> syntax for dynamic content. You can name them whatever you want (e.g. <code>{"{{POC First Name}}"}</code>).
                    </p>
                </div>

                {/* Variable Mapping */}
                {detectedVariables.length > 0 && (
                    <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <Wand2 className="h-4 w-4 text-primary" />
                                <h3 className="font-semibold text-sm">Map Your Variables</h3>
                            </div>
                            {isAutoMapping && (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
                                    <Sparkles className="h-3 w-3" />
                                    Auto-mapping...
                                </div>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground mb-4">
                            Select how the agent should fill each variable found in your template.
                        </p>

                        <div className="grid gap-3">
                            {detectedVariables.map(variable => (
                                <div key={variable} className="grid grid-cols-1 sm:grid-cols-2 items-center gap-2">
                                    <span className="text-sm font-medium font-mono bg-background px-2 py-1 rounded border">
                                        {variable}
                                    </span>
                                    <Select
                                        value={mappings[variable] || ''}
                                        onValueChange={(val) => handleMappingChange(variable, val)}
                                    >
                                        <SelectTrigger className="h-9 w-full">
                                            <SelectValue placeholder="Select data source..." className="truncate" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {SYSTEM_GENERATORS.map(gen => (
                                                <SelectItem key={gen.value} value={gen.value}>
                                                    {gen.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Attachments */}
                <div className="space-y-2">
                    <Label>Attachments</Label>
                    <div className="grid gap-4">
                        {attachments.map((file, i) => {
                            const isImage = file.type?.startsWith('image/')
                            return (
                                <div key={i} className="flex items-center justify-between rounded-lg border p-3 bg-card shadow-sm">
                                    <div className="flex items-center gap-3 min-w-0">
                                        {isImage && file.url ? (
                                            <div className="h-12 w-12 rounded overflow-hidden shrink-0 border">
                                                <img
                                                    src={file.url}
                                                    alt={file.name}
                                                    className="h-full w-full object-cover"
                                                />
                                            </div>
                                        ) : (
                                            <div className="flex h-12 w-12 items-center justify-center rounded bg-primary/10 shrink-0">
                                                <FileIcon className="h-6 w-6 text-primary" />
                                            </div>
                                        )}
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium truncate">{file.name}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {file.type?.split('/')[1]?.toUpperCase() || 'File'}
                                            </p>
                                        </div>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="text-muted-foreground hover:text-destructive"
                                        onClick={() => removeAttachment(i)}
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            )
                        })}

                        <div className="flex items-center justify-center rounded-md border border-dashed p-6 transition-colors hover:bg-muted/50">
                            <label className="flex cursor-pointer flex-col items-center gap-2 text-center">
                                {uploading ? (
                                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                ) : (
                                    <Upload className="h-6 w-6 text-muted-foreground" />
                                )}
                                <span className="text-sm font-medium">
                                    {uploading ? "Uploading..." : "Drag & drop or click to upload"}
                                </span>
                                <input
                                    type="file"
                                    className="hidden"
                                    onChange={handleFileUpload}
                                    disabled={uploading}
                                />
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex justify-between items-center pt-4">
                {!isOnboarding && (
                    <Button
                        type="button"
                        variant="outline"
                        size="lg"
                        onClick={handleSendTestEmail}
                        disabled={isSendingTest || loading}
                    >
                        {isSendingTest ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Sending...
                            </>
                        ) : (
                            <>
                                <Send className="mr-2 h-4 w-4" />
                                Send Test Email
                            </>
                        )}
                    </Button>
                )}
                {isOnboarding && <div />}
                <Button type="submit" size="lg" disabled={loading || uploading}>
                    {loading ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                        </>
                    ) : isOnboarding ? (
                        <>
                            Get Started <ArrowRight className="ml-2 h-4 w-4" />
                        </>
                    ) : (
                        <>
                            <Save className="mr-2 h-4 w-4" />
                            Save Changes
                        </>
                    )}
                </Button>
            </div>
        </form>
    )
}
