const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {Library}=require('../src/library.cjs');
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'moaham-tag-scope-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const library=await new Library(path.join(root,'library')).init();
 const file=path.join(root,'a.txt');await fs.writeFile(file,'tag scope');await library.importPaths([file]);
 const managed=library.db.items[0];managed.tags=['old'];
 library.db.items.push({...structuredClone(managed),id:'watched',storage:'link',watchId:'watch'}, {...structuredClone(managed),id:'retained',storage:'link',sourceOnly:true});
 await library.save();return library;
}
for(const action of ['rename','merge','delete'])test(`${action} tags respects saved copy/link scope and undo preserves staged metadata`,async t=>{
 const library=await fixture(t),payload={name:'old',target:'new'},result=action==='delete'?[]:['new'];
 await library.manageTag(action,payload,'copy');
 assert.deepEqual(library.db.items[0].tags,result);
 assert.deepEqual(library.db.items.slice(1).map(item=>item.tags),[['old'],['old']]);
 await library.undo();assert.ok(library.db.items.every(item=>item.tags[0]==='old'));
 await library.manageTag(action,payload,'link');
 assert.ok(library.db.items.every(item=>JSON.stringify(item.tags)===JSON.stringify(result)));
});
