import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CSS} from '../../src/ui/styles.js';
function luminance(hex){const rgb=hex.match(/[a-f0-9]{2}/g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb.reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);}
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
test('normal text, statuses, links and primary buttons meet 4.5:1 in both themes including primary hover',()=>{
 const blocks=[CSS.match(/:host\{([^}]+)\}/)[1],CSS.match(/:host\(\[data-theme=dark\]\)\{([^}]+)\}/)[1]];let previous={};for(const block of blocks){const colors={...previous,...Object.fromEntries([...block.matchAll(/--([a-z-]+):#([a-f0-9]{3,6})/g)].map(([,key,value])=>[key,value.length===3?[...value].map(c=>c+c).join(''):value]))};previous=colors;for(const foreground of ['ink','muted','blue','danger'])for(const background of ['bg','surface','subtle'])assert.ok(contrast(colors[foreground],colors[background])>=4.5,foreground+' on '+background);assert.ok(contrast(colors['primary-fg'],colors.primary)>=4.5);const factor=Number(CSS.match(/primary:hover[^}]+brightness\(([\d.]+)\)/)[1]),hover=colors.primary.match(/../g).map(c=>Math.min(255,Math.round(parseInt(c,16)*factor)).toString(16).padStart(2,'0')).join('');assert.ok(contrast(colors['primary-fg'],hover)>=4.5);}
});
