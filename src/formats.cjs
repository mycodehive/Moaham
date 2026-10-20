const path = require('node:path');
const groups = {
  image: ['jpg','jpeg','png','webp','gif','bmp','svg','avif','ico','tif','tiff','heic'],
  design: ['psd','psb','ai','eps','sketch','fig','xd','afdesign','afphoto','indd','blend'],
  document: ['pdf','doc','docx','hwp','hwpx','odt','rtf','pages'],
  spreadsheet: ['xls','xlsx','xlsm','ods','csv','tsv','numbers'],
  presentation: ['ppt','pptx','odp','key'],
  text: ['txt','md','markdown','json','xml','yaml','yml','log','css','js','ts','py','html','htm','sql','ini'],
  video: ['mp4','webm','mov','mkv','avi'], audio: ['mp3','wav','ogg','m4a','flac','aac'],
  archive: ['zip','7z','rar','tar','gz']
};
const raster = ['jpg','jpeg','png','webp','gif','bmp','svg','avif','ico'];
const textExt = [...groups.text,'csv','tsv'];
const blocked = new Set(['exe','com','bat','cmd','ps1','vbs','vbe','js','jse','wsf','wsh','scr','msi','msp','hta','lnk','url','reg','cpl','dll','sys','chm','sh','appref-ms','scf','application','gadget','pif','jar','msc','msix','appx','py','pyw']);
function classify(name) { const ext = path.extname(name).slice(1).toLowerCase(); return {ext, kind: Object.keys(groups).find(k => groups[k].includes(ext)) || 'other'}; }
function previewType(ext) { return raster.includes(ext) ? 'image' : ext==='pdf'?'pdf':groups.video.includes(ext)?'video':groups.audio.includes(ext)?'audio':textExt.includes(ext)||['docx','xlsx','pptx','hwpx','odt','ods','odp'].includes(ext)?'text':'unsupported'; }
module.exports = {groups, classify, previewType, textExt, blocked};
