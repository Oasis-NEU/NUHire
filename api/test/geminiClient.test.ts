import { describe, expect, it, vi } from 'vitest';
import { stripContactInfo } from '../src/config/contactInfo';
import { createGeminiClient, GEMINI_MODEL, GEMINI_URL } from '../src/config/geminiClient';
import { SCREENER_REPLY_SCHEMA } from '../src/config/screenerPrompt';

// fetch is mocked: nothing here reaches Google.

const ENV = { GEMINI_API_KEY: 'test-key' };
const RESUME = stripContactInfo('Jordan Rivera\njordan@example.com\nBuilt APIs.', [
  'Jordan',
  'Rivera',
]);

const completed = (text: string) => ({
  status: 'completed',
  steps: [
    { type: 'user_input', content: [{ type: 'text', text: 'echo of the input' }] },
    { type: 'model_output', content: [{ type: 'text', text }] },
  ],
});

function withResponse(body: unknown, status = 200) {
  const send = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));
  return { client: createGeminiClient(ENV, send), send };
}

describe('createGeminiClient', () => {
  it('takes the key from GEMINI_API_KEY only, and says so when it is missing', () => {
    expect(() => createGeminiClient({}, vi.fn())).toThrow('GEMINI_API_KEY is not set');
    expect(() => createGeminiClient({ GEMINI_API_KEY: '' }, vi.fn())).toThrow(
      'GEMINI_API_KEY is not set'
    );
  });

  it('sends the instructions as the system instruction and only the stripped resume as input', async () => {
    const { client, send } = withResponse(completed('{}'));
    await client.generate('Screen this resume.', RESUME);

    const [url, init] = send.mock.calls[0];
    expect(url).toBe(GEMINI_URL);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ 'x-goog-api-key': 'test-key' });
    expect(JSON.parse(String(init?.body))).toEqual({
      model: GEMINI_MODEL,
      system_instruction: 'Screen this resume.',
      input: RESUME.text,
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: SCREENER_REPLY_SCHEMA,
      },
      store: false,
    });
    expect(String(init?.body)).not.toContain('jordan@example.com');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns the model's text from a completed interaction", async () => {
    const { client } = withResponse(completed('{"strengths":[]}'));
    expect(await client.generate('x', RESUME)).toBe('{"strengths":[]}');
  });

  it('throws on an HTTP error, with the status and not the body', async () => {
    const { client } = withResponse({ error: { message: 'echoing Built APIs.' } }, 429);
    const failure = client.generate('x', RESUME);
    await expect(failure).rejects.toThrow('Gemini answered HTTP 429');
    await expect(failure).rejects.not.toThrow('Built APIs');
  });

  it('throws when the interaction did not complete or holds no text', async () => {
    await expect(withResponse({ status: 'failed' }).client.generate('x', RESUME)).rejects.toThrow(
      'Gemini interaction ended failed'
    );
    await expect(withResponse(null).client.generate('x', RESUME)).rejects.toThrow(
      'without a status'
    );
    await expect(
      withResponse({ status: 'completed', steps: [] }).client.generate('x', RESUME)
    ).rejects.toThrow('Gemini returned no text');
  });
});
