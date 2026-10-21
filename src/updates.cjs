const {localizedError,errorInfo,errorText}=require('./localized-error.cjs');
const {t}=require('./i18n.cjs');
// Main-process only. The packaged app-update.yml fixes the public GitHub feed.
class AppUpdates {
 constructor(updater,{version,enabled,onChange=()=>{},onError=()=>{}}){
  this.updater=updater;this.enabled=enabled;this.onChange=onChange;this.onError=onError;
  this.value={state:enabled?'idle':'unsupported',currentVersion:version,version:null,percent:0};
  if(!enabled)return;
  updater.autoDownload=false;updater.autoInstallOnAppQuit=false;
  updater.allowPrerelease=false;updater.allowDowngrade=false;
  // Full installers avoid depending on availability of an old release's blockmap.
  updater.disableDifferentialDownload=true;
  updater.on('checking-for-update',()=>this.set({state:'checking',message:''}));
  updater.on('update-available',info=>this.set({state:'available',version:info.version,percent:0}));
  updater.on('update-not-available',()=>this.set({state:'current',version:null}));
  updater.on('download-progress',p=>this.set({state:'downloading',percent:Math.max(0,Math.min(100,p.percent||0))}));
  updater.on('update-downloaded',info=>this.set({state:'downloaded',version:info.version,percent:100}));
  updater.on('error',()=>this.failed());
 }
 status(){return {...this.value,...(this.value.state==='error'?{message:t('backend.update.failed'),errorInfo:{key:'backend.update.failed',params:{}}}:{} )};}
 set(patch){Object.assign(this.value,patch);this.onChange(this.status());}
 failed(){this.set({state:'error',message:t("backend.update.failed")});this.onError();}
 async check(){
  if(!this.enabled||this.checking||['downloading','downloaded','installing'].includes(this.value.state))return this.status();
  this.checking=true;
  try{await this.updater.checkForUpdates();}catch{this.failed();}finally{this.checking=false;}
  return this.status();
 }
 async download(){
  if(!this.enabled||this.value.state!=='available')throw localizedError("backend.update.checkFirst");
  this.set({state:'downloading',percent:0,message:''});
  try{await this.updater.downloadUpdate();}catch{this.failed();}
  return this.status();
 }
 install(){
  if(!this.enabled||this.value.state!=='downloaded')throw localizedError("backend.update.downloadFirst");
  this.set({state:'installing'});
  try{this.updater.quitAndInstall(true,true);}catch{this.failed();}
 }
}
module.exports={AppUpdates};
