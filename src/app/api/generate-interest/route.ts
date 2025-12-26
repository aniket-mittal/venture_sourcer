import { NextRequest, NextResponse } from 'next/server';

// Venture Strategy Solutions context
const VSS_CONTEXT = `Venture Strategy Solutions is a student-led organization at Berkeley that provides technology and strategy consulting services targeted towards startups. We've worked with leading companies like Figma, Niantic and Lime and provide exceptional work for whatever a startup may need help with.`;

interface GenerateRequest {
    type: 'companyInterest' | 'personInterest' | 'combinedInterest';
    companyName: string;
    companyIndustry?: string;
    personName?: string;
    personTitle?: string;
    personSeniority?: string;
}

// Helper: Research with Perplexity
async function performResearch(query: string, systemPrompt: string): Promise<string> {
    const perplexityKey = process.env.PERPLEXITY_API_KEY;
    if (!perplexityKey) return '';

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
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: query }
                ],
                temperature: 0.3,
                max_tokens: 300
            })
        });

        if (!response.ok) throw new Error(`Perplexity error: ${response.status}`);

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';

        if (content.toLowerCase().includes('no additional information found')) return '';

        return content.trim();
    } catch (error) {
        console.error('Research error:', error);
        return '';
    }
}

// Helper: Generate Text with OpenRouter
async function generateText(systemPrompt: string, userPrompt: string): Promise<string> {
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    if (!openrouterKey) throw new Error('OpenRouter API key not set');

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
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.7,
                max_tokens: 250 // Short response
            })
        });

        if (!response.ok) throw new Error(`OpenRouter error: ${response.status}`);

        const data = await response.json();
        return data.choices?.[0]?.message?.content?.trim() || '';
    } catch (error) {
        console.error('Generation error:', error);
        return '';
    }
}

export async function POST(request: NextRequest) {
    try {
        const body: GenerateRequest = await request.json();
        const { type, companyName, companyIndustry, personName, personTitle } = body;

        let research = '';
        let generatedText = '';

        if (type === 'companyInterest') {
            // 1. Research Company
            research = await performResearch(
                `Research recent news, specific products, or engineering blog posts for ${companyName}. Focus on technical details or company culture.`,
                `You are a researcher. Find specific, recent, and interesting details about the company that a student consultant could genuinely be excited about (e.g., specific API, open source tool, culture, recent funding, new product).`
            );

            // 2. Generate Company Interest
            generatedText = await generateText(
                `You are writing a personalized email introduction for Venture Strategy Solutions (VSS).
${VSS_CONTEXT}

Write a 1-2 sentence "Company Interest" paragraph.
- It MUST be specific to the company using the provided research.
- Express genuine excitement (e.g., "I'm a huge user of...", "I recently used...", "I love how...").
- Do NOT be generic. Mention specific products, features, or initiatives.
- If research is sparse, focus on their known industry reputation but keep it high energy.`,
                `Company: ${companyName}\nIndustry: ${companyIndustry}\nResearch: ${research}`
            );

        } else if (type === 'personInterest') {
            // 1. Research Person
            research = await performResearch(
                `Research ${personName} (${personTitle}) at ${companyName}. Look for interviews, articles, GitHub activity, talks, or specific projects.`,
                `You are a researcher. Find specific details about this person's professional work, such as packages they maintain, talks they've given, or articles they've written.`
            );

            // 2. Generate Person Interest
            generatedText = await generateText(
                `You are writing a personalized email introduction for Venture Strategy Solutions (VSS).
${VSS_CONTEXT}

Write a 1-2 sentence "Person Interest" paragraph.
- It MUST be specific to the person using the provided research.
- E.g., "I've been following your work on...", "I saw your talk at...", "Big fan of your article on...".
- If no specific research is found, compliment their role/tenure/impact at the company generally but warmly.`,
                `Person: ${personName}\nRole: ${personTitle}\nCompany: ${companyName}\nResearch: ${research}`
            );

        } else if (type === 'combinedInterest') {
            // 1. Research Both (Light)
            research = await performResearch(
                `Research ${personName} at ${companyName} and recent company news.`,
                `Find a connection between the person and the company's recent work.`
            );

            // 2. Generate Combined Interest
            generatedText = await generateText(
                `You are writing a personalized email introduction for Venture Strategy Solutions (VSS).
${VSS_CONTEXT}

Write a 1-2 sentence "Combined Interest" paragraph.
- Connect the person to the company's mission or recent success.
- E.g., "I'm a huge fan of ${companyName}'s recent [project] and I know your team led the effort..."
- Keep it natural and enthusiastic.`,
                `Person: ${personName}\nRole: ${personTitle}\nCompany: ${companyName}\nResearch: ${research}`
            );
        }

        return NextResponse.json({
            success: true,
            content: generatedText,
            researchUsed: research
        });

    } catch (error) {
        console.error('Generate interest error:', error);
        return NextResponse.json({ error: 'Failed to generate content' }, { status: 500 });
    }
}
