import { initialized, Session } from '../wasm/session';
import type { Request, Response } from '../shared/protocol';
let session: Session | undefined;
let id = -1, channels = 0;
function send(message: Response, transfer: Transferable[] = []) { self.postMessage(message, { transfer }); }
// Serialize initialization too: requests may arrive before the WASM fetch finishes.
let chain = Promise.resolve();
self.onmessage = (event: MessageEvent<Request>) => {
  const message=event.data;
  chain=chain.then(async()=> {
    try {
      const module=await initialized;
      if(message.type==='load') {
        session?.free(); session=undefined; id=message.session;
        channels=message.pcm.length;
        if(message.pcm.some(c=>!(c instanceof Float32Array)||c.length!==message.pcm[0].length)) throw new Error('Некорректные PCM-каналы');
        if(channels<1 || channels>2 || message.pcm[0].length>module._haar_max()) throw new Error('Допустимо моно/стерео до 2^23 отсчётов на канал.');
        session=new Session(module,message.pcm[0],message.pcm[1]??new Float32Array());
        send({type:'ready',session:id,n:message.pcm[0].length,m:session.padded_length(),max:module._haar_max()});
      } else if(message.session===id && session) {
        if(message.type==='render') {
          const {start,end,width}=message.view;
          const values=session.render_bins(start,end,width);
          send({type:'bins',session:id,request:message.request,values,view:message.view},[values.buffer]);
        } else {
          const gain=session.reconstruct(new Uint8Array(message.mask.off),new Uint32Array(message.mask.exceptions));
          const pcm=Array.from({length:channels},(_,i)=>session!.take_channel(i));
          send({type:'audio',session:id,request:message.request,pcm,gain},pcm.map(c=>c.buffer));
        }
      }
    } catch(error) { send({type:'error',session:message.session,message:String(error)}); }
  });
};
