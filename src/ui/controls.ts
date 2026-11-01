import type { Mask } from '../shared/protocol';
export function range(row: number): [number, number] { return row === 0 ? [0,1] : [2 ** (row-1), 2 ** row]; }
export function prefix(rows: number, q: number): Mask { return { off: Array.from({length:rows},(_,r)=>Number(r<q)), exceptions: [] }; }
export function toggleRow(mask: Mask, row: number) {
  mask.off[row] ^= 1;
  const [lo,hi] = range(row);
  mask.exceptions = mask.exceptions.filter(k=>k<lo||k>=hi);
}
export function toggleCell(mask: Mask, index: number) {
  const i = mask.exceptions.indexOf(index);
  if (i < 0) mask.exceptions.push(index); else mask.exceptions.splice(i,1);
}
export function countOff(mask: Mask) {
  let count = mask.off.reduce((n,off,row)=>n+off*(range(row)[1]-range(row)[0]),0);
  for (const k of mask.exceptions) count += mask.off[k === 0 ? 0 : Math.floor(Math.log2(k))+1] ? -1 : 1;
  return count;
}
export function cutoff(q: number, j: number, rate: number) { return q<2 ? 0 : rate / 2 ** (j+2-q); }
export function nearestQ(hz: number, j: number, rate: number) {
  let best=2;
  for(let q=2;q<=j+1;q++) if(Math.abs(cutoff(q,j,rate)-hz)<Math.abs(cutoff(best,j,rate)-hz)) best=q;
  return Math.min(best,j+1);
}
export function hitCell(row: number, x: number, view: {start:number;end:number;width:number}, m: number, n: number) {
  const [lo,hi] = range(row), support=m/(hi-lo);
  const sample = view.start + x/view.width*(view.end-view.start);
  const k = Math.floor(sample/support);
  const visible = Math.min((k+1)*support,view.end,n)-Math.max(k*support,view.start);
  return x>=0 && x<view.width && visible/(view.end-view.start)*view.width>=8 ? lo+k : null;
}
