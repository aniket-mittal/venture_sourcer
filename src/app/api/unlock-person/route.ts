import { NextRequest, NextResponse } from 'next/server';

// Venture Strategy Solutions context for generating interest paragraphs
const VSS_CONTEXT = `Venture Strategy Solutions is a student-led organization at Berkeley that provides technology and strategy consulting services targeted towards startups. We've worked with leading companies like Figma, Niantic and Lime and provide exceptional work for whatever a startup may need help with.`;

// Enrich a single person via Apollo People Match API to unlock real email
async function enrichPerson(firstName: string, lastName: string, companyName: string) {
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

// Use Perplexity to research a person for more detailed information
async function researchPersonWithPerplexity(name: string, title: string, companyName: string): Promise<string> {
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
    personName: string,
    personTitle: string,
    personSeniority: string,
    companyName: string,
    companyIndustry: string,
    companyDescription: string,
    perplexityResearch: string
): Promise<{ companyInterest: string; personInterest: string }> {
    const openrouterKey = process.env.OPENROUTER_API_KEY;

    const fallback = {
        companyInterest: `We at Venture Strategy Solutions are excited about ${companyName}'s work in ${companyIndustry || 'the technology sector'}. As a student-led consulting organization at Berkeley, we'd love to explore how we can support your growth.`,
        personInterest: `We're particularly interested in connecting with ${personName} given their expertise as ${personTitle || 'a key team member'}. Your insights would be invaluable as we discuss potential collaboration opportunities.`
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
                        content: `Company: ${companyName}
Industry: ${companyIndustry || 'Technology'}
Description: ${companyDescription || 'A technology company'}

Person: ${personName}
Role: ${personTitle || 'Team member'}
Seniority: ${personSeniority || 'Unknown'}${additionalContext}`
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
        const companyMatch = content.match(/companyInterest["\\s:]+([^"]+"|[^}]+)/i);
        const personMatch = content.match(/personInterest["\\s:]+([^"]+"|[^}]+)/i);

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
        const { firstName, lastName, name, title, seniority, companyName, companyIndustry, companyDescription } = body;

        if (!firstName || !lastName || !companyName) {
            return NextResponse.json(
                { error: 'firstName, lastName, and companyName are required' },
                { status: 400 }
            );
        }

        console.log(`Unlocking ${name} at ${companyName}...`);

        // Step 1: Enrich with Apollo to get email (uses company name, no domain needed)
        const enrichedContact = await enrichPerson(firstName, lastName, companyName);

        // Step 2: Research with Perplexity (same prompt as people-lookup)
        const researchSummary = await researchPersonWithPerplexity(
            name || `${firstName} ${lastName}`,
            title || '',
            companyName
        );

        // Step 3: Generate personalized paragraphs (same prompt as people-lookup)
        const paragraphs = await generateInterestParagraphs(
            name || `${firstName} ${lastName}`,
            title || '',
            seniority || '',
            companyName,
            companyIndustry || '',
            companyDescription || '',
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
