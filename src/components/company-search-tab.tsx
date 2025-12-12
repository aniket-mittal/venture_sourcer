"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Search, Sparkles, Building2, MapPin, Users, ExternalLink, Loader2, AlertCircle } from "lucide-react"

interface Company {
  id: string
  name: string
  domain: string | null
  website: string | null
  industry: string | null
  location: string | null
  employeeCount: number | null
  fundingStatus: string | null
  foundedYear: number | null
  description: string | null
  linkedinUrl: string | null
  source: 'apollo' | 'pdl' | 'merged'
}

interface SearchResponse {
  success: boolean
  companies: Company[]
  meta: {
    apolloCount: number
    pdlCount: number
    totalUnique: number
  }
  error?: string
}

export function CompanySearchTab() {
  const [prompt, setPrompt] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [results, setResults] = useState<Company[]>([])
  const [meta, setMeta] = useState<SearchResponse['meta'] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSearch = async () => {
    if (!prompt.trim()) return

    setIsLoading(true)
    setError(null)
    setResults([])
    setMeta(null)

    try {
      const response = await fetch('/api/company-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      })

      const data: SearchResponse = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Search failed')
      }

      setResults(data.companies)
      setMeta(data.meta)
    } catch (err) {
      console.error('Search error:', err)
      setError(err instanceof Error ? err.message : 'An error occurred while searching')
    } finally {
      setIsLoading(false)
    }
  }

  const formatEmployeeCount = (count: number | null) => {
    if (!count) return null
    if (count >= 10000) return '10,000+'
    if (count >= 1000) return `${Math.floor(count / 1000)}k+`
    return count.toString()
  }

  return (
    <Card className="mx-auto max-w-4xl">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Search className="h-5 w-5 text-primary" />
              Company Search
            </CardTitle>
            <CardDescription className="text-base">
              Search for startups and companies using natural language prompts
            </CardDescription>
          </div>
          <div className="rounded-full bg-primary/10 p-2">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label htmlFor="company-prompt" className="text-base font-medium">
            Search Prompt
          </Label>
          <Textarea
            id="company-prompt"
            placeholder="e.g., Find all B2B SaaS startups in San Francisco with Series A funding that focus on developer tools..."
            className="min-h-[120px] resize-none text-base"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isLoading}
          />
          <p className="text-sm text-muted-foreground">
            Describe the companies you&apos;re looking for in as much detail as possible
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={handleSearch}
            size="lg"
            className="flex-1 gap-2 font-medium sm:flex-none"
            disabled={!prompt.trim() || isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching...
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                Search Companies
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => {
              setPrompt("")
              setResults([])
              setMeta(null)
              setError(null)
            }}
            disabled={(!prompt.trim() && results.length === 0) || isLoading}
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
              <h3 className="text-lg font-semibold">Search Results</h3>
              {meta && (
                <p className="text-sm text-muted-foreground">
                  Found {meta.totalUnique} companies
                </p>
              )}
            </div>

            <div className="grid gap-4">
              {results.map((company) => (
                <div
                  key={company.id}
                  className="rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent/50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-foreground">{company.name}</h4>
                        {company.source === 'merged' && (
                          <Badge variant="secondary" className="text-xs">Verified</Badge>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        {company.industry && (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3.5 w-3.5" />
                            {company.industry}
                          </span>
                        )}
                        {company.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {company.location}
                          </span>
                        )}
                        {company.employeeCount && (
                          <span className="flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" />
                            {formatEmployeeCount(company.employeeCount)} employees
                          </span>
                        )}
                        {company.fundingStatus && (
                          <Badge variant="outline" className="text-xs capitalize">
                            {company.fundingStatus.replace(/_/g, ' ')}
                          </Badge>
                        )}
                      </div>

                      {company.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {company.description}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      {company.website && (
                        <a
                          href={company.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Website
                        </a>
                      )}
                      {company.linkedinUrl && (
                        <a
                          href={company.linkedinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          LinkedIn
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Example prompts - only show when no results */}
        {results.length === 0 && !isLoading && (
          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-sm font-medium text-foreground">Example searches:</p>
            <div className="space-y-2">
              {[
                "Fintech companies in NYC with over 50 employees",
                "Healthcare AI startups that raised funding in 2024",
                "Enterprise SaaS companies targeting the real estate industry",
              ].map((example, i) => (
                <button
                  key={i}
                  onClick={() => setPrompt(example)}
                  className="block w-full rounded-md border border-border bg-card px-3 py-2 text-left text-sm text-card-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
