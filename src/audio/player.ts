export class Player {
  private context?: AudioContext;
  private source?: AudioBufferSourceNode;
  private generation=0;
  active: 'original'|'result'|null=null;
  onChange=()=>{};
  get ctx() { return this.context??=new AudioContext(); }
  stop() {
    ++this.generation;
    if(this.source) { this.source.onended=null; this.source.stop(); this.source.disconnect(); this.source=undefined; }
    this.active=null; this.onChange();
  }
  async play(buffer: AudioBuffer, kind: 'original'|'result') {
    const same=this.active===kind;
    this.stop(); if(same) return;
    const generation=this.generation;
    await this.ctx.resume();
    if(generation!==this.generation) return;
    const node=this.ctx.createBufferSource(); node.buffer=buffer; node.connect(this.ctx.destination);
    this.source=node; this.active=kind;
    node.onended=()=>{ if(this.source===node) { node.disconnect(); this.source=undefined; this.active=null; this.onChange(); } };
    node.start(); this.onChange();
  }
  buffer(pcm: Float32Array[], rate: number) {
    const buffer=this.ctx.createBuffer(pcm.length,pcm[0].length,rate);
    pcm.forEach((x,i)=>buffer.copyToChannel(x as Float32Array<ArrayBuffer>,i));
    return buffer;
  }
}
