declare module 'mammoth' {
  export function extractRawText(options: { arrayBuffer?: ArrayBuffer; buffer?: Buffer }): Promise<{ value: string; messages: unknown[] }>;
}
