const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const request={url:'https://search.bilibili.com/video?keyword=payday&order=click&duration=2&tids=17',page:2,pageSize:42};
function setup(fetcher) {
 const context={URL,AbortSignal,Date,fetch:fetcher,Object};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../extension/search.js'),'utf8'),context);
 return context.BiliCompleteSearch;
}
test('page-origin search preserves filters and requests with existing browser credentials',async()=>{
 const api=setup(async(href,options)=>{
  assert.equal(options.credentials,'include');assert(options.signal instanceof AbortSignal);
  const url=new URL(href);assert.equal(url.pathname,'/x/web-interface/search/type');
  for(const [key,value]of Object.entries({keyword:'payday',page:'2',page_size:'42',order:'click',duration:'2',tids:'17',search_type:'video'}))assert.equal(url.searchParams.get(key),value);
  return {ok:true,json:async()=>({code:0,data:{page:2,numPages:8,result:[{type:'video',bvid:'BV1111111111',title:'pay',tag:'day',description:'day',author:'day'}]}})};
 });const result=await api.read(request);
 assert.equal(result.ok,true);assert.equal(result.totalPages,8);assert.equal(result.videos[0].tag,undefined);assert.equal(result.videos[0].description,undefined);
});
test('HTTP and API rate limits pause further page-origin search requests',async()=>{
 for(const response of [{ok:false,status:429},{ok:true,json:async()=>({code:-412,message:'rate limited'})}]){
  let calls=0;const api=setup(async()=>{calls++;return response;});
  assert.equal((await api.read(request)).ok,false);assert.equal((await api.read({...request,page:3})).ok,false);assert.equal(calls,1);
 }
});
test('rejects incorrect page data, invalid video ids and malformed page counts',async()=>{
 for(const data of [{page:1,numPages:10,result:[]},{page:2,numPages:'bad',result:[]},{page:2,numPages:10,result:[{type:'video',bvid:'javascript:bad',title:'payday'}]},{page:2,numPages:10,result:[{type:'video',bvid:'BV1111111111',title:null}]}]){
  const api=setup(async()=>({ok:true,json:async()=>({code:0,data})}));assert.equal((await api.read(request)).ok,false);
 }
});
test('page search cannot request foreign hosts, non-video routes or unbounded pages',()=>{
 const api=setup(async()=>{throw Error('must not fetch');});
 for(const change of [{url:'https://evil.example/video?keyword=payday'},{url:'https://search.bilibili.com/all?keyword=payday'},{url:'https://search.bilibili.com/video'},{page:1001},{page:1.5},{pageSize:999}])assert.throws(()=>api.urlFor({...request,...change}));
});
