import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { getComplianceHeaders, getJsonLdSchema } from '../src/core/marking';
import { wrapOpenAI } from '../src/wrappers/openai';

interface LedgerEntry {
  client_id: string;
  sha256_hash: string;
  model: string;
  timestamp: string;
  compliance_version: string;
}

interface VectorCase {
  id: string;
  output_text: string;
  equivalent_output_text_nfc?: string;
  verification_id: string;
  prev_hash: string;
  include_headers_in_response: boolean;
  ledger_entry: LedgerEntry;
  expected_headers: Record<string, string>;
  expected_jsonld: Record<string, unknown>;
  expected_entry_sha256: string;
}

interface TestVectorsFile {
  spec_version: string;
  vectors: VectorCase[];
}

function readJsonFile<T>(fileName: string): T {
  const fullPath = path.join(process.cwd(), 'spec', fileName);
  return JSON.parse(readFileSync(fullPath, 'utf8')) as T;
}

function outputSha256(text: string): string {
  return createHash('sha256').update(text.normalize('NFC'), 'utf8').digest('hex');
}

function serializeField(value: string): string {
  const normalized = value.normalize('NFC');
  return `${Buffer.byteLength(normalized, 'utf8')}:${normalized}`;
}

function ledgerEntrySha256(prevHash: string, entry: LedgerEntry): string {
  const preimage = [
    prevHash,
    entry.client_id,
    entry.sha256_hash,
    entry.model,
    entry.timestamp,
    entry.compliance_version
  ]
    .map(serializeField)
    .join('');

  return createHash('sha256').update(preimage, 'utf8').digest('hex');
}

async function validateWrapperIncludeHeadersSemantics(vectors: VectorCase[]): Promise<void> {
  for (const vector of vectors) {
    const capturedBodies: LedgerEntry[] = [];

    const mockOpenAI = {
      chat: {
        completions: {
          create: async () => ({
            model: vector.ledger_entry.model,
            choices: [{ message: { content: vector.output_text } }]
          })
        }
      }
    };

    const wrapped = wrapOpenAI(mockOpenAI, {
      clientId: vector.ledger_entry.client_id,
      complianceVersion: vector.ledger_entry.compliance_version,
      includeHeadersInResponse: vector.include_headers_in_response,
      now: () => new Date(vector.ledger_entry.timestamp),
      fetchImpl: async (_url: string | URL | Request, init?: RequestInit) => {
        if (init?.body && typeof init.body === 'string') {
          capturedBodies.push(JSON.parse(init.body) as LedgerEntry);
        }
        return new Response('{}', { status: 200 });
      }
    });

    const result = (await wrapped.chat.completions.create()) as Record<string, unknown>;
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(result._compliance_sha256, vector.ledger_entry.sha256_hash, `${vector.id}: _compliance_sha256 mismatch`);

    if (vector.include_headers_in_response) {
      assert.ok(result._compliance_headers, `${vector.id}: expected _compliance_headers`);
    } else {
      assert.equal(
        Object.prototype.hasOwnProperty.call(result, '_compliance_headers'),
        false,
        `${vector.id}: _compliance_headers should be omitted`
      );
    }

    assert.equal(capturedBodies.length, 1, `${vector.id}: expected exactly one ledger POST`);
    assert.deepEqual(capturedBodies[0], vector.ledger_entry, `${vector.id}: ledger payload mismatch`);
  }
}

async function main(): Promise<void> {
  const schema = readJsonFile<Record<string, unknown>>('ledger-entry.schema.json');
  const vectors = readJsonFile<TestVectorsFile>('test-vectors.json');

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(vectors.spec_version, 'spec-v1.0.0');

  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  for (const vector of vectors.vectors) {
    assert.equal(outputSha256(vector.output_text), vector.ledger_entry.sha256_hash, `${vector.id}: output hash mismatch`);

    if (vector.equivalent_output_text_nfc) {
      assert.equal(
        outputSha256(vector.equivalent_output_text_nfc),
        vector.ledger_entry.sha256_hash,
        `${vector.id}: NFC-equivalent text hash mismatch`
      );
    }

    assert.equal(
      ledgerEntrySha256(vector.prev_hash, vector.ledger_entry),
      vector.expected_entry_sha256,
      `${vector.id}: ledger entry hash mismatch`
    );

    assert.deepEqual(
      getComplianceHeaders(vector.ledger_entry.sha256_hash, vector.verification_id),
      vector.expected_headers,
      `${vector.id}: compliance headers mismatch`
    );

    assert.deepEqual(
      getJsonLdSchema(vector.verification_id, vector.ledger_entry.timestamp),
      vector.expected_jsonld,
      `${vector.id}: jsonld mismatch`
    );

    const isValid = validate(vector.ledger_entry);
    assert.equal(isValid, true, `${vector.id}: schema validation failed: ${JSON.stringify(validate.errors)}`);
  }

  await validateWrapperIncludeHeadersSemantics(vectors.vectors);
  console.log('Spec contract validation passed.');
}

void main();
