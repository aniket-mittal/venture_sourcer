import { NextRequest, NextResponse } from 'next/server';

const SYSTEM_GENERATORS = [
    { value: 'firstName', label: 'First Name', description: 'The first name of the person (e.g. John)' },
    { value: 'lastName', label: 'Last Name', description: 'The last name of the person (e.g. Doe)' },
    { value: 'fullName', label: 'Full Name', description: 'The full name of the person (e.g. John Doe)' },
    { value: 'companyName', label: 'Company Name', description: 'The name of the company (e.g. Acme Corp)' },
    { value: 'companyDomain', label: 'Company Domain', description: 'The website domain of the company (e.g. acme.com)' },
    { value: 'companyIndustry', label: 'Company Industry', description: 'The industry of the company (e.g. Software)' },
    { value: 'companyDescription', label: 'Company Description', description: 'A brief description of what the company does.' },
    { value: 'companyInterest', label: 'Company Interest', description: 'A personalized 1-2 sentence paragraph about why we are interested in the company, based on research.' },
    { value: 'personInterest', label: 'Person Interest', description: 'A personalized 1-2 sentence paragraph about why we are interested in the person, based on their background/work.' },
    { value: 'combinedInterest', label: 'Combined Interest', description: 'A personalized 1-2 sentence paragraph connecting the person to the company.' },
];

export async function POST(request: NextRequest) {
    try {
        const { variables } = await request.json();

        if (!variables || !Array.isArray(variables) || variables.length === 0) {
            return NextResponse.json({ mappings: {} });
        }

        const openrouterKey = process.env.OPENROUTER_API_KEY;
        if (!openrouterKey) {
            console.warn('OPENROUTER_API_KEY not set');
            return NextResponse.json({ mappings: {} });
        }

        const prompt = `
        You are an intelligent assistant that maps email template variables to system data generators.
        
        Available Generators:
        ${JSON.stringify(SYSTEM_GENERATORS, null, 2)}
        
        User's Template Variables:
        ${JSON.stringify(variables)}
        
        Task:
        For each user variable, predict the best matching "value" from the Available Generators.
        If a variable seems to be a custom placeholder that doesn't match any generator (e.g., "Meeting Time", "My Name"), return null for that variable.
        
        Return JSON format only:
        {
            "Variable Name": "generator_value",
            "Another Variable": "another_value_or_null"
        }
        `;

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
                    { role: 'system', content: "You are a precise JSON generator. Output only valid JSON." },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.1,
                max_tokens: 500
            })
        });

        if (!response.ok) throw new Error(`OpenRouter error: ${response.status}`);

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content?.trim();

        // Robust JSON parsing (handle potential markdown fences)
        const jsonStr = content.replace(/```json\n?|\n?```/g, '');
        const mappings = JSON.parse(jsonStr);

        return NextResponse.json({ mappings });

    } catch (error) {
        console.error('Auto-map error:', error);
        return NextResponse.json({ mappings: {} }); // Fail gracefully
    }
}
