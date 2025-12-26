import { NextRequest, NextResponse } from 'next/server';

// Types for company data
interface Company {
  id: string;
  name: string;
  domain: string | null;
  website: string | null;
  industry: string | null;
  location: string | null;
  employeeCount: number | null;
  fundingStatus: string | null;
  foundedYear: number | null;
  description: string | null;
  linkedinUrl: string | null;
  source: 'apollo' | 'perplexity';
}

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { getApolloKey } from "@/lib/api-helper"

async function getUser() {
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
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

interface SearchCriteria {
  industries: string[];
  locations: string[];
  sizes: string[];
  keywords: string[];
  fundingStatus: string | null;
}

// Parse the natural language prompt into search criteria using OpenRouter
async function parsePromptWithLLM(prompt: string): Promise<SearchCriteria> {
  const openrouterKey = process.env.OPENROUTER_API_KEY;

  if (!openrouterKey) {
    console.warn('OPENROUTER_API_KEY not set, using basic keyword extraction');
    return {
      industries: [],
      locations: [],
      sizes: [],
      keywords: prompt.toLowerCase().split(/\s+/).filter(w => w.length > 3),
      fundingStatus: null
    };
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://venture-strategy-solutions.com',
        'X-Title': 'Venture Sourcer'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3.5-haiku',
        messages: [
          {
            role: 'system',
            content: `You are a search criteria extractor. Given a natural language query about finding companies/startups, extract structured search criteria.

Return ONLY valid JSON with this structure:
{
  "industries": ["software", "fintech", etc] - industry keywords,
  "locations": ["san francisco, ca", "new york, ny"] - city/state/country,
  "sizes": ["1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5001-10000", "10000+"] - employee counts,
  "keywords": ["ai", "saas", "developer tools"] - other relevant keywords,
  "fundingStatus": "seed" | "series_a" | "series_b" | "series_c" | "funded" | null
}

Be liberal with keywords to maximize search results.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '{}';

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    throw new Error('No valid JSON in LLM response');
  } catch (error) {
    console.error('LLM parsing error:', error);
    return {
      industries: [],
      locations: [],
      sizes: [],
      keywords: prompt.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3),
      fundingStatus: null
    };
  }
}

// Use Perplexity to search for companies based on the prompt
async function searchPerplexity(prompt: string): Promise<Company[]> {
  const perplexityKey = process.env.PERPLEXITY_API_KEY;
  if (!perplexityKey) {
    console.warn('PERPLEXITY_API_KEY not set');
    return [];
  }

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content: `You are a startup and company research assistant. When given a search query about companies or startups, search the web and return a JSON array of companies that match.

For each company found, include:
- name: company name
- domain: website domain (e.g., "stripe.com")
- industry: primary industry
- location: headquarters location
- description: brief description of what they do
- fundingStatus: if known (seed, series_a, series_b, etc.)

Return ONLY a valid JSON array like:
[{"name": "...", "domain": "...", "industry": "...", "location": "...", "description": "...", "fundingStatus": "..."}]

Find up to 10 relevant companies. Focus on startups and growth-stage companies.`
          },
          {
            role: 'user',
            content: `Find companies matching: ${prompt}`
          }
        ],
        temperature: 0.2,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Perplexity API error:', response.status, errorText);
      return [];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '[]';

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn('No JSON array found in Perplexity response');
      return [];
    }

    const companies = JSON.parse(jsonMatch[0]);

    return companies.map((company: Record<string, unknown>, index: number): Company => ({
      id: `perplexity_${index}`,
      name: company.name as string || 'Unknown',
      domain: company.domain as string || null,
      website: company.domain ? `https://${company.domain}` : null,
      industry: company.industry as string || null,
      location: company.location as string || null,
      employeeCount: company.employeeCount as number || null,
      fundingStatus: company.fundingStatus as string || null,
      foundedYear: company.foundedYear as number || null,
      description: company.description as string || null,
      linkedinUrl: null,
      source: 'perplexity'
    }));
  } catch (error) {
    console.error('Perplexity search error:', error);
    return [];
  }
}

// Search Apollo for organizations
async function searchApollo(criteria: SearchCriteria): Promise<Company[]> {
  const user = await getUser()
  const apolloKey = await getApolloKey(user?.id)
  if (!apolloKey) {
    console.warn('APOLLO_API_KEY not set');
    return [];
  }

  try {
    // Build request body for Apollo
    const body: Record<string, unknown> = {
      per_page: 25
    };

    // Add industries as keyword tags
    if (criteria.industries.length > 0) {
      body.q_organization_keyword_tags = criteria.industries;
    }

    // Add locations
    if (criteria.locations.length > 0) {
      body.organization_locations = criteria.locations;
    }

    // Add sizes
    if (criteria.sizes.length > 0) {
      body.organization_num_employees_ranges = criteria.sizes;
    }

    // Add keywords as name search
    if (criteria.keywords.length > 0) {
      body.q_organization_name = criteria.keywords.join(' ');
    }

    const response = await fetch('https://api.apollo.io/v1/organizations/search', {
      method: 'POST',
      headers: {
        'x-api-key': apolloKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Apollo API error:', response.status, errorText);

      if (response.status === 422 || response.status === 403) {
        // Pass the Apollo error (like "Insufficient credits" or "Upgrade plan") to the client
        return []; // Returning empty array for now, but logging it is key.
        // Ideally we throw an error that the UI catches, but the current UI expects an array.
        // Let's rely on the previous logic but log specifically.
      }
      return [];
    }

    const data = await response.json();
    const organizations = data.organizations || data.accounts || [];

    return organizations.map((org: Record<string, unknown>): Company => ({
      id: `apollo_${org.id}`,
      name: org.name as string || 'Unknown',
      domain: org.domain as string || null,
      website: org.website_url as string || (org.domain ? `https://${org.domain}` : null),
      industry: org.industry as string || null,
      location: (org.city ? `${org.city}, ${org.state || org.country}` : null) as string | null,
      employeeCount: org.employee_count as number || null,
      fundingStatus: org.funding_status as string || null,
      foundedYear: org.founded_year as number || null,
      description: org.short_description as string || null,
      linkedinUrl: org.linkedin_url as string || null,
      source: 'apollo'
    }));
  } catch (error) {
    console.error('Apollo search error:', error);
    return [];
  }
}

// Deduplicate companies by domain or name
function deduplicateCompanies(companies: Company[]): Company[] {
  const seen = new Map<string, Company>();

  for (const company of companies) {
    const normalizedDomain = company.domain?.toLowerCase().replace(/^www\./, '') || '';
    const normalizedName = company.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const key = normalizedDomain || normalizedName;

    if (!seen.has(key)) {
      seen.set(key, company);
    }
  }

  return Array.from(seen.values());
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt } = body;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Invalid request: prompt is required' },
        { status: 400 }
      );
    }

    console.log('Parsing prompt:', prompt);
    const criteria = await parsePromptWithLLM(prompt);
    console.log('Extracted criteria:', criteria);

    // Search both Perplexity and Apollo in parallel
    const [perplexityResults, apolloResults] = await Promise.all([
      searchPerplexity(prompt),
      searchApollo(criteria)
    ]);

    console.log(`Perplexity returned ${perplexityResults.length} results`);
    console.log(`Apollo returned ${apolloResults.length} results`);

    // Combine and deduplicate
    const allCompanies = [...perplexityResults, ...apolloResults];
    const deduplicatedCompanies = deduplicateCompanies(allCompanies);

    console.log(`Total unique companies: ${deduplicatedCompanies.length}`);

    return NextResponse.json({
      success: true,
      companies: deduplicatedCompanies,
      meta: {
        perplexityCount: perplexityResults.length,
        apolloCount: apolloResults.length,
        totalUnique: deduplicatedCompanies.length,
        criteria
      }
    });
  } catch (error) {
    console.error('Company search error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
