import type { AiStreamEvent } from '@studexa/shared';

/**
 * Incremental parser for server-sent events: feed it decoded chunks (which may split events
 * anywhere) and it returns every complete `data:` event.
 */
export function createSseParser() {
  let buffer = '';
  return (chunk: string): AiStreamEvent[] => {
    buffer += chunk.replace(/\r\n/g, '\n');
    const events: AiStreamEvent[] = [];
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const raw = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = raw
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (data) events.push(JSON.parse(data) as AiStreamEvent);
      boundary = buffer.indexOf('\n\n');
    }
    return events;
  };
}
