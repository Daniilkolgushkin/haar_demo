import type { Mask, View } from '../shared/protocol';
import { hitCell, range } from './controls';
export const LEFT=105, TOP=14, ROW=27;
export class Plot {
  n=1; m=1; rate=1; rows=1;
  view: View={start:0,end:1,width:1};
  mask: Mask={off:[0],exceptions:[]};
  values?: Float32Array;
  reference=1;
  constructor(public canvas: HTMLCanvasElement) {}
  configure(n: number,m: number,rate: number) { this.n=n;this.m=m;this.rate=rate;this.rows=Math.log2(m)+1; this.values=undefined; }
  setBins(values: Float32Array) {
    this.values=values;
    // Establish a stable detail reference at full view; zoom and masks keep it.
    if(this.view.start===0 && this.view.end===this.n) {
      const details=Array.from(values.slice(this.view.width)).filter(x=>x>0).sort((a,b)=>a-b);
      this.reference=details[Math.floor(details.length*.99)] || Math.max(...values.slice(0,this.view.width),1e-9);
    }
    this.draw();
  }
  draw() {
    const c=this.canvas, w=this.view.width+LEFT+12, h=TOP+this.rows*ROW+45, dpr=window.devicePixelRatio||1;
    c.width=Math.round(w*dpr); c.height=Math.round(h*dpr); c.style.height=`${h}px`;
    const ctx=c.getContext('2d')!; ctx.scale(dpr,dpr); ctx.fillStyle='rgba(255,255,255,.66)';ctx.fillRect(0,0,w,h);
    ctx.font='12px system-ui';
    const {start,end,width}=this.view;
    for(let row=0;row<this.rows;row++) {
      const y=TOP+row*ROW, [lo,hi]=range(row), support=this.m/(hi-lo);
      for(let x=0;x<width;x++) {
        const v=this.values?.[row*width+x]??0;
        const intensity=Math.min(1,Math.log1p(12*v/this.reference)/Math.log(13));
        ctx.fillStyle=`rgb(${Math.round(245-137*intensity)} ${Math.round(239-190*intensity)} ${Math.round(251-74*intensity)})`;
        ctx.fillRect(LEFT+x,y,1,ROW);
      }
      // Overlay only, never modifies the underlying coefficient raster.
      if(this.mask.off[row]) { ctx.fillStyle='rgba(243,152,50,.65)';ctx.fillRect(LEFT,y,width,ROW); }
      for(const k of this.mask.exceptions) {
        if(k<lo||k>=hi) continue;
        const a=Math.max(start,(k-lo)*support), b=Math.min(end,(k-lo+1)*support,this.n);
        if(b<=a) continue;
        const x=(a-start)/(end-start)*width, length=(b-a)/(end-start)*width;
        if(this.mask.off[row]) {
          ctx.save();ctx.beginPath();ctx.rect(LEFT+x,y,length,ROW);ctx.clip();
          for(let p=Math.floor(x);p<Math.ceil(x+length);p++) {
            const intensity=Math.min(1,Math.log1p(12*(this.values?.[row*width+p]??0)/this.reference)/Math.log(13));
            ctx.fillStyle=`rgb(${Math.round(245-137*intensity)} ${Math.round(239-190*intensity)} ${Math.round(251-74*intensity)})`;
            ctx.fillRect(LEFT+p,y,1,ROW);
          } ctx.restore();
        } else { ctx.fillStyle='rgba(243,152,50,.65)';ctx.fillRect(LEFT+x,y,length,ROW); }
      }
      ctx.strokeStyle='#181619';ctx.lineWidth=.5;
      ctx.beginPath();ctx.moveTo(LEFT,y);ctx.lineTo(LEFT+width,y);ctx.stroke();
      if(support/(end-start)*width>=8) {
        for(let k=Math.ceil(start/support);k*support<end;k++) { const x=LEFT+(k*support-start)/(end-start)*width;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+ROW);ctx.stroke(); }
      }
      const j=Math.log2(this.m)-(row===0?0:row-1);
      ctx.fillStyle='#181619';ctx.fillText(`${this.mask.off[row]?'× ':' '}${row===0?'A':'D'}${j}`,5,y+12);
      ctx.font='10px system-ui';ctx.fillText(row===0?'DC':`≈ ${(this.rate/2**j).toPrecision(3)} Гц`,5,y+24);ctx.font='12px system-ui';
    }
    const bottom=TOP+this.rows*ROW;
    ctx.strokeRect(LEFT,TOP,width,this.rows*ROW);
    const ticks=Math.max(1,Math.min(4,Math.floor(width/110)));
    for(let i=0;i<=ticks;i++) { const x=LEFT+i*width/ticks;ctx.textAlign=i===ticks?'right':i===0?'left':'center';ctx.fillText(`${((start+(end-start)*i/ticks)/this.rate).toFixed(3)} с`,x,bottom+22); }
    ctx.textAlign='left';
  }
  hit(x:number,y:number) {
    const row=Math.floor((y-TOP)/ROW);
    if(row<0||row>=this.rows) return null;
    return {row,index:x<LEFT?undefined:hitCell(row,x-LEFT,this.view,this.m,this.n)};
  }
}
