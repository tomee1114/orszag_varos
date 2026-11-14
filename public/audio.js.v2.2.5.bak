/* Helyi Web Audio hangmotor. Nem használ internetet és hangfájlokat. */
(()=>{let ctx=null,enabled=true,volume=.35,unlocked=false;
function open(){if(!ctx)ctx=new (window.AudioContext||window.webkitAudioContext)();if(ctx.state==='suspended')ctx.resume();unlocked=true}
function tone(freq,dur=.12,type='sine',delay=0,gain=.18){if(!enabled||!unlocked)return;let t=ctx.currentTime+delay,o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(gain*volume,t+.015);g.gain.exponentialRampToValueAtTime(.001,t+dur);o.connect(g).connect(ctx.destination);o.start(t);o.stop(t+dur+.03)}
const sounds={stop(){tone(180,.08,'square');tone(280,.1,'square',.08);tone(420,.18,'triangle',.17)},letter(){tone(523,.18,'sine');tone(659,.18,'sine',.12);tone(784,.28,'sine',.24)},done(){tone(523,.1,'triangle');tone(784,.18,'triangle',.1)},tick(){tone(880,.045,'sine',0,.08)},round(){[523,659,784,1047].forEach((f,i)=>tone(f,.18,'triangle',i*.09))},winner(){[392,523,659,784,1047].forEach((f,i)=>tone(f,.28,'triangle',i*.12))}};
window.gameAudio={open,setEnabled(v){enabled=!!v},setVolume(v){volume=Math.max(0,Math.min(1,+v||0))},play(n){open();sounds[n]?.()},get unlocked(){return unlocked}};
document.addEventListener('pointerdown',open,{once:true});
})();
