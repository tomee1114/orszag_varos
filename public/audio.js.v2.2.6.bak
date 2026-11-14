/* v2.2.6 helyi Web Audio hangmotor. Internet és hangfájl nélkül működik. */
(()=>{let ctx=null,enabled=true,volume=.78,unlocked=false,rollTimer=null,rollStep=0;
function open(){if(!ctx)ctx=new (window.AudioContext||window.webkitAudioContext)();if(ctx.state==='suspended')ctx.resume();unlocked=true}
function tone(freq,dur=.1,type='sine',delay=0,gain=.25){if(!enabled||!unlocked)return;let t=ctx.currentTime+delay,o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.001,gain*volume),t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(g).connect(ctx.destination);o.start(t);o.stop(t+dur+.02)}
function noise(dur=.05,delay=0,gain=.12){if(!enabled||!unlocked)return;let len=Math.max(1,ctx.sampleRate*dur),buf=ctx.createBuffer(1,len,ctx.sampleRate),d=buf.getChannelData(0);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*(1-i/len);let src=ctx.createBufferSource(),g=ctx.createGain(),t=ctx.currentTime+delay;src.buffer=buf;g.gain.setValueAtTime(gain*volume,t);g.gain.exponentialRampToValueAtTime(.0001,t+dur);src.connect(g).connect(ctx.destination);src.start(t)}
function click(){tone(720,.035,'triangle',0,.18);noise(.025,0,.06)}
function rollHit(i=0){let f=150+(i%5)*22;tone(f,.035,'square',0,.17);noise(.028,0,.09)}
function startRoll(){open();clearInterval(rollTimer);rollStep=0;rollTimer=setInterval(()=>rollHit(rollStep++),68)}
function stopRoll(){clearInterval(rollTimer);rollTimer=null;let delay=0;[75,90,110,135,165,205,250,310].forEach((gap,i)=>{delay+=gap;setTimeout(()=>rollHit(i+rollStep),delay)});setTimeout(()=>{tone(392,.18,'triangle');tone(523,.2,'triangle',.12);tone(784,.35,'sine',.25)},delay+90)}
const sounds={click,stop:stopRoll,letter(){tone(523,.15,'sine');tone(659,.17,'sine',.1);tone(784,.27,'sine',.2)},done(){tone(523,.09,'triangle');tone(784,.2,'triangle',.08)},tick(){tone(920,.055,'square',0,.13)},round(){[523,659,784,1047].forEach((f,i)=>tone(f,.18,'triangle',i*.09,.26))},winner(){[392,523,659,784,1047].forEach((f,i)=>tone(f,.3,'triangle',i*.12,.3))},remove(){tone(330,.1,'sawtooth');tone(220,.2,'sawtooth',.08)}};
window.gameAudio={open,startRoll,stopRoll,setEnabled(v){enabled=!!v;if(!enabled){clearInterval(rollTimer);rollTimer=null}},setVolume(v){volume=Math.max(0,Math.min(1,+v||0))},play(n){open();sounds[n]?.()},get unlocked(){return unlocked}};
document.addEventListener('pointerdown',e=>{open();if(enabled&&e.target.closest('button,a,[role="button"]')&&!e.target.closest('.sound-unlock'))click()});
})();
