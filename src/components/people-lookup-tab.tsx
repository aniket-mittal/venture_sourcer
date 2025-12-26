"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Building2, Download, Users, Loader2, Mail, Phone, Linkedin, ChevronDown, ChevronUp, Unlock, Lock, UserSearch, AlertCircle, CheckSquare, Filter, Send, FileText, Zap } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"

interface Person {
  id: string
  name: string
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
  title: string | null
  seniority: string | null
  linkedinUrl: string | null
  companyName: string
  companyInterestParagraph?: string
  personInterestParagraph?: string
  combinedInterestParagraph?: string
  researchSummary?: string
  source: 'apollo' | 'pdl' | 'merged'
  isUnlocked?: boolean
}

interface CompanyInfo {
  name: string
  domain: string | null
  industry: string | null
  description: string | null
}

interface LookupResponse {
  success: boolean
  people: Person[]
  company: CompanyInfo
  meta: {
    apolloCount: number
    pdlCount: number
    totalUnique: number
    enrichedCount: number
  }
  error?: string
}

export function PeopleLookupTab() {
  const [companyName, setCompanyName] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [results, setResults] = useState<Person[]>([])
  const [company, setCompany] = useState<CompanyInfo | null>(null)
  const [meta, setMeta] = useState<LookupResponse['meta'] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedPerson, setExpandedPerson] = useState<string | null>(null)
  const [unlockingIds, setUnlockingIds] = useState<Set<string>>(new Set())
  const [resultLimit, setResultLimit] = useState<number>(25)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [seniorities, setSeniorities] = useState<string[]>(['founder', 'c_suite', 'vp', 'director', 'manager', 'senior'])
  const [titleKeyword, setTitleKeyword] = useState<string>("")
  const [showFilters, setShowFilters] = useState(false)

  // Email Drafting State
  const [draftingPerson, setDraftingPerson] = useState<Person | null>(null)
  const [emailSubject, setEmailSubject] = useState("")
  const [emailBody, setEmailBody] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSending, setIsSending] = useState(false)

  // Apollo Status
  const [apolloStatus, setApolloStatus] = useState<{
    isValid: boolean
    dailyRequestsLeft: string | null
    isLoading: boolean
    error: string | null
  }>({ isValid: false, dailyRequestsLeft: null, isLoading: true, error: null })

  const supabase = createClient()

  // Check Apollo API status on mount
  useEffect(() => {
    const checkApolloStatus = async () => {
      try {
        const response = await fetch('/api/apollo-usage', { method: 'POST' })
        const data = await response.json()
        if (data.success && data.isValid) {
          setApolloStatus({
            isValid: true,
            dailyRequestsLeft: data.rateLimits?.dailyRequestsLeft || null,
            isLoading: false,
            error: null
          })
        } else {
          setApolloStatus({
            isValid: false,
            dailyRequestsLeft: null,
            isLoading: false,
            error: data.error || 'Invalid API key'
          })
        }
      } catch (err) {
        setApolloStatus({ isValid: false, dailyRequestsLeft: null, isLoading: false, error: 'Failed to check' })
      }
    }
    checkApolloStatus()
  }, [])

  // Seniority options
  const SENIORITY_OPTIONS = [
    { value: 'founder', label: 'Founder' },
    { value: 'c_suite', label: 'C-Suite' },
    { value: 'owner', label: 'Owner' },
    { value: 'vp', label: 'VP' },
    { value: 'director', label: 'Director' },
    { value: 'manager', label: 'Manager' },
    { value: 'senior', label: 'Senior' },
    { value: 'head', label: 'Head' },
    { value: 'entry', label: 'Entry' },
    { value: 'intern', label: 'Intern' },
  ]

  const handleLookup = async () => {
    if (!companyName.trim()) return

    setIsLoading(true)
    setError(null)
    setResults([])
    setCompany(null)
    setMeta(null)

    try {
      const response = await fetch('/api/people-lookup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          companyName,
          limit: resultLimit,
          seniorities: seniorities.length > 0 ? seniorities : undefined,
          titleKeywords: titleKeyword.trim() ? [titleKeyword.trim()] : undefined
        }),
      })

      const data = await response.json()

      if (data.error === 'COMPANY_NOT_FOUND') {
        setError(`Company "${companyName}" was not found. Please check the spelling or try a different company name.`)
        return
      }

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Lookup failed')
      }

      const peopleWithUnlockStatus = data.people.map((person: Person) => ({
        ...person,
        isUnlocked: false
      }))

      setResults(peopleWithUnlockStatus)
      setCompany(data.company)
      setMeta(data.meta)
    } catch (err) {
      console.error('Lookup error:', err)
      setError(err instanceof Error ? err.message : 'An error occurred while looking up people')
    } finally {
      setIsLoading(false)
    }
  }

  const handleUnlock = async (person: Person) => {
    if (!company) return

    setUnlockingIds(prev => new Set(prev).add(person.id))

    try {
      const response = await fetch('/api/unlock-person', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: person.firstName,
          lastName: person.lastName,
          name: person.name,
          title: person.title,
          seniority: person.seniority,
          companyName: person.companyName,
          companyIndustry: company.industry,
          companyDescription: company.description
        }),
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unlock failed')
      }

      setResults(prev => prev.map(p => {
        if (p.id === person.id) {
          return {
            ...p,
            email: data.email || p.email,
            phone: data.phone || p.phone,
            researchSummary: data.researchSummary,
            // unlock-person returns standard legacy paragraphs, but we might overwrite them with dynamic ones later
            companyInterestParagraph: data.companyInterestParagraph,
            personInterestParagraph: data.personInterestParagraph,
            isUnlocked: true
          }
        }
        return p
      }))

      if (meta) {
        setMeta({ ...meta, enrichedCount: meta.enrichedCount + 1 })
      }

      setExpandedPerson(person.id)
    } catch (err) {
      console.error('Unlock error:', err)
      setError(err instanceof Error ? err.message : 'Failed to unlock person')
    } finally {
      setUnlockingIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(person.id)
        return newSet
      })
    }
  }

  // --- Generation & Email Logic ---

  const generateContentIfNeeded = async (
    person: Person,
    requiredTypes: ('companyInterest' | 'personInterest' | 'combinedInterest')[]
  ) => {
    const updates: Partial<Person> = {}

    for (const type of requiredTypes) {
      // Check if we already have it
      if (type === 'companyInterest' && person.companyInterestParagraph) continue
      if (type === 'personInterest' && person.personInterestParagraph) continue
      if (type === 'combinedInterest' && person.combinedInterestParagraph) continue

      try {
        const response = await fetch('/api/generate-interest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type,
            companyName: person.companyName,
            companyIndustry: company?.industry,
            personName: person.name,
            personTitle: person.title,
            personSeniority: person.seniority
          })
        })
        const data = await response.json()
        if (data.success && data.content) {
          if (type === 'companyInterest') updates.companyInterestParagraph = data.content
          if (type === 'personInterest') updates.personInterestParagraph = data.content
          if (type === 'combinedInterest') updates.combinedInterestParagraph = data.content
          if (data.researchSummary) updates.researchSummary = data.researchSummary // Update research if new found
        }
      } catch (e) {
        console.error(`Failed to generate ${type}`, e)
      }
    }
    return updates
  }

  const handleDraftEmail = async (person: Person) => {
    setDraftingPerson(person)
    setIsGenerating(true)

    try {
      // 1. Fetch user profile for settings
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      const { data: profile } = await supabase
        .from('profiles')
        .select('email_subject, email_template, variable_mappings')
        .eq('id', user.id)
        .single()

      const template = profile?.email_template || "Hi {{First Name}},\n\n..."
      const subject = profile?.email_subject || "Hello"
      const mappings = profile?.variable_mappings || {}

      // 2. Identify variables in template
      const regex = /{{([^}]+)}}/g
      const matches = Array.from(template.matchAll(regex)).map(m => m[1]) // capture group inside curlies
      const uniqueVars = Array.from(new Set(matches)) // e.g. ["POC First Name", "Person Interest"]

      // 3. Determine required generation types
      const neededGenerators: ('companyInterest' | 'personInterest' | 'combinedInterest')[] = []

      uniqueVars.forEach(v => {
        const mappedTo = mappings[`{{${v}}}`] // mappings keys are full {{Var}}
        if (mappedTo === 'companyInterest') neededGenerators.push('companyInterest')
        if (mappedTo === 'personInterest') neededGenerators.push('personInterest')
        if (mappedTo === 'combinedInterest') neededGenerators.push('combinedInterest')
      })

      // 4. Generate content if missing
      const updates = await generateContentIfNeeded(person, neededGenerators)

      // Update local person state with new generated content
      const updatedPerson = { ...person, ...updates }

      // Update results list too so we don't re-generate next time
      setResults(prev => prev.map(p => p.id === person.id ? updatedPerson : p))

      // 5. Replace variables in template
      let finalBody = template
      uniqueVars.forEach(v => {
        const fullVar = `{{${v}}}`
        const mappedTo = mappings[fullVar]
        let value = `[Missing: ${v}]`

        if (mappedTo === 'firstName') value = updatedPerson.firstName || updatedPerson.name.split(' ')[0]
        if (mappedTo === 'lastName') value = updatedPerson.lastName || updatedPerson.name.split(' ').slice(-1)[0]
        if (mappedTo === 'fullName') value = updatedPerson.name
        if (mappedTo === 'companyName') value = updatedPerson.companyName
        if (mappedTo === 'companyInterest') value = updatedPerson.companyInterestParagraph || "I love your company."
        if (mappedTo === 'personInterest') value = updatedPerson.personInterestParagraph || "I'm impressed by your background."
        if (mappedTo === 'combinedInterest') value = updatedPerson.combinedInterestParagraph || "I see great alignment between us."

        // Handle undefined mapped variable (user hasn't mapped it yet)
        if (!mappedTo) value = `[Unmapped: ${v}]`

        finalBody = finalBody.replace(new RegExp(fullVar, 'g'), value)
      })

      setEmailSubject(subject)
      setEmailBody(finalBody)

    } catch (e) {
      console.error("Drafting error", e)
      alert("Error preparing draft: " + e)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleSendEmail = async () => {
    if (!draftingPerson) return
    setIsSending(true)
    try {
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: draftingPerson.email,
          subject: emailSubject,
          message: emailBody,
          recipientName: draftingPerson.name,
          companyName: draftingPerson.companyName
        })
      })

      if (!response.ok) throw new Error("Failed to send")

      toast.success(`Email sent to ${draftingPerson.name}`)
      setDraftingPerson(null) // Close editor
    } catch (e) {
      console.error(e)
      alert("Failed to send email. Ensure you are logged in with Gmail permissions.")
    } finally {
      setIsSending(false)
    }
  }

  // --- End Generation Logic ---

  const downloadCSV = () => {
    const unlockedPeople = results.filter(p => p.isUnlocked)
    if (unlockedPeople.length === 0) {
      setError('No unlocked contacts to download.')
      return
    }

    const headers = [
      'Name', 'Email', 'Phone', 'Title', 'Seniority', 'LinkedIn', 'Company', 'Company Interest', 'Person Interest'
    ]

    const rows = unlockedPeople.map(person => [
      person.name,
      person.email || '',
      person.phone || '',
      person.title || '',
      person.seniority || '',
      person.linkedinUrl || '',
      person.companyName,
      (person.companyInterestParagraph || '').replace(/"/g, '""'),
      (person.personInterestParagraph || '').replace(/"/g, '""')
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `${companyName.replace(/\s+/g, '_')}_contacts.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const toggleExpanded = (personId: string) => {
    setExpandedPerson(expandedPerson === personId ? null : personId)
  }

  const toggleSelected = (personId: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(personId)) newSet.delete(personId)
      else newSet.add(personId)
      return newSet
    })
  }

  const lockedPeople = results.filter(p => !p.isUnlocked)
  const allLockedSelected = lockedPeople.length > 0 && lockedPeople.every(p => selectedIds.has(p.id))

  const toggleSelectAllLocked = () => {
    if (allLockedSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(lockedPeople.map(p => p.id)))
  }

  const handleUnlockSelected = async () => {
    if (!company || selectedIds.size === 0) return

    const peopleToUnlock = results.filter(p => selectedIds.has(p.id) && !p.isUnlocked)
    if (peopleToUnlock.length === 0) return

    setUnlockingIds(prev => new Set([...prev, ...peopleToUnlock.map(p => p.id)]))

    const unlockPromises = peopleToUnlock.map(async (person) => {
      try {
        const response = await fetch('/api/unlock-person', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firstName: person.firstName,
            lastName: person.lastName,
            name: person.name,
            title: person.title,
            seniority: person.seniority,
            companyName: person.companyName,
            companyIndustry: company.industry,
            companyDescription: company.description
          }),
        })
        const data = await response.json()
        if (response.ok && data.success) return { personId: person.id, success: true, data }
        return { personId: person.id, success: false }
      } catch {
        return { personId: person.id, success: false }
      }
    })

    const results_data = await Promise.all(unlockPromises)

    setResults(prev => prev.map(p => {
      const result = results_data.find(r => r.personId === p.id)
      if (result?.success && result.data) {
        return {
          ...p,
          email: result.data.email || p.email,
          phone: result.data.phone || p.phone,
          researchSummary: result.data.researchSummary,
          companyInterestParagraph: result.data.companyInterestParagraph,
          personInterestParagraph: result.data.personInterestParagraph,
          isUnlocked: true
        }
      }
      return p
    }))

    const successCount = results_data.filter(r => r.success).length
    if (meta && successCount > 0) {
      setMeta({ ...meta, enrichedCount: meta.enrichedCount + successCount })
    }

    setSelectedIds(new Set())
    setUnlockingIds(new Set())
  }

  const unlockedCount = results.filter(p => p.isUnlocked).length
  const selectedLockedCount = [...selectedIds].filter(id => {
    const person = results.find(p => p.id === id)
    return person && !person.isUnlocked
  }).length

  return (
    <>
      <Card className="mx-auto max-w-4xl">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1.5">
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Users className="h-5 w-5 text-primary" />
                People Lookup
              </CardTitle>
              <CardDescription className="text-base">
                Get contact information and personalized outreach for people at a company
              </CardDescription>
            </div>
            <div className="flex flex-col items-end gap-1">
              {apolloStatus.isLoading ? (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Checking Apollo...
                </Badge>
              ) : apolloStatus.isValid ? (
                <>
                  <Badge variant="default" className="flex items-center gap-1 bg-green-600">
                    <Zap className="h-3 w-3" /> Apollo Active
                  </Badge>
                  {apolloStatus.dailyRequestsLeft && (
                    <span className="text-xs text-muted-foreground">
                      {apolloStatus.dailyRequestsLeft} daily requests left
                    </span>
                  )}
                </>
              ) : (
                <Badge variant="destructive" className="flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Apollo Error
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label htmlFor="company-name" className="text-base font-medium">Company Name</Label>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Building2 className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="company-name"
                  placeholder="e.g., Stripe, OpenAI, Notion..."
                  className="h-12 pl-10 text-base"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  disabled={isLoading}
                  onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
                />
              </div>
              <Select
                value={resultLimit.toString()}
                onValueChange={(value) => setResultLimit(parseInt(value))}
                disabled={isLoading}
              >
                <SelectTrigger className="h-12 w-[140px] text-base">
                  <UserSearch className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Results" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 people</SelectItem>
                  <SelectItem value="15">15 people</SelectItem>
                  <SelectItem value="25">25 people</SelectItem>
                  <SelectItem value="50">50 people</SelectItem>
                  <SelectItem value="100">100 people</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                className="h-12 w-12"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className={`h-4 w-4 ${showFilters ? 'text-primary' : ''}`} />
              </Button>
            </div>
            {showFilters && (
              <div className="space-y-4 p-4 rounded-lg border bg-muted/30">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Title Keyword</Label>
                  <Input
                    placeholder="e.g., Engineering, Product, Sales..."
                    value={titleKeyword}
                    onChange={(e) => setTitleKeyword(e.target.value)}
                    disabled={isLoading}
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Seniority Levels</Label>
                  <div className="flex flex-wrap gap-2">
                    {SENIORITY_OPTIONS.map((option) => (
                      <label
                        key={option.value}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border cursor-pointer transition-colors ${seniorities.includes(option.value)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background hover:bg-accent'
                          }`}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={seniorities.includes(option.value)}
                          onChange={(e) => {
                            if (e.target.checked) setSeniorities([...seniorities, option.value])
                            else setSeniorities(seniorities.filter(s => s !== option.value))
                          }}
                        />
                        <span className="text-xs font-medium">{option.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={handleLookup}
              size="lg"
              className="flex-1 gap-2 font-medium sm:flex-none"
              disabled={!companyName.trim() || isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Looking up...
                </>
              ) : (
                <>
                  <Users className="h-4 w-4" />
                  Find People
                </>
              )}
            </Button>
            {results.length > 0 && (
              <Button
                onClick={downloadCSV}
                size="lg"
                variant="secondary"
                className="gap-2 font-medium"
              >
                <Download className="h-4 w-4" />
                Download CSV ({unlockedCount})
              </Button>
            )}
            <Button
              variant="outline"
              size="lg"
              onClick={() => {
                setCompanyName("")
                setResults([])
                setCompany(null)
                setMeta(null)
                setError(null)
              }}
              disabled={(!companyName.trim() && results.length === 0) || isLoading}
            >
              Clear
            </Button>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {results.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">{company?.name || companyName} Team</h3>
                  {company?.industry && <p className="text-sm text-muted-foreground">{company.industry}</p>}
                </div>
                {meta && (
                  <p className="text-sm text-muted-foreground">Found {meta.totalUnique} people ({unlockedCount} unlocked)</p>
                )}
              </div>

              {lockedPeople.length > 0 && (
                <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 border">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="select-all"
                      checked={allLockedSelected}
                      onCheckedChange={toggleSelectAllLocked}
                    />
                    <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                      Select all locked ({lockedPeople.length})
                    </label>
                  </div>
                  {selectedLockedCount > 0 && (
                    <Button
                      size="sm"
                      onClick={handleUnlockSelected}
                      disabled={unlockingIds.size > 0}
                      className="gap-2"
                    >
                      {unlockingIds.size > 0 ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Unlocking {unlockingIds.size}...
                        </>
                      ) : (
                        <>
                          <CheckSquare className="h-4 w-4" />
                          Unlock Selected ({selectedLockedCount})
                        </>
                      )}
                    </Button>
                  )}
                </div>
              )}

              <div className="space-y-3">
                {results.map((person) => (
                  <div
                    key={person.id}
                    className={`rounded-lg border bg-card overflow-hidden ${selectedIds.has(person.id) ? 'border-primary' : 'border-border'}`}
                  >
                    <div
                      className="p-4 cursor-pointer hover:bg-accent/50 transition-colors"
                      onClick={() => toggleExpanded(person.id)}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          {!person.isUnlocked && (
                            <Checkbox
                              checked={selectedIds.has(person.id)}
                              onCheckedChange={() => toggleSelected(person.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="mt-1"
                            />
                          )}
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold text-foreground">{person.name}</h4>
                              {person.isUnlocked ? (
                                <Badge variant="default" className="text-xs bg-green-600">
                                  <Unlock className="h-3 w-3 mr-1" /> Unlocked
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-xs">
                                  <Lock className="h-3 w-3 mr-1" /> Locked
                                </Badge>
                              )}
                            </div>

                            {person.title && (
                              <p className="text-sm text-muted-foreground">{person.title}</p>
                            )}

                            <div className="flex flex-wrap items-center gap-4 text-sm">
                              {person.email && !person.email.includes('email_not_unlocked') && <span className="flex items-center gap-1 text-primary"><Mail className="h-3.5 w-3.5" />{person.email}</span>}
                              {person.phone && <span className="flex items-center gap-1 text-primary"><Phone className="h-3.5 w-3.5" />{person.phone}</span>}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="default"
                            className="gap-1"
                            disabled={unlockingIds.has(person.id)}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (!person.isUnlocked) {
                                handleUnlock(person)
                              } else {
                                handleDraftEmail(person)
                              }
                            }}
                          >
                            {unlockingIds.has(person.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                            {unlockingIds.has(person.id) ? "Loading..." : "Load Email"}
                          </Button>
                          <div className="text-muted-foreground">
                            {expandedPerson === person.id ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                          </div>
                        </div>
                      </div>
                    </div>

                    {expandedPerson === person.id && (
                      <div className="border-t border-border bg-muted/30 p-4 space-y-4">
                        {draftingPerson?.id === person.id ? (
                          /* Inline Email Editor */
                          isGenerating ? (
                            <div className="py-8 flex flex-col items-center justify-center space-y-3">
                              <Loader2 className="h-6 w-6 animate-spin text-primary" />
                              <p className="text-sm text-muted-foreground">Generating personalized email...</p>
                            </div>
                          ) : (
                            <div className="space-y-4">
                              <div className="space-y-2">
                                <Label className="text-xs font-medium">To: {person.email}</Label>
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs font-medium">Subject</Label>
                                <Input
                                  value={emailSubject}
                                  onChange={(e) => setEmailSubject(e.target.value)}
                                  className="h-9"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs font-medium">Body</Label>
                                <Textarea
                                  value={emailBody}
                                  onChange={(e) => setEmailBody(e.target.value)}
                                  className="min-h-[200px] font-mono text-sm whitespace-pre-wrap"
                                  placeholder="Your email content here..."
                                />
                                <p className="text-xs text-muted-foreground">Hyperlinks in your template will be preserved when sent.</p>
                              </div>
                              {/* Attachment Preview */}
                              <details className="text-sm">
                                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Attachments (click to view)</summary>
                                <div className="mt-2 p-2 rounded border bg-background text-xs">
                                  {/* We would fetch attachments here from profile, for now show a placeholder */}
                                  <span className="text-muted-foreground">Attachments from your settings will be included.</span>
                                </div>
                              </details>
                              <div className="flex justify-end gap-2 pt-2">
                                <Button variant="outline" size="sm" onClick={() => setDraftingPerson(null)}>Cancel</Button>
                                <Button size="sm" onClick={handleSendEmail} disabled={isSending}>
                                  {isSending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-2 h-3.5 w-3.5" />}
                                  {isSending ? "Sending..." : "Send Email"}
                                </Button>
                              </div>
                            </div>
                          )
                        ) : person.isUnlocked ? (
                          <>
                            {person.researchSummary && (
                              <div>
                                <h5 className="text-sm font-medium mb-1">Research</h5>
                                <p className="text-sm text-muted-foreground">{person.researchSummary}</p>
                              </div>
                            )}
                            <div className="flex justify-end">
                              <Button onClick={() => handleDraftEmail(person)}>
                                <FileText className="mr-2 h-4 w-4" />
                                Draft Email
                              </Button>
                            </div>
                          </>
                        ) : (
                          <div className="text-center py-4">
                            <p className="text-sm text-muted-foreground mb-3">Click "Load Email" to get contact info and generate email</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!draftingPerson} onOpenChange={(open) => !open && setDraftingPerson(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Draft Email to {draftingPerson?.name}</DialogTitle>
            <DialogDescription>
              {isGenerating ? "Generating personalized content based on your template..." : "Review and edit your email before sending."}
            </DialogDescription>
          </DialogHeader>

          {isGenerating ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Writing personalized lines...</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Body</Label>
                <Textarea
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  className="min-h-[300px] font-mono whitespace-pre-wrap"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDraftingPerson(null)}>Cancel</Button>
            <Button
              onClick={handleSendEmail}
              disabled={isGenerating || isSending}
            >
              {isSending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Send Email
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
