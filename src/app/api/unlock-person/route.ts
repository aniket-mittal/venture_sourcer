import { NextRequest, NextResponse } from 'next/server';

// Enrich a single person via Apollo People Match API to unlock real email
async function enrichPerson(firstName: string, lastName: string, companyName: string, domain: string) {
    const apolloKey = process.env.APOLLO_API_KEY;
    if (!apolloKey) {
        throw new Error('APOLLO_API_KEY not set');
    }

    const response = await fetch('https://api.apollo.io/v1/people/match', {
        method: 'POST',
        headers: {
            'x-api-key': apolloKey,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            first_name: firstName,
            last_name: lastName,
            organization_name: companyName,
            domain: domain,
            reveal_personal_emails: true
        })
    });

    if (!response.ok) {
        throw new Error(`Apollo API error: ${response.status}`);
    }

    const data = await response.json();
    const enrichedPerson = data.person;

    if (enrichedPerson) {
        const email = enrichedPerson.email || enrichedPerson.email_display || null;
        const phone = enrichedPerson.phone_number || enrichedPerson.sanitized_phone || null;

        if (email && !email.includes('email_not_unlocked')) {
            return { email, phone };
        }
    }

    return { email: null, phone: null };
}

// Research person with Perplexity
async function researchPerson(name: string, title: string, companyName: string) {
    const perplexityKey = process.env.PERPLEXITY_API_KEY;
    if (!perplexityKey) {
        return '';
    }

    try {
        const searchQuery = `${name} ${title || ''} ${companyName}`;

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
                        content: `You are researching a professional for business outreach. Search the web and provide a brief 2-3 sentence summary about this person's background, achievements, or recent work that would be relevant for a business introduction. Focus on their professional accomplishments.

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
            return '';
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';

        if (content.toLowerCase().includes('no additional information found') ||
            content.toLowerCase().includes("couldn't find")) {
            return '';
        }

        return content.trim();
    } catch {
        return '';
    }
}

// Generate personalized paragraphs
async function generateParagraphs(personName: string, personTitle: string, companyName: string, companyIndustry: string, research: string) {
    const openrouterKey = process.env.OPENROUTER_API_KEY;

    const fallback = {
        companyInterest: `We at Venture Strategy Solutions are excited about ${companyName}'s work in ${companyIndustry || 'the technology sector'}.`,
        personInterest: `We're particularly interested in connecting with ${personName} given their expertise as ${personTitle || 'a key team member'}.`
    };

    if (!openrouterKey) {
        return fallback;
    }

    try {
        const additionalContext = research ? `\n\nAdditional research about this person:\n${research}` : '';

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
                        content: `You are writing personalized outreach paragraphs for Venture Strategy Solutions (VSS), a student-led organization at Berkeley that provides technology and strategy consulting services to startups.

Write two SHORT paragraphs (2-3 sentences each):
1. "companyInterest": Express genuine interest in what the target company does
2. "personInterest": Express specific interest in what this person does at the company

Return ONLY valid JSON:
{"companyInterest": "...", "personInterest": "..."}`
                    },
                    {
                        role: 'user',
                        content: `Company: ${companyName}
Industry: ${companyIndustry || 'Technology'}

Person: ${personName}
Role: ${personTitle || 'Team member'}${additionalContext}`
                    }
                ],
                temperature: 0.7,
                max_tokens: 400
            })
        });

        if (!response.ok) {
            return fallback;
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';

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
            } catch {
                // Fall through to fallback
            }
        }

        return fallback;
    } catch {
        return fallback;
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { firstName, lastName, name, title, companyName, companyDomain, companyIndustry } = body;

        if (!firstName || !lastName || !companyName) {
            return NextResponse.json(
                { error: 'firstName, lastName, and companyName are required' },
                { status: 400 }
            );
        }

        console.log(`Unlocking ${name} at ${companyName}...`);

        // Step 1: Enrich with Apollo to get email
        const domain = companyDomain || companyName.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
        const enrichedContact = await enrichPerson(firstName, lastName, companyName, domain);

        // Step 2: Research with Perplexity
        const researchSummary = await researchPerson(name || `${firstName} ${lastName}`, title || '', companyName);

        // Step 3: Generate personalized paragraphs
        const paragraphs = await generateParagraphs(
            name || `${firstName} ${lastName}`,
            title || '',
            companyName,
            companyIndustry || '',
            researchSummary
        );

        console.log(`Unlocked ${name}: email=${enrichedContact.email}`);

        return NextResponse.json({
            success: true,
            email: enrichedContact.email,
            phone: enrichedContact.phone,
            researchSummary: researchSummary || undefined,
            companyInterestParagraph: paragraphs.companyInterest,
            personInterestParagraph: paragraphs.personInterest
        });
    } catch (error) {
        console.error('Unlock person error:', error);
        return NextResponse.json(
            { error: 'Failed to unlock person', details: String(error) },
            { status: 500 }
        );
    }
}
