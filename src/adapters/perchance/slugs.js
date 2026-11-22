import { slug } from '../../shared/domain.js';

export const AVAILABLE_TEXT = '(⊙.⊙) sorry, we cannot find a generator with that name! create one?';
export const RESERVED_TEXT = '(⊙.⊙) sorry, this is a reserved name - had to do this because a few users where "name-squatting" on lots of common words and not actually using them ¯\\_(⊙_ʖ⊙)_/¯';
const normalize = text => text.replace(/\s+/g, ' ').trim();

// A status code, shell iframe or an approximate error message is not availability.
export function classifySlug({text, saved = null, targetSlug, challenged = false}) {
  slug(targetSlug);
  if (challenged || typeof text !== 'string' || /just a moment|verify you are human|cloudflare|captcha/i.test(text)) return 'Unknown';
  const value=normalize(text),available=value===normalize(AVAILABLE_TEXT),reserved=value===normalize(RESERVED_TEXT);
  if (saved && (saved.slug!==targetSlug || !saved.id)) return 'Unknown';
  if ((available||reserved)&&saved) return 'Unknown';
  if (available) return 'Available';
  if (reserved) return 'Reserved';
  return saved && value.length>0 ? 'Taken' : 'Unknown';
}

export class SlugReader {
  constructor({request,reader,parse=html=>new DOMParser().parseFromString(html,'text/html')}) {Object.assign(this,{request,reader,parse});}
  async check(targetSlug) {
    slug(targetSlug);
    try {
      const html=await this.request('https://perchance.org/'+targetSlug,{type:'text'}),doc=this.parse(html);
      for(const node of doc.querySelectorAll('script,style,template,noscript'))node.remove();
      let saved=null;
      try{saved=await this.reader.metadata(targetSlug);}catch{}
      const classification=classifySlug({text:doc.body?.textContent||'',saved,targetSlug});
      return {classification,saved};
    }catch{return {classification:'Unknown',saved:null};}
  }
}
