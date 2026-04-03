// app/api/kserve/route.ts
// Handles KServe v2 inference API calls

const DEBUG = false;
const log = (...args: any[]) => DEBUG && console.log(...args);
const logError = (...args: any[]) => DEBUG && console.error(...args);

// Recursively extract the clean text response from nested JSON structures
function extractText(obj: any): string {
  if (typeof obj === 'string') return obj;
  if (typeof obj !== 'object' || obj === null) return String(obj);

  // Direct model_output field (e.g. {"model_output": "..."})
  if (obj.model_output !== undefined) return extractText(obj.model_output);

  // Wrapped in response field (e.g. {"response": "{\"model_output\": \"...\"}"})
  if (obj.response !== undefined) {
    try { return extractText(JSON.parse(obj.response)); } catch { return String(obj.response); }
  }

  // Answer field (question_answering)
  if (obj.answer !== undefined) {
    try { return extractText(JSON.parse(obj.answer)); } catch { return String(obj.answer); }
  }

  // Summary field (summarization, kbgen)
  if (obj.summary !== undefined) return String(obj.summary);

  // Code field (code_assist)
  if (obj.code !== undefined) return String(obj.code);

  // Flow field (text2flow)
  if (obj.flow !== undefined) {
    return typeof obj.flow === 'string' ? obj.flow : JSON.stringify(obj.flow, null, 2);
  }

  // Fallback — pretty print the whole object
  return JSON.stringify(obj, null, 2);
}

export async function POST(req: Request) {
  const {
    endpointUrl,
    endpointApiKey,
    endpointAuthType,
    endpointSkipSsl,
    endpointHeaders,
    kserveModel,
    kserveTemplate,
    kserveOutputField,
    query,
  } = await req.json();

  if (!endpointUrl || !kserveTemplate || !query) {
    return new Response(
      JSON.stringify({ error: 'endpointUrl, kserveTemplate, and query are required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const timestamp = Date.now().toString();
    const escapedQuery = query
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');

    const filledTemplate = kserveTemplate
      .replace(/\{\{query\}\}/g, escapedQuery)
      .replace(/\{\{timestamp\}\}/g, timestamp);

    let requestBody: any;
    try {
      requestBody = JSON.parse(filledTemplate);
    } catch (e) {
      return new Response(
        JSON.stringify({ error: `Invalid JSON template: ${String(e)}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Build headers
    const fetchHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (endpointApiKey) {
      if (endpointAuthType === 'header') {
        fetchHeaders['api-key'] = endpointApiKey;
      } else {
        fetchHeaders['Authorization'] = `Bearer ${endpointApiKey}`;
      }
    }

    if (endpointHeaders && Array.isArray(endpointHeaders)) {
      endpointHeaders.forEach(({ key, value }: { key: string; value: string }) => {
        if (key.trim()) fetchHeaders[key.trim()] = value;
      });
    }

    const baseUrl = endpointUrl.endsWith('/')
      ? endpointUrl.slice(0, -1)
      : endpointUrl.endsWith('/v1')
      ? endpointUrl.slice(0, -3)   // strip /v1 — KServe uses /v2/models/... directly
      : endpointUrl;
    const inferUrl = `${baseUrl}/v2/models/${kserveModel}/infer`;

    log('KServe infer URL:', inferUrl);
    log('KServe request body:', JSON.stringify(requestBody, null, 2));

    if (endpointSkipSsl) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    let response: Response;
    const startTime = Date.now();
    try {
      response = await fetch(inferUrl, {
        method: 'POST',
        headers: fetchHeaders,
        body: JSON.stringify(requestBody),
      });
    } finally {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
    }

    const elapsed = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      logError('KServe error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: `Endpoint returned ${response.status}: ${errorText}` }),
        { status: response.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    log('KServe raw response:', JSON.stringify(data, null, 2));

    // Extract output from KServe v2 response
    // Format: { outputs: [{ name: "response", data: ["..."] }] }
    const outputs = data.outputs || [];
    let responseText = '';

    if (outputs.length > 0) {
      // Find the target output field, fallback to first output
      const targetOutput = kserveOutputField
        ? outputs.find((o: any) => o.name === kserveOutputField) || outputs[0]
        : outputs[0];

      const rawData = targetOutput?.data?.[0] ?? '';

      // Try to parse as JSON and extract clean text
      try {
        const parsed = JSON.parse(rawData);
        responseText = extractText(parsed);
      } catch {
        // Not JSON — use raw string directly
        responseText = rawData;
      }
    } else {
      responseText = JSON.stringify(data, null, 2);
    }

    // Return as AI SDK data stream format
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`0:${JSON.stringify(responseText)}\n`));
        controller.enqueue(encoder.encode(`d:{"finishReason":"stop"}\n`));
        controller.close();
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Vercel-AI-Data-Stream': 'v1',
        'X-Response-Time': elapsed.toString(),
        'Cache-Control': 'no-cache',
      },
    });

  } catch (error) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
    logError('KServe fetch error:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
