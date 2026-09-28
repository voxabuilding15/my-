import { createSseParser } from '../sse';

describe('createSseParser', () => {
  it('parses events split across chunks', () => {
    const parse = createSseParser();
    expect(
      parse('data: {"type":"start","model":"m","cached":false,"remaining":3}\n\ndata: {"type":"te'),
    ).toEqual([{ type: 'start', model: 'm', cached: false, remaining: 3 }]);
    expect(parse('xt","text":"Hi"}\n\n')).toEqual([{ type: 'text', text: 'Hi' }]);
  });

  it('handles CRLF line endings and ignores non-data lines', () => {
    const parse = createSseParser();
    expect(parse(': keep-alive\r\n\r\ndata: {"type":"text","text":"ok"}\r\n\r\n')).toEqual([
      { type: 'text', text: 'ok' },
    ]);
  });
});
