"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Building2, Download, Users, Loader2, Mail, Phone, Linkedin, ChevronDown, ChevronUp, Unlock, Lock, UserSearch, AlertCircle } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

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
        body: JSON.stringify({ companyName, limit: resultLimit }),
      })

      const data = await response.json()

      // Check for COMPANY_NOT_FOUND error
      if (data.error === 'COMPANY_NOT_FOUND') {
        setError(`Company "${companyName}" was not found. Please check the spelling or try a different company name.`)
        return
      }

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Lookup failed')
      }

      // All people start as locked - users unlock individually
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
        headers: {
          'Content-Type': 'application/json',
        },
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

      // Update the person in results
      setResults(prev => prev.map(p => {
        if (p.id === person.id) {
          return {
            ...p,
            email: data.email || p.email,
            phone: data.phone || p.phone,
            researchSummary: data.researchSummary,
            companyInterestParagraph: data.companyInterestParagraph,
            personInterestParagraph: data.personInterestParagraph,
            isUnlocked: true
          }
        }
        return p
      }))

      // Update meta count
      if (meta) {
        setMeta({ ...meta, enrichedCount: meta.enrichedCount + 1 })
      }

      // Expand to show the new content
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

  const downloadCSV = () => {
    // Only include unlocked people
    const unlockedPeople = results.filter(p => p.isUnlocked)

    if (unlockedPeople.length === 0) {
      setError('No unlocked contacts to download. Click "Unlock" on people to get their personalized messages.')
      return
    }

    // Create CSV content
    const headers = [
      'Name',
      'Email',
      'Phone',
      'Title',
      'Seniority',
      'LinkedIn',
      'Company',
      'Company Interest',
      'Person Interest'
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

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `${companyName.replace(/\s+/g, '_')}_contacts.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const toggleExpanded = (personId: string) => {
    setExpandedPerson(expandedPerson === personId ? null : personId)
  }

  const unlockedCount = results.filter(p => p.isUnlocked).length

  return (
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
          <div className="rounded-full bg-primary/10 p-2">
            <Download className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label htmlFor="company-name" className="text-base font-medium">
            Company Name
          </Label>
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
              <SelectTrigger className="h-12 w-[140px]">
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
          </div>
          <p className="text-sm text-muted-foreground">Enter the name of the company to retrieve employee data</p>
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

        {/* Error message */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">
                  {company?.name || companyName} Team
                </h3>
                {company?.industry && (
                  <p className="text-sm text-muted-foreground">{company.industry}</p>
                )}
              </div>
              {meta && (
                <p className="text-sm text-muted-foreground">
                  Found {meta.totalUnique} people ({unlockedCount} unlocked)
                </p>
              )}
            </div>

            <div className="space-y-3">
              {results.map((person) => (
                <div
                  key={person.id}
                  className="rounded-lg border border-border bg-card overflow-hidden"
                >
                  <div
                    className="p-4 cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => toggleExpanded(person.id)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-foreground">{person.name}</h4>
                          {person.isUnlocked ? (
                            <Badge variant="default" className="text-xs bg-green-600">
                              <Unlock className="h-3 w-3 mr-1" />
                              Unlocked
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">
                              <Lock className="h-3 w-3 mr-1" />
                              Locked
                            </Badge>
                          )}
                        </div>

                        {person.title && (
                          <p className="text-sm text-muted-foreground">
                            {person.title}
                            {person.seniority && (
                              <span className="ml-2">
                                <Badge variant="outline" className="text-xs capitalize">
                                  {person.seniority.replace(/_/g, ' ')}
                                </Badge>
                              </span>
                            )}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-4 text-sm">
                          {person.email && !person.email.includes('email_not_unlocked') && (
                            <a
                              href={`mailto:${person.email}`}
                              className="flex items-center gap-1 text-primary hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Mail className="h-3.5 w-3.5" />
                              {person.email}
                            </a>
                          )}
                          {person.phone && (
                            <a
                              href={`tel:${person.phone}`}
                              className="flex items-center gap-1 text-primary hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Phone className="h-3.5 w-3.5" />
                              {person.phone}
                            </a>
                          )}
                          {person.linkedinUrl && (
                            <a
                              href={person.linkedinUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-primary hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Linkedin className="h-3.5 w-3.5" />
                              LinkedIn
                            </a>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {!person.isUnlocked && (
                          <Button
                            size="sm"
                            variant="default"
                            className="gap-1"
                            disabled={unlockingIds.has(person.id)}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleUnlock(person)
                            }}
                          >
                            {unlockingIds.has(person.id) ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Unlocking...
                              </>
                            ) : (
                              <>
                                <Unlock className="h-3.5 w-3.5" />
                                Unlock
                              </>
                            )}
                          </Button>
                        )}
                        <div className="text-muted-foreground">
                          {expandedPerson === person.id ? (
                            <ChevronUp className="h-5 w-5" />
                          ) : (
                            <ChevronDown className="h-5 w-5" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expanded content with interest paragraphs */}
                  {expandedPerson === person.id && (
                    <div className="border-t border-border bg-muted/30 p-4 space-y-4">
                      {person.isUnlocked ? (
                        <>
                          {person.companyInterestParagraph && (
                            <div>
                              <h5 className="text-sm font-medium mb-1">Company Interest</h5>
                              <p className="text-sm text-muted-foreground">
                                {person.companyInterestParagraph}
                              </p>
                            </div>
                          )}
                          {person.personInterestParagraph && (
                            <div>
                              <h5 className="text-sm font-medium mb-1">Personal Interest</h5>
                              <p className="text-sm text-muted-foreground">
                                {person.personInterestParagraph}
                              </p>
                            </div>
                          )}
                          {person.researchSummary && (
                            <div>
                              <h5 className="text-sm font-medium mb-1">Research Summary</h5>
                              <p className="text-sm text-muted-foreground">
                                {person.researchSummary}
                              </p>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-center py-4">
                          <Lock className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                          <p className="text-sm text-muted-foreground mb-3">
                            Click &quot;Unlock&quot; to get email, personalized messages, and research for this person
                          </p>
                          <Button
                            size="sm"
                            disabled={unlockingIds.has(person.id)}
                            onClick={() => handleUnlock(person)}
                          >
                            {unlockingIds.has(person.id) ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                                Unlocking...
                              </>
                            ) : (
                              <>
                                <Unlock className="h-3.5 w-3.5 mr-1" />
                                Unlock This Person
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Info box - only show when no results */}
        {results.length === 0 && !isLoading && (
          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-sm font-medium text-foreground">CSV will include (unlocked contacts only):</p>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-primary">•</span>
                <span>Full name and job title</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-primary">•</span>
                <span>Email and phone number (when available)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-primary">•</span>
                <span>LinkedIn profile links</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-primary">•</span>
                <span>Personalized company interest paragraph</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-primary">•</span>
                <span>Personalized person interest paragraph</span>
              </li>
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
