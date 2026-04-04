import { openai } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { anthropic } from '@ai-sdk/anthropic';
import { createGroq } from '@ai-sdk/groq';
import { google } from '@ai-sdk/google';
import { streamText } from 'ai';
import https from 'https';

// Force Node.js runtime — required for https module + Buffer
export const runtime = 'nodejs';
export const maxDuration = 60;

const DEBUG = false;
const log = (...args: any[]) => DEBUG && console.log('[route]', ...args);
const logError = (...args: any[]) => DEBUG && console.error('[route ERROR]', ...args);

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

// ── Use native https module for custom endpoint calls ─────────────
// fetch() in Next.js Turbopack doesn't reliably support SSL skip;
// https.request with rejectUnauthorized:false is the reliable solution.

// ── Extract real text from nested/double-encoded responses ─────
// This server wraps content as:
//   content = '{"response": "{\"model_output\": \"real text\"}", ...}'
function extractNestedContent(raw: string): string {
  if (!raw || typeof raw !== 'string') return raw;
  if (!raw.trim().startsWith('{')) return raw;

  try {
    const outer = JSON.parse(raw);

    if (outer.response && typeof outer.response === 'string') {
      try {
        const inner = JSON.parse(outer.response);
        if (inner.model_output && typeof inner.model_output === 'string') {
          return inner.model_output;
        }
        return outer.response;
      } catch {
        return outer.response;
      }
    }

    if (outer.model_output && typeof outer.model_output === 'string') {
      return outer.model_output;
    }

    for (const field of ['text', 'content', 'answer', 'output', 'result']) {
      if (outer[field] && typeof outer[field] === 'string') return outer[field];
    }
  } catch { /* not JSON — return raw */ }

  return raw;
}

// ── Convert non-streaming JSON response → AI SDK stream ────────
function convertNonStreamingToAISDK(data: any): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      try {
        const rawContent = data?.choices?.[0]?.message?.content ?? '';
        const content = extractNestedContent(rawContent);

        // Extract token stats from stats field
        let inputTokens = 0, outputTokens = 0;
        if (data?.stats && typeof data.stats === 'string') {
          try {
            const statsObj = JSON.parse(data.stats);
            const modelStats = statsObj?.stats?.models?.[0]?.stats;
            if (modelStats) {
              inputTokens  = modelStats.llm_input_token_length  ?? 0;
              outputTokens = modelStats.llm_output_token_length ?? 0;
            }
          } catch { /* ignore */ }
        }
        if (data?.usage) {
          inputTokens  = data.usage.prompt_tokens     ?? inputTokens;
          outputTokens = data.usage.completion_tokens ?? outputTokens;
        }

        // Stream content in chunks for natural rendering
        if (content) {
          const chunkSize = 150;
          for (let i = 0; i < content.length; i += chunkSize) {
            controller.enqueue(
              encoder.encode(`0:${JSON.stringify(content.slice(i, i + chunkSize))}\n`)
            );
          }
        }

        // Send usage
        const total = inputTokens + outputTokens;
        controller.enqueue(encoder.encode(
          total > 0
            ? `e:{"finishReason":"stop","usage":{"promptTokens":${inputTokens},"completionTokens":${outputTokens}}}\n`
            : 'd:{"finishReason":"stop"}\n'
        ));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

// ── Convert OpenAI SSE stream → AI SDK data stream ─────────────
function convertOpenAIStreamToAISDK(stream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = '';
  let inputTokens = 0, outputTokens = 0;
  let contentBuffer = '';

  return new ReadableStream({
    async start(controller) {
      const reader = stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed?.startsWith('data:')) continue;
            const data = trimmed.slice(5).trim();
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed?.stats && typeof parsed.stats === 'string') {
                try {
                  const s = JSON.parse(parsed.stats)?.stats?.models?.[0]?.stats;
                  if (s) { inputTokens = s.llm_input_token_length ?? 0; outputTokens = s.llm_output_token_length ?? 0; }
                } catch { /* ignore */ }
              }
              const content = parsed?.choices?.[0]?.delta?.content;
              if (content && typeof content === 'string') {
                contentBuffer += content;
                if (contentBuffer.includes('"model_output"') || contentBuffer.includes('"response_metadata"')) continue;
                controller.enqueue(encoder.encode(`0:${JSON.stringify(content)}\n`));
              }
            } catch { /* skip */ }
          }
        }

        // Flush buffered nested content
        if (contentBuffer.includes('"model_output"') || contentBuffer.includes('"response_metadata"')) {
          const extracted = extractNestedContent(contentBuffer);
          if (extracted) {
            for (let i = 0; i < extracted.length; i += 150) {
              controller.enqueue(encoder.encode(`0:${JSON.stringify(extracted.slice(i, i + 150))}\n`));
            }
          }
        }

        const total = inputTokens + outputTokens;
        controller.enqueue(encoder.encode(
          total > 0
            ? `e:{"finishReason":"stop","usage":{"promptTokens":${inputTokens},"completionTokens":${outputTokens}}}\n`
            : 'd:{"finishReason":"stop"}\n'
        ));
        controller.close();
      } catch (err) { controller.error(err); }
      finally { reader.releaseLock(); }
    },
  });
}

export async function POST(req: Request) {
  const {
    messages, model, complexity, customPrompt,
    temperature, maxTokens, topP,
    endpointUrl, endpointApiKey, endpointModel,
    endpointHeaders, endpointBodyFields, endpointAuthType, endpointSkipSsl,
  } = await req.json();

  const cleanMessages = messages.map((m: any) => ({ role: m.role, content: m.content }));

  const complexityMap: Record<number, string> = {
    1: 'Explain like I am 5 years old. Use simple words, short sentences, and fun analogies.',
    2: 'Explain like I am in middle school. Use everyday language with some basic terms.',
    3: 'Explain like I am in high school. Use some technical terms but keep it clear.',
    4: 'Explain like I am a college student. Use proper terminology and go into some depth.',
    5: 'Explain like I am an expert. Be precise, technical, and thorough.',
  };

  const systemPrompt = customPrompt
    ? customPrompt
    : `You are a helpful explainer bot.\n${complexityMap[complexity] ?? complexityMap[1]}\nAlways be concise and engaging.`;

  // ── Custom endpoint ─────────────────────────────────────────
  if (endpointUrl) {
    try {
      const fetchHeaders: Record<string, string> = { 'Content-Type': 'application/json' };

      if (endpointApiKey) {
        fetchHeaders[endpointAuthType === 'header' ? 'api-key' : 'Authorization'] =
          endpointAuthType === 'header' ? endpointApiKey : `Bearer ${endpointApiKey}`;
      }

      if (Array.isArray(endpointHeaders)) {
        endpointHeaders.forEach(({ key, value }: { key: string; value: string }) => {
          if (key?.trim()) fetchHeaders[key.trim()] = value;
        });
      }

      // ── Merge system prompt into first user message ─────────────
      // Many internal endpoints don't support the "system" role —
      // prepend system prompt to the first user message instead
      const messagesWithSystem = cleanMessages.map((m: any, i: number) => {
        if (i === 0 && m.role === 'user') {
          return { ...m, content: `${systemPrompt}\n\nUser: ${m.content}` };
        }
        return m;
      });

      const fetchBody: Record<string, any> = {
        model: endpointModel || 'default',
        messages: messagesWithSystem,
        stream: false,
      };

      if (Array.isArray(endpointBodyFields)) {
        endpointBodyFields.forEach(({ key, value }: { key: string; value: string }) => {
          if (key?.trim()) {
            // Strip accidental "Value: " placeholder prefix if present
            const cleanValue = (value ?? '').replace(/^Value:\s*/i, '').trim();
            try { fetchBody[key.trim()] = JSON.parse(cleanValue); }
            catch { fetchBody[key.trim()] = cleanValue; }
          }
        });
      }

      const baseUrl = endpointUrl.endsWith('/') ? endpointUrl.slice(0, -1) : endpointUrl;
      const fullUrl = `${baseUrl}/chat/completions`;
      const bodyStr = JSON.stringify(fetchBody);
      fetchHeaders['Content-Length'] = Buffer.byteLength(bodyStr).toString();

      log('POST', fullUrl);

      // ── Native https.request — bypasses Next.js/Turbopack fetch SSL issues ──
      const data: any = await new Promise((resolve, reject) => {
        const urlObj = new URL(fullUrl);
        const req = https.request({
          hostname: urlObj.hostname,
          port: urlObj.port || 443,
          path: urlObj.pathname + urlObj.search,
          method: 'POST',
          headers: fetchHeaders,
          rejectUnauthorized: !endpointSkipSsl, // skip SSL when checked
        }, (res) => {
          let raw = '';
          res.on('data', (chunk: Buffer) => raw += chunk.toString());
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 300)}`));
              return;
            }
            try { resolve(JSON.parse(raw)); }
            catch { reject(new Error(`Invalid JSON: ${raw.slice(0, 200)}`)); }
          });
        });
        req.on('error', reject);
        req.setTimeout(60000, () => req.destroy(new Error('Timeout 60s')));
        req.write(bodyStr);
        req.end();
      });

      const responseStream = convertNonStreamingToAISDK(data);
      return new Response(responseStream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Vercel-AI-Data-Stream': 'v1',
          'Cache-Control': 'no-cache',
        },
      });

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logError('Custom endpoint error:', msg);
      return new Response(
        JSON.stringify({ error: msg }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // ── Standard providers ───────────────────────────────────────
  const isGroq       = model.startsWith('llama') || model.startsWith('mixtral') || model.startsWith('gemma');
  const isGoogle     = model.startsWith('gemini');
  const isOpenRouter = model.includes('/');

  const modelInstance = model.startsWith('claude')
    ? anthropic(model)
    : isGroq       ? groq(model)
    : isGoogle     ? google(model)
    : isOpenRouter ? openrouter(model)
    : openai(model ?? 'gpt-4o-mini');

  // Anthropic: temperature max is 1.0, topP not supported alongside temperature
  // Google: temperature max is 2.0
  // OpenAI/Groq: temperature max is 2.0
  const isAnthropic = model.startsWith('claude');
  // OpenRouter passes params to underlying model — use conservative limits
  const isOpenRouterModel = model.includes('/');
  const safeTemp = temperature !== undefined
    ? Math.min(Number(temperature), isAnthropic ? 1.0 : 2.0)
    : undefined;

  try {
    const result = await streamText({
      model: modelInstance,
      system: systemPrompt,
      messages: cleanMessages,
      ...(safeTemp  !== undefined && { temperature: safeTemp }),
      ...(maxTokens !== undefined && { maxTokens: Number(maxTokens) }),
      ...(!isAnthropic && topP !== undefined && { topP: Number(topP) }),
    });
    return result.toDataStreamResponse(isGroq ? {} : { sendUsage: true });
  } catch (error) {
    logError('streamText error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
