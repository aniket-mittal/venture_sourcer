import { NextRequest, NextResponse } from 'next/server';

// Types for person data
interface Person {
    id: string;
    name: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    title: string | null;
    seniority: string | null;
    linkedinUrl: string | null;
    companyName: string;
    companyInterestParagraph?: string;
    personInterestParagraph?: string;
    researchSummary?: string;
    source: 'apollo';
}

interface CompanyInfo {
    name: string;
    domain: string | null;
    industry: string | null;
    description: string | null;
}

// Venture Strategy Solutions context for generating interest paragraphs
const VSS_CONTEXT = `Venture Strategy Solutions is a student-led organization at Berkeley that provides technology and strategy consulting services targeted towards startups. We've worked with leading companies like Figma, Niantic and Lime and provide exceptional work for whatever a startup may need help with.`;

// Use Claude 3.5 to generate company name variations
async function generateCompanyVariations(companyName: string): Promise<string[]> {
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    if (!openrouterKey) {
        return [companyName];
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
                        content: `You help find variations of company names. Given a company name, return 3-5 possible variations that might help find the company in a database. Include the original name, common abbreviations, full legal name, and domain-style variations.

Return ONLY a JSON array of strings, like:
["Stripe", "Stripe Inc", "stripe.com", "Stripe, Inc."]`
                    },
                    {
                        role: 'user',
                        content: companyName
                    }
                ],
                temperature: 0.3,
                max_tokens: 100
            })
        });

        if (!response.ok) {
            console.error('Claude variation error:', response.status);
            return [companyName];
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '[]';

        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            const variations = JSON.parse(jsonMatch[0]);
            return [...new Set([companyName, ...variations])];
        }

        return [companyName];
    } catch (error) {
        console.error('Company variation error:', error);
        return [companyName];
    }
}

// Find company domain using Apollo, trying multiple name variations
async function findCompanyDomain(companyName: string): Promise<CompanyInfo | null> {
    const apolloKey = process.env.APOLLO_API_KEY;
    if (!apolloKey) {
        console.warn('APOLLO_API_KEY not set');
        return null;
    }

    // Generate name variations using Claude
    const variations = await generateCompanyVariations(companyName);
    console.log('Trying company variations:', variations);

    for (const name of variations) {
        try {
            const response = await fetch('https://api.apollo.io/api/v1/mixed_companies/search', {
                method: 'POST',
                headers: {
                    'x-api-key': apolloKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    q_organization_name: name,
                    per_page: 1
                })
            });

            if (!response.ok) {
                continue;
            }

            const data = await response.json();
            const org = data.organizations?.[0] || data.accounts?.[0];

            if (org && org.domain) {
                console.log(`Found company "${org.name}" with domain "${org.domain}" using variation "${name}"`);
                return {
                    name: org.name,
                    domain: org.domain,
                    industry: org.industry,
                    description: org.short_description
                };
            }
        } catch (error) {
            console.error(`Apollo domain lookup error for "${name}":`, error);
        }
    }

    // If no domain found via API, try common domain patterns as fallback
    const fallbackDomain = companyName.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
    console.log(`No domain found via API, trying fallback domain: ${fallbackDomain}`);

    return {
        name: companyName,
        domain: fallbackDomain,
        industry: null,
        description: null
    };
}

// Search Apollo for people at a company by name AND domain for best results
async function searchApolloPeople(companyName: string, limit: number = 100, domain?: string): Promise<Person[]> {
    const apolloKey = process.env.APOLLO_API_KEY;
    if (!apolloKey) {
        console.warn('APOLLO_API_KEY not set');
        return [];
    }

    const allPeople: Person[] = [];
    const seenIds = new Set<string>();

    // Strategy 1: Search by company name directly
    try {
        console.log(`Searching by company name: "${companyName}"`);
        const response = await fetch('https://api.apollo.io/api/v1/mixed_people/search', {
            method: 'POST',
            headers: {
                'x-api-key': apolloKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                q_organization_name: companyName,
                per_page: limit,
                person_seniorities: ['founder', 'c_suite', 'vp', 'director', 'manager', 'senior']
            })
        });

        if (response.ok) {
            const data = await response.json();
            const people = data.people || [];
            console.log(`Name search found ${people.length} people (total: ${data.pagination?.total_entries || 'unknown'})`);

            for (const person of people) {
                if (!seenIds.has(person.id)) {
                    seenIds.add(person.id);
                    allPeople.push({
                        id: `apollo_${person.id}`,
                        name: person.name as string || 'Unknown',
                        firstName: person.first_name as string || null,
                        lastName: person.last_name as string || null,
                        email: person.email as string || null,
                        phone: person.phone_number as string || null,
                        title: person.title as string || null,
                        seniority: person.seniority as string || null,
                        linkedinUrl: person.linkedin_url as string || null,
                        companyName: person.organization_name as string || companyName,
                        source: 'apollo'
                    });
                }
            }
        }
    } catch (error) {
        console.error('Apollo name search error:', error);
    }

    // Strategy 2: Search by domain if available and we need more results
    if (domain && allPeople.length < limit) {
        try {
            console.log(`Searching by domain: "${domain}"`);
            const response = await fetch('https://api.apollo.io/api/v1/mixed_people/search', {
                method: 'POST',
                headers: {
                    'x-api-key': apolloKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    q_organization_domains: domain,
                    per_page: limit,
                    person_seniorities: ['founder', 'c_suite', 'vp', 'director', 'manager', 'senior']
                })
            });

            if (response.ok) {
                const data = await response.json();
                const people = data.people || [];
                console.log(`Domain search found ${people.length} people (total: ${data.pagination?.total_entries || 'unknown'})`);

                for (const person of people) {
                    if (!seenIds.has(person.id) && allPeople.length < limit) {
                        seenIds.add(person.id);
                        allPeople.push({
                            id: `apollo_${person.id}`,
                            name: person.name as string || 'Unknown',
                            firstName: person.first_name as string || null,
                            lastName: person.last_name as string || null,
                            email: person.email as string || null,
                            phone: person.phone_number as string || null,
                            title: person.title as string || null,
                            seniority: person.seniority as string || null,
                            linkedinUrl: person.linkedin_url as string || null,
                            companyName: person.organization_name as string || companyName,
                            source: 'apollo'
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Apollo domain search error:', error);
        }
    }

    console.log(`Total unique people found: ${allPeople.length}`);
    return allPeople.slice(0, limit);
}

// Enrich a person via Apollo People Match API to unlock real email
// Uses company name from search results - no domain needed
async function enrichApolloPerson(person: Person): Promise<{ email: string | null; phone: string | null }> {
    const apolloKey = process.env.APOLLO_API_KEY;
    if (!apolloKey || !person.firstName || !person.lastName) {
        return { email: null, phone: null };
    }

    try {
        // Use organization_name from search results - more accurate than domain
        const response = await fetch('https://api.apollo.io/v1/people/match', {
            method: 'POST',
            headers: {
                'x-api-key': apolloKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                first_name: person.firstName,
                last_name: person.lastName,
                organization_name: person.companyName,
                reveal_personal_emails: true
            })
        });

        if (!response.ok) {
            console.error('Apollo Enrich API error:', response.status);
            return { email: null, phone: null };
        }

        const data = await response.json();
        const enrichedPerson = data.person;

        if (enrichedPerson) {
            const email = enrichedPerson.email || enrichedPerson.email_display || null;
            const phone = enrichedPerson.phone_number || enrichedPerson.sanitized_phone || null;

            // Check if it's a real email (not placeholder)
            if (email && !email.includes('email_not_unlocked')) {
                console.log(`Enriched ${person.name}: ${email}`);
                return { email, phone };
            }
        }

        return { email: null, phone: null };
    } catch (error) {
        console.error('Apollo enrichment error:', error);
        return { email: null, phone: null };
    }
}

// Use Perplexity to research a person for more detailed information
async function researchPersonWithPerplexity(
    person: Person,
    companyInfo: CompanyInfo
): Promise<string> {
    const perplexityKey = process.env.PERPLEXITY_API_KEY;
    if (!perplexityKey) {
        return '';
    }

    try {
        const searchQuery = `${person.name} ${person.title || ''} ${companyInfo.name}`;

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
                        content: `You are researching a professional for business outreach. Search the web and provide a brief 2-3 sentence summary about this person's background, achievements, or recent work that would be relevant for a business introduction. Focus on their professional accomplishments, any public speaking, articles they've written, or notable projects.

If you can't find specific information about this person, just say "No additional information found" - do NOT make up information.`
                    },
                    {
                        role: 'user',
                        content: `Research: ${searchQuery}`
                    }
                ],
                temperature: 0.3,
                max_tokens: 200
            })
        });

        if (!response.ok) {
            console.error('Perplexity person research error:', response.status);
            return '';
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';

        // Check if Perplexity found useful information
        if (content.toLowerCase().includes('no additional information found') ||
            content.toLowerCase().includes("couldn't find") ||
            content.toLowerCase().includes("i don't have")) {
            return '';
        }

        return content.trim();
    } catch (error) {
        console.error('Perplexity person research error:', error);
        return '';
    }
}

// Generate personalized interest paragraphs using OpenRouter with Perplexity research
async function generateInterestParagraphs(
    person: Person,
    companyInfo: CompanyInfo,
    perplexityResearch: string
): Promise<{ companyInterest: string; personInterest: string }> {
    const openrouterKey = process.env.OPENROUTER_API_KEY;

    const fallback = {
        companyInterest: `We at Venture Strategy Solutions are excited about ${companyInfo.name}'s work in ${companyInfo.industry || 'the technology sector'}. As a student-led consulting organization at Berkeley, we'd love to explore how we can support your growth.`,
        personInterest: `We're particularly interested in connecting with ${person.name} given their expertise as ${person.title || 'a key team member'}. Your insights would be invaluable as we discuss potential collaboration opportunities.`
    };

    if (!openrouterKey) {
        return fallback;
    }

    try {
        const additionalContext = perplexityResearch
            ? `\n\nAdditional research about this person:\n${perplexityResearch}`
            : '';

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
                        content: `You are writing personalized outreach paragraphs for Venture Strategy Solutions (VSS).

${VSS_CONTEXT}

Write two SHORT paragraphs (2-3 sentences each):
1. "companyInterest": Express genuine interest in what the target company does
2. "personInterest": Express specific interest in what this person does at the company. If additional research is provided, reference specific achievements or work.

Be professional, enthusiastic, and specific. Make it personal - reference their actual role and any research findings.

Return ONLY valid JSON:
{"companyInterest": "...", "personInterest": "..."}`
                    },
                    {
                        role: 'user',
                        content: `Company: ${companyInfo.name}
Industry: ${companyInfo.industry || 'Technology'}
Description: ${companyInfo.description || 'A technology company'}

Person: ${person.name}
Role: ${person.title || 'Team member'}
Seniority: ${person.seniority || 'Unknown'}${additionalContext}`
                    }
                ],
                temperature: 0.7,
                max_tokens: 400
            })
        });

        if (!response.ok) {
            console.error('OpenRouter API error:', response.status);
            return fallback;
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';

        // Try to extract JSON from the response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.companyInterest && parsed.personInterest) {
                    return {
                        companyInterest: parsed.companyInterest,
                        personInterest: parsed.personInterest
                    };
                }
            } catch (parseError) {
                console.error('JSON parse error, trying to extract text directly');
            }
        }

        // Fallback: try to extract text between quotes if JSON failed
        const companyMatch = content.match(/companyInterest["\s:]+([^"]+"|[^}]+)/i);
        const personMatch = content.match(/personInterest["\s:]+([^"]+"|[^}]+)/i);

        if (companyMatch || personMatch) {
            return {
                companyInterest: companyMatch ? companyMatch[1].replace(/["{}]/g, '').trim() : fallback.companyInterest,
                personInterest: personMatch ? personMatch[1].replace(/["{}]/g, '').trim() : fallback.personInterest
            };
        }

        return fallback;
    } catch (error) {
        console.error('Interest paragraph generation error:', error);
        return fallback;
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { companyName, limit = 100 } = body;

        // Validate limit to acceptable values
        const validLimits = [10, 15, 25, 50, 100];
        const searchLimit = validLimits.includes(limit) ? limit : 100;

        if (!companyName || typeof companyName !== 'string') {
            return NextResponse.json(
                { error: 'Invalid request: companyName is required' },
                { status: 400 }
            );
        }

        // Step 1: Find company domain (with variations)
        console.log('Looking up company:', companyName);
        const companyInfo = await findCompanyDomain(companyName);

        if (!companyInfo?.domain) {
            console.log('Company not found after trying variations');
            return NextResponse.json({
                success: false,
                error: 'COMPANY_NOT_FOUND',
                message: `Company "${companyName}" was not found. Please check the spelling or try a different company name.`,
                people: [],
                company: null,
                meta: {
                    apolloCount: 0,
                    totalUnique: 0,
                    enrichedCount: 0,
                    variationsTried: true
                }
            });
        }

        console.log('Using domain:', companyInfo.domain);

        // Step 2: Search for people at the company (by name and domain)
        const apolloResults = await searchApolloPeople(companyName, searchLimit, companyInfo.domain || undefined);
        console.log(`Apollo returned ${apolloResults.length} people`);

        if (apolloResults.length === 0) {
            return NextResponse.json({
                success: false,
                error: 'COMPANY_NOT_FOUND',
                message: `No people found at "${companyName}". The company may not be in our database or the name might be spelled differently.`,
                people: [],
                company: companyInfo,
                meta: {
                    apolloCount: 0,
                    totalUnique: 0,
                    enrichedCount: 0,
                    message: 'Company found but no people data available.'
                }
            });
        }

        // Return all people without enrichment - users will unlock individually
        return NextResponse.json({
            success: true,
            people: apolloResults,
            company: companyInfo,
            meta: {
                apolloCount: apolloResults.length,
                totalUnique: apolloResults.length,
                enrichedCount: 0
            }
        });
    } catch (error) {
        console.error('People lookup error:', error);
        return NextResponse.json(
            { error: 'Internal server error', details: String(error) },
            { status: 500 }
        );
    }
}
