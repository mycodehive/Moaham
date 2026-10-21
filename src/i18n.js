(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MoahamI18n=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const parameters=text=>[...new Set([...String(text).matchAll(/{{\s*([A-Za-z_][A-Za-z0-9_]*)\s*}}/g)].map(m=>m[1]))].sort();
 function create(initial={}){
  let state={code:'ko',locale:'ko-KR',messages:{},fallback:{}};
  const api={set,t,number,date,get code(){return state.code;},get locale(){return state.locale;}};
  function set(next={}){state={...state,...next};state.locale=next.locale||(next.code?(next.code==='ko'?'ko-KR':next.code==='en'?'en-US':next.code):state.locale);try{state.locale=new Intl.Locale(state.locale).toString();}catch{state.locale='ko-KR';}return api;}
  function number(value,options){return Number.isFinite(Number(value))?new Intl.NumberFormat(state.locale,options).format(Number(value)):String(value);}
  function date(value,options={year:'numeric',month:'2-digit',day:'2-digit'}){const d=new Date(value);return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat(state.locale,options).format(d);}
  function lookup(key){return Object.hasOwn(state.messages||{},key)?state.messages[key]:Object.hasOwn(state.fallback||{},key)?state.fallback[key]:undefined;}
  function t(key,params={}){let text;if(Object.hasOwn(params,'count')){const category=new Intl.PluralRules(state.locale).select(Number(params.count));text=lookup(key+'.'+category)??lookup(key+'.other');}text??=lookup(key);if(typeof text!=='string')return key;return text.replace(/{{\s*([A-Za-z_][A-Za-z0-9_]*)\s*}}/g,(placeholder,name)=>Object.hasOwn(params,name)?(typeof params[name]==='number'?number(params[name]):String(params[name])):placeholder);}
  return set(initial);
 }
 return{create,parameters};
});
