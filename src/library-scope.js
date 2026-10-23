(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MoahamScope=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function isSourceItem(item){return !!item&&(!!item.connectionId||!!item.watchId||item.sourceOnly===true);}
 function isLibraryItem(item,defaultMode='copy'){return !!item&&(!isSourceItem(item)||defaultMode==='link');}
 function isPending(item,defaultMode='copy'){return isSourceItem(item)&&defaultMode!=='link';}
 function items(db,defaultMode='copy'){return (db?.items||[]).filter(item=>isLibraryItem(item,defaultMode));}
 function folderIsSource(db,id){return !!id&&(db?.watch?.targetFolderId===id||(db?.folders||[]).some(folder=>folder.id===id&&(!!folder.watchId||folder.sourceOnly===true)));}
 return{isSourceItem,isLibraryItem,isPending,items,folderIsSource};
});
