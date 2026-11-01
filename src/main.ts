import './style.css';
import config from '../config.json';
import { Player } from './audio/player';
import { Plot } from './ui/plot';
import { countOff, cutoff, hitCell, nearestQ, prefix, range, toggleCell, toggleRow } from './ui/controls';
import { current, type Mask, type Request, type Response } from './shared/protocol';
const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
$('app').innerHTML=`
<h1>Haar Audio Lab</h1>
<p>Полное ортонормированное разложение Хаара. Отключайте вклады и слушайте результат обратного преобразования.</p>
<div class="load"><label for="file">Локальный аудиофайл</label> <input id="file" type="file" accept="audio/*,.wav,.flac,.ogg,.mp3"><p class="muted">Аудио остаётся в браузере. Моно / стерео; до 2²³ отсчётов на канал. Кодеки зависят от браузера.</p></div>
<p id="status" role="status" aria-live="polite">Выберите аудиофайл</p><p id="warning"></p><p id="metadata" class="muted"></p>
<fieldset id="editing" disabled>
<div class="threshold"><label for="cutoff">Отключить низкочастотные вклады: <output id="cutoff-label">без изменений</output></label><input id="cutoff" type="range" min="0" max="1" value="0" step="1" list="marks"><datalist id="marks"></datalist><div class="muted">От Aⱼ → Dⱼ → … → D₁. Первые масштабы длинной записи могут быть ниже слышимого диапазона.</div></div>
<div class="controls"><button id="hz80">≈ 80 Гц</button><button id="hz200">≈ 200 Гц</button><button id="reset">Сбросить изменения</button><span id="counts"></span></div>
</fieldset>
<div class="controls"><button id="original" disabled>▶ Оригинал</button><button id="result" disabled>▶ Реконструкция</button><span id="gain"></span></div>
<div id="empty">Здесь появится карта коэффициентов: время × масштаб</div>
<div id="plot-wrap" hidden><canvas id="plot" tabindex="0" aria-label="Карта коэффициентов Хаара. Метка строки переключает уровень, ячейка — коэффициент. Клавиатурное управление ниже."></canvas></div>
<fieldset id="navigation" disabled><div class="controls"><button id="zoom-out" aria-label="Уменьшить масштаб">−</button><output id="zoom-label">1×</output><button id="zoom-in" aria-label="Увеличить масштаб">+</button><label for="pan">Позиция</label><input id="pan" type="range" min="0" max="1000" value="0"><button id="view-reset">Весь сигнал</button></div>
<div class="controls" id="keyboard"><label for="row">Уровень</label><select id="row"></select><button id="toggle-row">Вкл/выкл уровень</button><label for="coefficient">Коэффициент k</label><input id="coefficient" type="number" min="0" step="1" value="0"><button id="toggle-cell">Вкл/выкл коэффициент</button></div></fieldset>
<p id="hint" class="muted" aria-live="polite">Нажмите метку строки для выключения уровня. Отдельные ячейки доступны при ширине от 8 px.</p>
<div class="legend"><span><i class="swatch violet"></i>Исходные коэффициенты</span><span><i class="swatch orange"></i>Занулены при восстановлении (× для строки)</span></div>
<details><summary>Как читать карту</summary><p>Это карта времени и масштабов, не точная карта частот. Хаар имеет широкие перекрывающиеся частотные отклики: отметки ≈ Гц не задают резкой границы. Aⱼ — постоянный вклад дополненного сигнала.</p><p>Цвет показывает RMS величины вкладов |c|/√(2ʲ), объединённые по каналам и экранным пикселям; это не PSD. Шкала — логарифмическая, опорное значение — 99-й перцентиль detail-строк полной карты. Оранжевая маска сохраняет исходный фиолетовый фон.</p><p>Zoom до 32×, панорамирование ползунком. Клавиши +/− на графике меняют масштаб. Слайдер сбрасывает индивидуальные исключения. При ручном выборе показывается «Выборочно».</p></details>
<footer>Правое symmetric-reflection дополнение до степени двойки; полное DWT → маска → IDWT → обрезка до исходной длины. Общая маска для обоих каналов.</footer>`;
const player=new Player(),plot=new Plot($<HTMLCanvasElement>('plot'));
let worker:Worker|undefined, session=0, revision=0, renderRevision=0;
let original:AudioBuffer|undefined,result:AudioBuffer|undefined,mask:Mask=prefix(1,0);
let ready=false,busy=false,renderBusy=false,zoom=1, maxPadded=config.maxPaddedSamples;
let fileName='';
const status=(text:string)=>{$('status').textContent=text;};
const post=(message:Request,transfer:Transferable[]=[])=>worker!.postMessage(message,transfer);
function buttons() {
  $<HTMLButtonElement>('original').disabled=!original;
  $<HTMLButtonElement>('result').disabled=!ready||!result;
  $('original').textContent=player.active==='original'?'■ Стоп оригинал':'▶ Оригинал';
  $('result').textContent=player.active==='result'?'■ Стоп реконструкция':'▶ Реконструкция';
}
player.onChange=buttons;
function fail(error:unknown) {
  ready=false;worker?.terminate();worker=undefined;busy=renderBusy=false;result=undefined;player.stop();
  $<HTMLFieldSetElement>('editing').disabled=true;$<HTMLFieldSetElement>('navigation').disabled=true;
  status(`Ошибка: ${error instanceof Error?error.message:String(error)}. Попробуйте короткий WAV-файл.`);buttons();
}
function reconstruct() {
  if(!ready||busy)return;busy=true;
  post({type:'reconstruct',session,request:revision,mask:{off:[...mask.off],exceptions:[...mask.exceptions]}});
}
function changeMask(q?:number) {
  if(!ready)return;
  ++revision;result=undefined;player.stop();$('gain').textContent='';
  if(q!==undefined) { mask=prefix(plot.rows,q);$<HTMLInputElement>('cutoff').value=String(q); }
  $('cutoff-label').textContent=q===undefined?'Выборочно':q===0?'без изменений':q===1?'только DC':`≈ ${cutoff(q,plot.rows-1,plot.rate).toPrecision(3)} Гц (${q}/${plot.rows})`;
  plot.mask=mask;plot.draw();
  const complete=mask.off.filter((v,r)=>v&&!mask.exceptions.some(k=>k>=range(r)[0]&&k<range(r)[1])).length;
  $('counts').textContent=`Выключено: ${countOff(mask)} / ${plot.m} коэффициентов; ${complete} уровней`;
  status('Восстановление…');buttons();reconstruct();
}
function requestRender() {
  ++renderRevision;
  const width=Math.max(64,Math.min(4096,Math.floor($('plot-wrap').clientWidth-117)));
  const span=Math.max(1,Math.ceil(plot.n/zoom));
  const start=Math.floor((plot.n-span)*Number($<HTMLInputElement>('pan').value)/1000);
  plot.view={start,end:Math.min(plot.n,start+span),width};
  plot.values=undefined;plot.draw();$('zoom-label').textContent=`${zoom}×`;
  sendRender();
}
function sendRender() { if(!ready||renderBusy)return;renderBusy=true;post({type:'render',session,request:renderRevision,view:{...plot.view}}); }
async function load(file:File) {
  const id=++session;ready=false;++revision;++renderRevision;worker?.terminate();worker=undefined;busy=renderBusy=false;
  player.stop();original=result=undefined;buttons();
  $<HTMLFieldSetElement>('editing').disabled=true;$<HTMLFieldSetElement>('navigation').disabled=true;
  $('empty').hidden=false;$('plot-wrap').hidden=true;$('metadata').textContent='';$('gain').textContent='';
  $('warning').textContent=file.size>100*1024**2?'Большой файл (>100 MiB): декодирование может потребовать много памяти.':'';
  try {
    if(!file.size)throw new Error('Файл пуст');
    if(file.size>256*1024**2)throw new Error('Файл превышает лимит 256 MiB');
    status('Чтение файла…');const bytes=await file.arrayBuffer();if(id!==session)return;
    status('Декодирование…');const audio=await player.ctx.decodeAudioData(bytes);if(id!==session)return;
    if(audio.numberOfChannels<1||audio.numberOfChannels>2)throw new Error('Поддерживается только моно и стерео; автоматического downmix нет');
    if(!audio.length||audio.length>maxPadded)throw new Error('Слишком много отсчётов (лимит 2²³ на канал)');
    if(audio.length>maxPadded/2)$('warning').textContent='Большой PCM: потребуется несколько сотен MiB памяти. На мобильном устройстве лучше выбрать более короткий файл.';
    original=audio;fileName=file.name;buttons();status('Полное DWT в WebAssembly…');
    worker=new Worker(new URL('./worker/dsp.worker.ts',import.meta.url),{type:'module'});
    worker.onerror=e=>{if(id===session)fail(e.message);};
    worker.onmessage=(event:MessageEvent<Response>)=> {
      const data=event.data;if(data.session!==session)return;
      try {
        if(data.type==='error') {fail(data.message);return;}
        if(data.type==='ready') {
          maxPadded=data.max;ready=true;plot.configure(data.n,data.m,audio.sampleRate);mask=prefix(plot.rows,0);zoom=1;
          $<HTMLInputElement>('pan').value='0';$<HTMLInputElement>('cutoff').max=String(plot.rows);
          $('marks').innerHTML=Array.from({length:plot.rows+1},(_,i)=>`<option value="${i}" label="${i}"></option>`).join('');
          $('row').innerHTML=Array.from({length:plot.rows},(_,r)=>`<option value="${r}">${r===0?'A':'D'}${Math.log2(data.m)-(r? r-1:0)} (поддержка ${data.m/(range(r)[1]-range(r)[0])} отсч.)</option>`).join('');
          $('metadata').textContent=`${fileName} · ${audio.duration.toFixed(3)} с · ${audio.numberOfChannels} кан. · фактические ${audio.sampleRate} Гц · N=${data.n} · M=${data.m} · J=${Math.log2(data.m)} · symmetric reflection`;
          $('empty').hidden=true;$('plot-wrap').hidden=false;$<HTMLFieldSetElement>('editing').disabled=false;$<HTMLFieldSetElement>('navigation').disabled=false;
          changeMask(0);requestRender();
        } else if(data.type==='audio') {
          busy=false;
          if(current(session,revision,data)) {
            result=player.buffer(data.pcm,audio.sampleRate);$('gain').textContent=data.gain<1?`Снижен уровень на ${(-20*Math.log10(data.gain)).toFixed(2)} dB для предотвращения clipping`:'';
            status('Готово');buttons();
          } else reconstruct();
        } else if(data.type==='bins') {
          renderBusy=false;
          if(current(session,renderRevision,data))plot.setBins(data.values);else sendRender();
        }
      } catch(error) {fail(error);}
    };
    const pcm=Array.from({length:audio.numberOfChannels},(_,i)=>audio.getChannelData(i).slice());
    post({type:'load',session:id,pcm},pcm.map(x=>x.buffer));
  } catch(error) {if(id===session)fail(error);}
}
$<HTMLInputElement>('file').onchange=e=>{const file=(e.target as HTMLInputElement).files?.[0];if(file)void load(file);};
$('original').onclick=()=>{if(original)void player.play(original,'original').catch(fail);};
$('result').onclick=()=>{if(result)void player.play(result,'result').catch(fail);};
$<HTMLInputElement>('cutoff').oninput=e=>changeMask(Number((e.target as HTMLInputElement).value));
$('reset').onclick=()=>changeMask(0);
$('hz80').onclick=()=>changeMask(nearestQ(80,plot.rows-1,plot.rate));$('hz200').onclick=()=>changeMask(nearestQ(200,plot.rows-1,plot.rate));
function zoomBy(factor:number) {if(!ready)return;zoom=Math.max(1,Math.min(32,zoom*factor));requestRender();}
$('zoom-in').onclick=()=>zoomBy(2);$('zoom-out').onclick=()=>zoomBy(.5);
$('view-reset').onclick=()=>{zoom=1;$<HTMLInputElement>('pan').value='0';requestRender();};
$<HTMLInputElement>('pan').oninput=requestRender;
$('plot').onkeydown=e=>{if(e.key==='+'||e.key==='=')zoomBy(2);if(e.key==='-')zoomBy(.5);};
$('plot').onclick=e=> {
  if(!ready)return;const rect=$('plot').getBoundingClientRect();const hit=plot.hit(e.clientX-rect.left,e.clientY-rect.top);if(!hit)return;
  if(hit.index===undefined)toggleRow(mask,hit.row);else if(hit.index===null){$('hint').textContent='Увеличьте масштаб или отключите уровень целиком';return;}else toggleCell(mask,hit.index);
  changeMask();
};
$('toggle-row').onclick=()=>{toggleRow(mask,Number($<HTMLSelectElement>('row').value));changeMask();};
$('toggle-cell').onclick=()=> {
  const row=Number($<HTMLSelectElement>('row').value),k=Number($<HTMLInputElement>('coefficient').value),[lo,hi]=range(row);
  if(!Number.isInteger(k)||k<0||k>=hi-lo){$('hint').textContent=`Введите k от 0 до ${hi-lo-1}`;return;}
  const support=plot.m/(hi-lo),center=(Math.max(plot.view.start,k*support)+Math.min(plot.view.end,(k+1)*support,plot.n))/2;
  const x=(center-plot.view.start)/(plot.view.end-plot.view.start)*plot.view.width;
  if(hitCell(row,x,plot.view,plot.m,plot.n)!==lo+k){$('hint').textContent='Увеличьте масштаб и переместитесь к коэффициенту или отключите уровень целиком';return;}
  toggleCell(mask,lo+k);changeMask();
};
let resizeTimer:ReturnType<typeof setTimeout>;
new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(ready)requestRender();},100);}).observe($('plot-wrap'));
window.addEventListener('pagehide',()=>{player.stop();worker?.terminate();});
