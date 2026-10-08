import { createHash, randomUUID } from 'node:crypto';
import { getComplianceHeaders, getJsonLdSchema } from '../core/marking';

export interface WrapOpenAIOptions {
  clientId?: string;
  complianceVersion?: string;
  ledgerEndpoint?: string;
  includeHeadersInResponse?: boolean;
  now?: () => Date;
  fetchImpl?: typeof fetch;
}

function fireAndForget(task: () => void | Promise<void>): void {
  queueMicrotask(() => {
    try {
      const result = task();
      if (result && typeof (result as Promise<void>).catch === 'function') {
        void (result as Promise<void>).catch(() => undefined);
      }
    } catch {
      // swallow all errors to avoid impacting user flow
    }
  });
}

function extractOutputText(response: unknown): string {
  const choices = (response as { choices?: Array<{ message?: { content?: unknown } }> })
    ?.choices;

  const content = choices?.[0]?.message?.content;

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) {
          const text = (part as { text?: unknown }).text;
          return typeof text === 'string' ? text : '';
        }
        return '';
      })
      .join('');
  }

  return JSON.stringify(response ?? '');
}

export function wrapOpenAI<T extends Record<string, any>>(
  openaiClient: T,
  options: WrapOpenAIOptions = {}
): T {
  const originalCreate = openaiClient?.chat?.completions?.create;

  if (typeof originalCreate !== 'function') {
    throw new Error('wrapOpenAI expected openai.chat.completions.create to be a function.');
  }

  const ledgerEndpoint =
    options.ledgerEndpoint ?? 'https://verify.clausekit.com/api/v1/log';
  const complianceVersion = options.complianceVersion ?? '1.0.0';
  const clientId = options.clientId ?? 'unknown_client';
  const fetchImpl = options.fetchImpl ?? globalThis.fetch?.bind(globalThis);

  const wrappedCreate = async (...args: unknown[]) => {
    const response = await originalCreate(...args);
    const outputText = extractOutputText(response);
    const normalizedOutputText = outputText.normalize('NFC');
    const sha256Hash = createHash('sha256').update(normalizedOutputText, 'utf8').digest('hex');
    const verificationId = `ck_live_${randomUUID().replaceAll('-', '').slice(0, 24)}`;
    const timestamp = (options.now?.() ?? new Date()).toISOString();

    const complianceJsonLd = getJsonLdSchema(verificationId, timestamp);
    const complianceHeaders = getComplianceHeaders(sha256Hash, verificationId);

    fireAndForget(async () => {
      if (!fetchImpl) return;

      await fetchImpl(ledgerEndpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          client_id: clientId,
          sha256_hash: sha256Hash,
          model: (response as { model?: string })?.model ?? 'unknown_model',
          timestamp,
          compliance_version: complianceVersion
        })
      });
    });

    if (response && typeof response === 'object') {
      const enhancedResponse = { ...response } as Record<string, unknown>;
      enhancedResponse._compliance = complianceJsonLd;

      if (options.includeHeadersInResponse !== false) {
        enhancedResponse._compliance_headers = complianceHeaders;
      }

      enhancedResponse._compliance_sha256 = sha256Hash;
      return enhancedResponse;
    }

    return {
      data: response,
      _compliance: complianceJsonLd,
      _compliance_headers: complianceHeaders,
      _compliance_sha256: sha256Hash
    };
  };

  return {
    ...openaiClient,
    chat: {
      ...openaiClient.chat,
      completions: {
        ...openaiClient.chat.completions,
        create: wrappedCreate
      }
    }
  } as T;
}
