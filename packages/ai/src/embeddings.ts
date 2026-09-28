/** Embedding providers are swappable: the active model is a row in `embedding_models`. */
export interface EmbeddingProvider {
  readonly provider: string;
  readonly model: string;
  readonly dimensions: number;
  embed(texts: string[], kind: 'document' | 'query', signal?: AbortSignal): Promise<number[][]>;
}

/** Voyage AI (Anthropic's recommended embeddings partner). Batches of up to 128 inputs. */
export function createVoyageProvider(options: {
  apiKey: string;
  model?: string;
  dimensions?: number;
  fetchImpl?: typeof fetch;
}): EmbeddingProvider {
  const model = options.model ?? 'voyage-3.5';
  const dimensions = options.dimensions ?? 1024;
  const doFetch = options.fetchImpl ?? fetch;
  return {
    provider: 'voyage',
    model,
    dimensions,
    async embed(texts, kind, signal) {
      const vectors: number[][] = [];
      for (let i = 0; i < texts.length; i += 128) {
        const res = await doFetch('https://api.voyageai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            input: texts.slice(i, i + 128),
            model,
            input_type: kind,
            output_dimension: dimensions,
          }),
          ...(signal ? { signal } : {}),
        });
        if (!res.ok)
          throw new Error(
            `voyage embeddings failed: ${res.status} ${await res.text().catch(() => '')}`,
          );
        const body = (await res.json()) as { data: { embedding: number[]; index: number }[] };
        vectors.push(...[...body.data].sort((a, b) => a.index - b.index).map((d) => d.embedding));
      }
      return vectors;
    },
  };
}
