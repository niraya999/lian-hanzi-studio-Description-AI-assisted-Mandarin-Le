/** Builds the six illustrated prologue pages from the current Google Docs source. */
export function buildProloguePages(paragraphs) {
  const pages=[]; let page=null, started=false;
  const flush=()=>{ if(page&&(page.images.length||page.blocks.length)) pages.push(page); page=null; };
  for(const paragraph of paragraphs) {
    for(const artwork of paragraph.images||[]) {
      flush(); started=true;
      page={id:`prologue-page-${String(pages.length+1).padStart(2,'0')}`,images:[artwork],blocks:[]};
    }
    const text=paragraph.text?.trim();
    if(!started||!text||text==='破曉之聲'||text.toUpperCase()==='VOICE OF DAWN') continue;
    if(paragraph.pageBreakBefore&&page?.blocks.length) flush();
    if(!page) page={id:`prologue-page-${String(pages.length+1).padStart(2,'0')}`,images:[],blocks:[]};
    page.blocks.push({text,speaker:paragraph.speaker||''});
  }
  flush();
  return pages;
}
