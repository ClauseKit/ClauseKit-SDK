const DIGITAL_SOURCE_TYPE =
  'https://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia';

export async function stampC2PA(
  imageBuffer: Buffer,
  metadata: Record<string, unknown>
): Promise<Buffer> {
  const c2paNode = (await import('@contentauth/c2pa-node')) as Record<string, unknown>;

  const manifest = {
    assertions: [
      {
        label: 'stds.schema-org.CreativeWork',
        data: {
          '@context': 'https://schema.org',
          '@type': 'DigitalDocument',
          digitalSourceType: DIGITAL_SOURCE_TYPE,
          ...metadata
        }
      }
    ]
  };

  const stamp = c2paNode.stamp as
    | ((buffer: Buffer, manifestInput: unknown) => Promise<Buffer>)
    | undefined;

  if (typeof stamp === 'function') {
    return stamp(imageBuffer, manifest);
  }

  throw new Error(
    'Unable to stamp C2PA metadata: @contentauth/c2pa-node stamp API unavailable.'
  );
}
