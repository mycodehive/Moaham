const fs = require('node:fs/promises');
const { unzipSync } = require('fflate');
const { XMLParser, XMLValidator } = require('fast-xml-parser');
const { textExt } = require('./formats.cjs');
const MAX_INPUT = 32*1024*1024, MAX_ENTRY=8*1024*1024, MAX_TOTAL=24*1024*1024, MAX_TEXT=300000;
function xmlText(xml) {
  if (xml.length > MAX_ENTRY || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('안전하지 않거나 너무 큰 XML입니다.');
  if (XMLValidator.validate(xml)!==true) throw new Error('문서 XML을 읽을 수 없습니다.');
  const parser = new XMLParser({ignoreAttributes:true, processEntities:false, trimValues:false});
  const data = parser.parse(xml);
  let parts=[];
  function walk(n, depth=0) { if(depth>80) throw new Error('문서 구조가 너무 깊습니다.'); if(typeof n==='string'||typeof n==='number') parts.push(String(n)); else if(Array.isArray(n)) n.forEach(v=>walk(v,depth+1)); else if(n && typeof n==='object') { for(const [k,v] of Object.entries(n)) { walk(v,depth+1); if(/(^|:)(p|row|tr)$/.test(k)) parts.push('\n'); } } }
  walk(data); return parts.join(' ').replace(/ +\n/g,'\n').slice(0,MAX_TEXT);
}
async function extract(file,ext) {
  const stat = await fs.stat(file);
  if(textExt.includes(ext)) { const h=await fs.open(file,'r'); try { const b=Buffer.alloc(Math.min(stat.size,MAX_TEXT)); await h.read(b,0,b.length,0); return b.toString('utf8').replace(/\u0000/g,''); } finally {await h.close();} }
  if(!['docx','xlsx','pptx','hwpx','odt','ods','odp'].includes(ext)) return '';
  if(stat.size>MAX_INPUT) throw new Error('32MB 이상 문서는 본문 미리보기를 생략합니다. 연결 프로그램으로 열어주세요.');
  let total=0, count=0;
  const archive=unzipSync(new Uint8Array(await fs.readFile(file)),{filter(entry){
    count++; if(count>10000) throw new Error('압축 항목이 너무 많습니다.');
    const wanted = /^(word\/document\.xml|xl\/(sharedStrings\.xml|worksheets\/sheet\d+\.xml)|ppt\/slides\/slide\d+\.xml|Contents\/section\d+\.xml|content\.xml)$/i.test(entry.name);
    if(!wanted) return false;
    total+=entry.originalSize;
    if(entry.originalSize>MAX_ENTRY || total>MAX_TOTAL) throw new Error('문서 압축 해제 크기 제한을 초과했습니다.');
    return true;
  }});
  return Object.keys(archive).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).map(k=>xmlText(Buffer.from(archive[k]).toString('utf8'))).join('\n\n').slice(0,MAX_TEXT);
}
module.exports={extract,xmlText};
