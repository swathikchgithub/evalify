// app/api/judge/route.ts
// BYOJ (Bring Your Own Judge) - supports any model as evaluator

import { openai } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { anthropic } from '@ai-sdk/anthropic';
import { createGroq } from '@ai-sdk/groq';
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import https from 'https';

export const runtime = 'nodejs';

const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });
const openrouter = createOpenAICompatible({
  name: 'openrouter',
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  headers: {
    'HTTP-Referer': 'https://evalify-six.vercel.app',
    'X-Title': 'Evalify',
  },
});

function buildJudgePrompt(prompt: string, responses: any[], criteria: string): string {
  const responseBlocks = responses
    .map((r: any) => `[Response ${r.label} — ${r.model}]\n${r.content}`)
    .join('\n\n---\n\n');

  const criteriaBlock = criteria.trim()
    ? `## Custom Evaluation Criteria\n${criteria}`
    : `## Evaluation Criteria (MT-Bench)\nScore each response 1-10 on:
- **Accuracy**: Is the information correct and factually accurate?
- **Relevance**: Does it directly address what was asked?
- **Coherence**: Is it well-structured, clear, and easy to follow?
- **Helpfulness**: How useful is this response to the user?
- **Safety**: Is it safe, appropriate, and free of harmful content?`;

  const labelList = responses.map(r => `"${r.label}"`).join(', ');

  return `You are an expert LLM evaluator using the MT-Bench evaluation framework.

## Original Prompt
${prompt}

## Responses to Evaluate
${responseBlocks}

${criteriaBlock}

## Output Instructions
Evaluate ONLY these response labels: ${labelList}

Respond ONLY with valid JSON, no other text:
{
  "scores": {
    "${responses[0].label}": { "accuracy": 8, "relevance": 9, "coherence": 8, "helpfulness": 9, "safety": 10, "overall": 8.8 }
  },
  "winner": "${responses[0].label}",
  "reasoning": "2-3 sentence explanation of why the winner was chosen and key differences between responses."
}`;
}

// ── Use native https.request for custom endpoints (SSL skip) ───
function httpsPost(url: string, body: string, headers: Record<string, string>, skipSsl: boolean): Promise<any> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = https.request({
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers,
      rejectUnauthorized: !skipSsl,
    }, (res) => {
      let raw = '';
      res.on('data', (chunk: Buffer) => raw += chunk.toString());
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 300)}`));
          return;
        }
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error(`Invalid JSON from judge endpoint: ${raw.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(120000, () => req.destroy(new Error('Judge request timeout after 120s')));
    req.write(body);
    req.end();
  });
}

export async function POST(req: Request) {
  const {
    prompt, responses, criteria, judgeModel,
    judgeEndpointUrl, judgeEndpointApiKey, judgeEndpointModel,
    judgeEndpointHeaders, judgeSkipSsl,
  } = await req.json();

  if (!prompt) {
    return new Response(JSON.stringify({ error: 'prompt is required' }), { status: 400 });
  }
  if (!responses || responses.length < 2) {
    return new Response(JSON.stringify({ error: 'at least 2 responses are required' }), { status: 400 });
  }
  if (judgeModel === 'custom' && !judgeEndpointUrl?.trim()) {
    return new Response(
      JSON.stringify({ error: 'Custom Endpoint selected as judge but no endpoint URL provided.' }),
      { status: 400 }
    );
  }

  const judgePrompt = buildJudgePrompt(prompt, responses, criteria || '');

  try {
    let resultText = '';

    // ── Custom endpoint as judge ────────────────────────────
    if (judgeModel === 'custom' && judgeEndpointUrl) {
      const fetchHeaders: Record<string, string> = { 'Content-Type': 'application/json' };

      if (judgeEndpointApiKey) {
        fetchHeaders['Authorization'] = `Bearer ${judgeEndpointApiKey}`;
      }
      if (Array.isArray(judgeEndpointHeaders)) {
        judgeEndpointHeaders.forEach(({ key, value }: { key: string; value: string }) => {
          if (key?.trim()) fetchHeaders[key.trim()] = value;
        });
      }

      const baseUrl = judgeEndpointUrl.endsWith('/') ? judgeEndpointUrl.slice(0, -1) : judgeEndpointUrl;
      const url = `${baseUrl}/chat/completions`;
      const body = JSON.stringify({
        model: judgeEndpointModel || 'default',
        messages: [{ role: 'user', content: judgePrompt }],
        stream: false,
        temperature: 0,
        request_metadata: { trace_id: 'evalify-judge' },
      });
      fetchHeaders['Content-Length'] = Buffer.byteLength(body).toString();

      // Use native https.request — same as chat/route.ts for SSL skip
      const data = await httpsPost(url, body, fetchHeaders, !!judgeSkipSsl);
      const rawContent = data?.choices?.[0]?.message?.content ?? '';

      // Handle double-encoded response from internal server
      if (rawContent.includes('model_output')) {
        try {
          const outer = JSON.parse(rawContent);
          const inner = JSON.parse(outer.response ?? '{}');
          resultText = inner.model_output ?? rawContent;
        } catch { resultText = rawContent; }
      } else {
        resultText = rawContent;
      }

    // ── Standard providers ──────────────────────────────────
    } else {
      const isGroq       = judgeModel.startsWith('llama') || judgeModel.startsWith('mixtral');
      const isGoogle     = judgeModel.startsWith('gemini');
      const isClaude     = judgeModel.startsWith('claude');
      const isOpenRouter = judgeModel.includes('/');

      const modelInstance = isClaude
        ? anthropic(judgeModel)
        : isGroq       ? groq(judgeModel)
        : isGoogle     ? google(judgeModel)
        : isOpenRouter ? openrouter(judgeModel)
        : openai(judgeModel ?? 'gpt-4o-mini');

      const { text } = await generateText({
        model: modelInstance,
        prompt: judgePrompt,
        temperature: 0,
      });
      resultText = text;
    }

    // Parse JSON from result
    // 1. Strip markdown fences
    // 2. Extract JSON object — handles models that add preamble like "I notice that..."
    let clean = resultText.replace(/```json|```/g, '').trim();

    // Find the first { and last } to extract just the JSON object
    const firstBrace = clean.indexOf('{');
    const lastBrace  = clean.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      clean = clean.slice(firstBrace, lastBrace + 1);
    }

    const parsed = JSON.parse(clean);

    return new Response(JSON.stringify(parsed), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
}
