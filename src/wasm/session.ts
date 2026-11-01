import create from '../generated/haar/haar.js';
import wasmUrl from '../generated/haar/haar.wasm?url';
export interface Module {
  HEAPU8: Uint8Array; HEAPU32: Uint32Array; HEAPF32: Float32Array;
  _malloc(n:number):number; _free(p:number):void; UTF8ToString(p:number):string;
  _haar_max():number; _haar_error():number; _haar_clear():void;
  _haar_load(l:number,r:number,n:number,c:number):number;
  _haar_reconstruct(off:number,rows:number,ex:number,count:number):number;
  _haar_channel(i:number):number;
  _haar_bins(start:number,end:number,width:number):number;
}
export const initialized: Promise<Module> = create({locateFile:()=>wasmUrl});
export class Session {
  m: number; n: number; channels: number;
  constructor(private module:Module,left:Float32Array,right:Float32Array) {
    this.n=left.length;this.channels=right.length?2:1;
    const pointers:number[]=[];
    try {
      const l=this.copy(left,pointers),r=right.length?this.copy(right,pointers):0;
      this.m=module._haar_load(l,r,this.n,this.channels);
      if(!this.m) throw this.error();
    } finally { pointers.forEach(p=>module._free(p)); }
  }
  private error() { return new Error(this.module.UTF8ToString(this.module._haar_error())); }
  private copy(array:Float32Array|Uint8Array|Uint32Array,owned:number[]) {
    if(!array.byteLength) return 0;
    const p=this.module._malloc(array.byteLength);if(!p) throw new Error('Недостаточно памяти; выберите более короткий файл.');
    owned.push(p);
    // Read HEAP after malloc: memory growth invalidates previous views.
    this.module.HEAPU8.set(new Uint8Array(array.buffer,array.byteOffset,array.byteLength),p);return p;
  }
  free() {this.module._haar_clear();}
  padded_length() {return this.m;}
  render_bins(start:number,end:number,width:number) {
    const p=this.module._haar_bins(start,end,width);if(!p)throw this.error();
    return this.module.HEAPF32.slice(p/4,p/4+(Math.log2(this.m)+1)*width);
  }
  reconstruct(off:Uint8Array,ex:Uint32Array) {
    const owned:number[]=[];
    try {
      const a=this.copy(off,owned),b=this.copy(ex,owned);
      const gain=this.module._haar_reconstruct(a,off.length,b,ex.length);if(gain<0)throw this.error();return gain;
    } finally {owned.forEach(p=>this.module._free(p));}
  }
  take_channel(index:number) { const p=this.module._haar_channel(index);return this.module.HEAPF32.slice(p/4,p/4+this.n); }
}
