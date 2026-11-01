import {test,expect} from '@playwright/test';
function wav(channels=2,n=4097,dc=false) {
  const b=Buffer.alloc(44+n*channels*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(channels,22);b.writeUInt32LE(48000,24);b.writeUInt32LE(48000*channels*2,28);b.writeUInt16LE(channels*2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*channels*2,40);
  for(let i=0;i<n;i++)for(let c=0;c<channels;c++) b.writeInt16LE(Math.round(8000*(dc?1:Math.sin(2*Math.PI*(c?1000:40)*i/48000))),44+(i*channels+c)*2);return b;
}
test('production upload, real WASM, masks, zoom, playback, reset and replacement',async({page})=>{
  const failures:string[]=[];page.on('pageerror',e=>failures.push(String(e)));
  page.on('response',r=>{if(r.status()>=400)failures.push(`${r.status()} ${r.url()}`);});
  const wasm=page.waitForResponse(r=>r.url().includes('.wasm')&&r.status()===200);
  await page.goto('./');await page.locator('#file').setInputFiles({name:'stereo.wav',mimeType:'audio/wav',buffer:wav()});
  await wasm;await expect(page.locator('#status')).toHaveText('Готово');await expect(page.locator('#metadata')).toContainText('2 кан.');
  await expect(page.locator('#result')).toBeEnabled();
  await page.locator('#cutoff').fill('3');await expect(page.locator('#status')).toHaveText('Готово');
  await expect(page.locator('#counts')).toContainText('Выключено: 4');
  const orange=await page.locator('canvas').evaluate((canvas:HTMLCanvasElement)=>{const ctx=canvas.getContext('2d')!;const dpr=devicePixelRatio;return Array.from(ctx.getImageData(150*dpr,20*dpr,1,1).data);});
  expect(orange[0]).toBeGreaterThan(orange[2]);
  await page.locator('#zoom-in').click();await expect(page.locator('#zoom-label')).toHaveText('2×');
  await page.locator('#pan').fill('700');await page.locator('#toggle-row').click();await expect(page.locator('#cutoff-label')).toHaveText('Выборочно');
  await page.locator('#result').click();await page.locator('#original').click();
  for(const value of ['4','1','6','0'])await page.locator('#cutoff').fill(value);
  await expect(page.locator('#status')).toHaveText('Готово');await expect(page.locator('#counts')).toContainText('Выключено: 0');
  await page.locator('#file').setInputFiles({name:'mono.wav',mimeType:'audio/wav',buffer:wav(1,96000,true)});
  await expect(page.locator('#status')).toHaveText('Готово');await expect(page.locator('#metadata')).toContainText('1 кан.');
  await page.locator('#result').click();await expect(page.locator('#result')).toHaveText('■ Стоп реконструкция');
  await page.locator('#original').click();await expect(page.locator('#original')).toHaveText('■ Стоп оригинал');await expect(page.locator('#result')).toHaveText('▶ Реконструкция');
  await page.locator('#reset').click();await expect(page.locator('#status')).toHaveText('Готово');
  await page.screenshot({path:'.tools/screenshots/desktop.png',fullPage:true});
  await page.setViewportSize({width:320,height:800});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await expect.poll(()=>page.locator('canvas').evaluate((c:HTMLCanvasElement)=>Math.abs(c.width/devicePixelRatio-c.clientWidth))).toBeLessThan(2);
  await page.screenshot({path:'.tools/screenshots/mobile.png',fullPage:true});
  expect(failures).toEqual([]);
});
test('invalid files and quick file replacement',async({page})=>{
  await page.goto('./');await page.locator('#file').setInputFiles({name:'broken.wav',mimeType:'audio/wav',buffer:Buffer.from('invalid')});
  await expect(page.locator('#status')).toContainText('Ошибка');await expect(page.locator('#result')).toBeDisabled();
  await page.locator('#file').setInputFiles({name:'first.wav',mimeType:'audio/wav',buffer:wav(2,48000)});
  await page.locator('#file').setInputFiles({name:'last.wav',mimeType:'audio/wav',buffer:wav(1)});
  await expect(page.locator('#status')).toHaveText('Готово');await expect(page.locator('#metadata')).toContainText('last.wav');
});
test('worker WASM PCM roundtrip, stereo masks, all-off silence and immutable original',async({page})=>{
  let workerUrl='';page.on('request',r=>{if(r.url().includes('dsp.worker-'))workerUrl=r.url();});
  await page.goto('./');await page.locator('#file').setInputFiles({name:'small.wav',mimeType:'audio/wav',buffer:wav(1)});
  await expect(page.locator('#status')).toHaveText('Готово');expect(workerUrl).toBeTruthy();
  const results=await page.evaluate(async(url)=>{
    const worker=new Worker(url,{type:'module'});
    let request=0;
    const call=(data:object)=>new Promise<any>((resolve,reject)=>{
      worker.onmessage=e=>e.data.type==='error'?reject(new Error(e.data.message)):resolve(e.data);
      worker.onerror=e=>reject(new Error(e.message));worker.postMessage({...data,session:42,request:++request});
    });
    try {
      const ready=await call({type:'load',pcm:[new Float32Array([.1,.2,.3]),new Float32Array([0,0,0])]});
      const original=await call({type:'reconstruct',mask:{off:[0,0,0],exceptions:[]}});
      const silence=await call({type:'reconstruct',mask:{off:[1,1,1],exceptions:[]}});
      const one=await call({type:'reconstruct',mask:{off:[1,1,1],exceptions:[2]}});
      const restored=await call({type:'reconstruct',mask:{off:[0,0,0],exceptions:[]}});
      return {m:ready.m,original:original.pcm.map((x:Float32Array)=>Array.from(x)),silence:silence.pcm.map((x:Float32Array)=>Array.from(x)),one:one.pcm.map((x:Float32Array)=>Array.from(x)),restored:restored.pcm.map((x:Float32Array)=>Array.from(x))};
    } finally {worker.terminate();}
  },workerUrl);
  expect(results.m).toBe(4);
  for(let i=0;i<3;i++)expect(results.original[0][i]).toBeCloseTo([.1,.2,.3][i],5);
  expect(results.original[1]).toEqual([0,0,0]);expect(results.silence).toEqual([[0,0,0],[0,0,0]]);
  expect(results.one[0][0]).toBeCloseTo(-.05,5);expect(results.one[0][1]).toBeCloseTo(.05,5);expect(results.one[0][2]).toBe(0);
  expect(results.restored).toEqual(results.original);
});

test('30 second stereo full-depth transform and row/cell overlay',async({page})=>{
  await page.goto('./');await page.locator('#file').setInputFiles({name:'30sec.wav',mimeType:'audio/wav',buffer:wav(2,48000*30)});
  await expect(page.locator('#status')).toHaveText('Готово');await expect(page.locator('#metadata')).toContainText('J=21');
  await page.locator('#plot').click({position:{x:160,y:54}});
  await expect(page.locator('#cutoff-label')).toHaveText('Выборочно');await expect(page.locator('#counts')).toContainText('Выключено: 1');
  await expect(page.locator('#status')).toHaveText('Готово');
  await page.locator('#plot').click({position:{x:160,y:54}});await expect(page.locator('#counts')).toContainText('Выключено: 0');
  await page.locator('#plot').click({position:{x:20,y:80}});await expect(page.locator('#counts')).toContainText('Выключено: 2');
  const max=await page.locator('#cutoff').getAttribute('max');await page.locator('#cutoff').fill(max!);
  await expect(page.locator('#status')).toHaveText('Готово');await expect(page.locator('#counts')).toContainText('Выключено: 2097152');
});
