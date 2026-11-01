export type Mask = { off: number[]; exceptions: number[] };
export type View = { start: number; end: number; width: number };
export type Request =
  | { type: 'load'; session: number; pcm: Float32Array[] }
  | { type: 'render'; session: number; request: number; view: View }
  | { type: 'reconstruct'; session: number; request: number; mask: Mask };
export type Response =
  | { type: 'ready'; session: number; n: number; m: number; max: number }
  | { type: 'bins'; session: number; request: number; values: Float32Array; view: View }
  | { type: 'audio'; session: number; request: number; pcm: Float32Array[]; gain: number }
  | { type: 'error'; session: number; message: string };
export function current(session: number, request: number, response: { session: number; request: number }) {
  return session === response.session && request === response.request;
}
