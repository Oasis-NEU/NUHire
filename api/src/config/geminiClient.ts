// src/config/geminiClient.ts
//
// The GeminiClient that calls Google's Gemini API, through the Interactions
// endpoint. The screener's instructions go as the system instruction and the
// stripped resume as the input, so resume text never sits among the
// instructions. `store: false` asks Google not to keep the exchange for later
// retrieval.
//
// The key is read from GEMINI_API_KEY and nowhere else. Without it no client
// is made, and the error says which variable is missing.

import { GeminiClient } from './gemini';
import { StrippedText } from './contactInfo';
import { SCREENER_REPLY_SCHEMA } from './screenerPrompt';

export const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
export const GEMINI_MODEL = 'gemini-3.5-flash-lite';
// Pins the request and response format, so a new revision cannot change them
// under a running class.
const API_REVISION = '2026-05-20';
// A screen that hangs past this fails and is retried, rather than holding the
// row pending while a class waits.
export const GEMINI_TIMEOUT_MS = 30_000;

interface InteractionStep {
  type?: string;
  content?: { type?: string; text?: string }[];
}

interface Interaction {
  status?: string;
  steps?: InteractionStep[];
}

/** The model's text from a completed interaction. */
function outputText(body: Interaction): string {
  if (body.status !== 'completed') {
    throw new Error(`Gemini interaction ended ${body.status ?? 'without a status'}`);
  }
  const text = (body.steps ?? [])
    .filter((step) => step.type === 'model_output')
    .flatMap((step) => step.content ?? [])
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('');
  if (!text) throw new Error('Gemini returned no text');
  return text;
}

export function createGeminiClient(
  env: NodeJS.ProcessEnv = process.env,
  send: typeof fetch = fetch
): GeminiClient {
  const key = env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set, so no resume can be screened');

  return {
    generate: async (instructions: string, resume: StrippedText) => {
      const response = await send(GEMINI_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key,
          'Api-Revision': API_REVISION,
        },
        body: JSON.stringify({
          model: GEMINI_MODEL,
          system_instruction: instructions,
          input: resume.text,
          response_format: {
            type: 'text',
            mime_type: 'application/json',
            schema: SCREENER_REPLY_SCHEMA,
          },
          store: false,
        }),
        signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      });
      // The status only: an error body can echo the request, which holds the resume.
      if (!response.ok) throw new Error(`Gemini answered HTTP ${response.status}`);
      return outputText(((await response.json()) ?? {}) as Interaction);
    },
  };
}
