const PLATFORM = "Newgrounds";
const BASE_URL = "https://www.newgrounds.com";
const CONFIG_ID = "4f480e7b-4161-4c6b-8864-fb6b8730b695";
const DEFAULT_UA = "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36";
const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";

const URL_MOVIES = BASE_URL + "/movies";
const URL_MOVIE_SEARCH = BASE_URL + "/search/conduct/movies?terms={0}&page={1}&inner=1";
const URL_CREATOR_SEARCH = BASE_URL + "/search/conduct/users?terms={0}&page={1}&inner=1";
const URL_MOVIE_DETAILS = BASE_URL + "/portal/view/{0}";
const URL_MOVIE_API = BASE_URL + "/portal/video/{0}";

const REGEX_DETAILS_URL = /^https?:\/\/(?:www\.)?newgrounds\.com\/portal\/(?:view|video)\/(\d+)/i;
const REGEX_CHANNEL_URL = /^https?:\/\/([a-z0-9_-]+)\.newgrounds\.com(?:\/movies)?\/?(?:[?#].*)?$/i;
const REGEX_VIDEO_LINK = /<a\b[^>]*href=["'](?:https?:\/\/www\.newgrounds\.com)?\/portal\/(?:view|video)\/(\d+)[^"']*["'][^>]*>/gi;
const REGEX_CHANNEL_LINK = /https?:\/\/([a-z0-9_-]+)\.newgrounds\.com(?:\/movies)?/gi;

let settings = { preferWebm: false, largeThumbnails: true, safeOnly: false };

source.enable = function (config) {
    config = config || {};
    settings.preferWebm = String(config.preferWebm).toLowerCase() === "true";
    settings.largeThumbnails = String(config.largeThumbnails).toLowerCase() !== "false";
    settings.safeOnly = String(config.safeOnly).toLowerCase() === "true";
};

function get(url, extraHeaders) {
    const headers = {
        "User-Agent": DEFAULT_UA,
        "Accept": "text/html,application/xhtml+xml,application/json,text/javascript,*/*;q=0.8"
    };
    if (extraHeaders) for (const k in extraHeaders) headers[k] = extraHeaders[k];
    const r = http.GET(url, headers);
    if (!r || r.body == null) throw new ScriptException("HttpError", "Empty response from " + url);
    return r;
}

function cleanText(s) {
    return decodeEntities(String(s == null ? "" : s).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}
function decodeEntities(s) {
    return String(s || "").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&#(\d+);/g, function(_,n){return String.fromCharCode(parseInt(n,10));});
}
function attr(tag, name) {
    const re = new RegExp(name + "\\s*=\\s*[\\\"']([^\\\"']*)[\\\"']", "i");
    const m = String(tag || "").match(re);
    return m ? decodeEntities(m[1]) : "";
}
function absoluteUrl(url) {
    if (!url) return "";
    url = decodeEntities(url);
    if (/^https?:\/\//i.test(url)) return url;
    if (url.indexOf("//") === 0) return "https:" + url;
    if (url.charAt(0) === "/") return BASE_URL + url;
    return BASE_URL + "/" + url;
}
function mediaPicon(id, large) {
    const bucket = Math.floor(Number(id) / 1000) * 1000;
    return "https://picon.ngfiles.com/" + bucket + "/flash_" + id + (large ? ".jpg" : "_card.png");
}
function mediaCard(id) {
    return "https://picon.ngfiles.com/" + (Math.floor(Number(id) / 1000) * 1000) + "/flash_" + id + "_card.png";
}
function parseDate(value) {
    if (!value) return 0;
    const t = Date.parse(value);
    return isNaN(t) ? 0 : Math.floor(t / 1000);
}
function parseDuration(value) {
    const raw = String(value || "").trim();
    if (!raw) return 0;
    if (/^\d+(?:\.\d+)?$/.test(raw)) return Number(raw) || 0;
    const p = raw.split(":").map(function(x){return parseInt(x,10)||0;});
    if (p.length === 2) return p[0] * 60 + p[1];
    if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
    return 0;
}
function meta(html, attrName, value) {
    const re = new RegExp("<meta\\b[^>]*" + attrName + "\\s*=\\s*[\\\"']" + value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&") + "[\\\"'][^>]*content\\s*=\\s*[\\\"']([^\\\"']+)[\\\"']", "i");
    let m = String(html || "").match(re);
    if (m) return decodeEntities(m[1]);
    const re2 = new RegExp("<meta\\b[^>]*content\\s*=\\s*[\\\"']([^\\\"']+)[\\\"'][^>]*" + attrName + "\\s*=\\s*[\\\"']" + value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&") + "[\\\"']", "i");
    m = String(html || "").match(re2);
    return m ? decodeEntities(m[1]) : "";
}
function firstText(html, regexes) {
    for (let i=0;i<regexes.length;i++) { const m=String(html||"").match(regexes[i]); if(m) return cleanText(m[1]); }
    return "";
}
function authorFromHtml(html) {
    const m = String(html || "").match(/https?:\/\/([a-z0-9_-]+)\.newgrounds\.com(?:\/[^\"'<> ]*)?/i);
    if (!m) return {name:"Newgrounds",url:BASE_URL};
    return {name:m[1],url:"https://"+m[1]+".newgrounds.com/movies"};
}
function makeAuthor(name,url,thumb) {
    const n = cleanText(name || "Newgrounds");
    const id = ((String(url||"").match(/^https?:\/\/([a-z0-9_-]+)\.newgrounds\.com/i)||[])[1]) || n;
    return new PlatformAuthorLink(new PlatformID(PLATFORM,id,CONFIG_ID),n,url||"",thumb||"");
}
function makeVideo(id,title,authorName,authorUrl,thumbs,date,duration,views) {
    const t = [];
    const seen = {};
    (thumbs || []).forEach(function(u,i){ if(u && !seen[u]) { seen[u]=true; t.push(new Thumbnail(u, i===0?1080:720)); } });
    if (!t.length) t.push(new Thumbnail(mediaPicon(id, settings.largeThumbnails),720));
    return new PlatformVideo({id:new PlatformID(PLATFORM,String(id),CONFIG_ID),name:cleanText(title)||("Newgrounds "+id),thumbnails:new Thumbnails(t),author:makeAuthor(authorName,authorUrl,thumbs&&thumbs[0]||""),uploadDate:date||0,duration:duration||0,viewCount:views||0,url:BASE_URL+"/portal/view/"+id,isLive:false});
}
function isAdultBlock(block) { return /(?:18\+|adult|mature|age[ -]?restricted|rating[^<]{0,20}(?:18|a\b))/i.test(String(block||"")); }
function extractVideos(html) {
    const out=[]; const seen={}; html=String(html||""); REGEX_VIDEO_LINK.lastIndex=0;
    let m;
    while((m=REGEX_VIDEO_LINK.exec(html))!==null){
        const id=m[1]; if(seen[id]) continue;
        const start=Math.max(0,m.index-2200), end=Math.min(html.length,m.index+4200), block=html.substring(start,end), anchor=m[0];
        if(settings.safeOnly && isAdultBlock(block)) continue;
        seen[id]=true;
        let title=attr(anchor,"title")||attr(anchor,"aria-label");
        if(!title){ let tm=block.match(/<(?:h[1-6]|div|span|p)[^>]*(?:class|data-title)=["'][^"']*(?:title|item-title|pod-title)[^"']*["'][^>]*>([\s\S]*?)<\//i); if(tm) title=cleanText(tm[1]); }
        if(!title) title=cleanText(anchor.replace(/^[\s\S]*?>/,'').replace(/<\/[\s\S]*$/,''));
        const a=authorFromHtml(block);
        const imgs=[]; const im=/https?:\/\/[^\"'<> ]*(?:picon|ngfiles)[^\"'<> ]*\.(?:jpg|jpeg|png|webp)(?:\?[^\"'<> ]*)?/ig;
        let mi; while((mi=im.exec(block))!==null && imgs.length<3){ if(imgs.indexOf(mi[0])<0) imgs.push(mi[0]); }
        imgs.push(mediaPicon(id,settings.largeThumbnails)); imgs.push(mediaCard(id));
        const dt=(block.match(/<time[^>]+datetime=["']([^"']+)["']/i)||[])[1];
        const dur=(block.match(/(?:duration|length)\D{0,15}(\d+(?::\d+){1,2})/i)||[])[1];
        const views=(block.match(/(?:views|viewed)\D{0,10}([\d,.]+)/i)||[])[1];
        out.push(makeVideo(id,title,a.name,a.url,imgs,parseDate(dt),parseDuration(dur),parseInt(String(views||'0').replace(/\D/g,''),10)||0));
    }
    return out;
}
function unescapeUrl(s){ return String(s||"").replace(/\\\//g,"/").replace(/\\u0026/g,"&").replace(/\\u003F/g,"?").replace(/&amp;/g,"&"); }
function findEmbeddedMedia(text){
    const out=[]; const seen={}; const s=String(text||"");
    const rx=/embedController\s*\(\s*\[\s*\{[\s\S]*?"url"\s*:\s*"([^"]+)"/ig;
    let m; while((m=rx.exec(s))!==null){ const u=unescapeUrl(m[1]); if(/^https?:\/\//i.test(u)&&!seen[u]){seen[u]=true;out.push(u);} }
    const rx2=/https?:\\?\/\\?\/(?:uploads\.ungrounded\.net|[^\"'<> ]+)\\?\/[^\"'<> ]+?\.(?:mp4|webm)(?:\?[^\"'<> ]*)?/ig;
    while((m=rx2.exec(s))!==null){const u=unescapeUrl(m[0]);if(!seen[u]){seen[u]=true;out.push(u);}}
    return out;
}
function makeSources(urls,duration){
    const normalized=[]; const seen={}; urls.forEach(function(u){u=unescapeUrl(u); if(!u||seen[u]) return; seen[u]=true; if(/\.(mp4|webm)(?:\?|$)/i.test(u)) normalized.push(u);});
    normalized.sort(function(a,b){ const aw=/\.webm/i.test(a), bw=/\.webm/i.test(b); if(aw===bw) return 0; return settings.preferWebm?(aw?-1:1):(aw?1:-1); });
    return normalized.map(function(u,i){return new VideoUrlSource({width:0,height:0,container:/\.webm/i.test(u)?"webm":"mp4",codec:"",name:/\.webm/i.test(u)?"WEBM "+(i+1):"MP4 "+(i+1),bitrate:0,duration:duration||0,url:u});});
}

source.getHome=function(continuationToken){ const page=continuationToken?Number(continuationToken):1; const r=get(page<=1?URL_MOVIES:URL_MOVIES+"?page="+page); const v=extractVideos(r.body); return new NewgroundsHomeVideoPager(v,v.length>0,{page:page+1}); };
source.searchSuggestions=function(q){return q?[q]:[];};
source.getSearchCapabilities=function(){return {types:[Type.Feed.Mixed],sorts:[Type.Order.Chronological],filters:[]};};
source.search=function(query,type,order,filters,continuationToken){const page=continuationToken?Number(continuationToken):1,q=encodeURIComponent(query||"");const r=get(URL_MOVIE_SEARCH.replace("{0}",q).replace("{1}",String(page)));const v=extractVideos(r.body);return new NewgroundsSearchVideoPager(v,v.length>0,{query:query,type:type,order:order,filters:filters,page:page+1});};
source.getSearchChannelVideoCapabilities=function(){return {types:[Type.Feed.Mixed],sorts:[Type.Order.Chronological],filters:[]};};
source.searchChannelVideos=function(url,query,type,order,filters,continuationToken){const page=continuationToken?Number(continuationToken):1,base=String(url).replace(/\/$/,"")+"/movies",r=get(base+"?page="+page);let v=extractVideos(r.body);if(query){const q=String(query).toLowerCase();v=v.filter(function(x){return String(x.name||"").toLowerCase().indexOf(q)>=0;});}return new NewgroundsSearchChannelVideoPager(v,v.length>0,{channelUrl:url,query:query,type:type,order:order,filters:filters,page:page+1});};
source.isChannelUrl=function(url){return REGEX_CHANNEL_URL.test(url||"");};
source.searchChannels=function(query,continuationToken){const page=continuationToken?Number(continuationToken):1,q=encodeURIComponent(query||""),r=get(URL_CREATOR_SEARCH.replace("{0}",q).replace("{1}",String(page))),out=[],seen={};REGEX_CHANNEL_LINK.lastIndex=0;let m;while((m=REGEX_CHANNEL_LINK.exec(r.body))!==null){const u=m[1].toLowerCase();if(seen[u])continue;seen[u]=true;out.push(new PlatformChannel({id:u,name:u,thumbnail:"",banner:"",subscribers:0,description:"",url:"https://"+u+".newgrounds.com/movies",links:{}}));}return new NewgroundsChannelPager(out,out.length>0,{query:query,page:page+1});};
source.getChannel=function(url){const m=String(url).match(REGEX_CHANNEL_URL);if(!m)throw new ScriptException("InvalidChannel","Invalid Newgrounds channel URL");const u=m[1],r=get("https://"+u+".newgrounds.com/"),html=r.body;return new PlatformChannel({id:u,name:meta(html,"property","og:title")||u,thumbnail:meta(html,"property","og:image")||"",banner:"",subscribers:0,description:meta(html,"name","description")||meta(html,"property","og:description")||"",url:"https://"+u+".newgrounds.com/movies",links:{}});};
source.getChannelVideos=function(url,type,order,filters,continuationToken){return source.searchChannelVideos(url,"",type,order,filters,continuationToken);};
source.getChannelCapabilities=function(){return {types:[Type.Feed.Mixed],sorts:[Type.Order.Chronological],filters:[]};};
source.isVideoDetailsUrl=function(url){return REGEX_DETAILS_URL.test(url||"");};
source.getVideoDetails=function(url){
    const m=String(url).match(REGEX_DETAILS_URL); if(!m) throw new ScriptException("InvalidContent","Invalid Newgrounds movie URL"); const id=m[1];
    const r=get(URL_MOVIE_DETAILS.replace("{0}",id),{"Referer":url}); const html=r.body;
    const title=meta(html,"property","og:title")||firstText(html,[/<h1[^>]*>([\s\S]*?)<\/h1>/i,/<title[^>]*>([\s\S]*?)<\/title>/i])||("Newgrounds "+id);
    const description=meta(html,"property","og:description")||meta(html,"name","description")||"";
    const thumbs=[meta(html,"property","og:image")||"",mediaPicon(id,settings.largeThumbnails),mediaCard(id)];
    const a=authorFromHtml(html); const dt=(html.match(/<time[^>]+datetime=["']([^"']+)["']/i)||[])[1]; const duration=parseDuration((html.match(/(?:duration|length)\D{0,15}(\d+(?::\d+){1,2})/i)||[])[1]); const views=parseInt(String((html.match(/(?:views|viewed)\D{0,10}([\d,.]+)/i)||[])[1]||'0').replace(/\D/g,''),10)||0;
    let media=[]; try { media=findEmbeddedMedia(html); } catch(_){}; if(!media.length){ try{const api=get(URL_MOVIE_API.replace("{0}",id),{"Accept":"application/json","Referer":url,"X-Requested-With":"XMLHttpRequest"}); media=findEmbeddedMedia(api.body);}catch(_){}}
    const sources=makeSources(media,duration); if(!sources.length) throw new ScriptException("NoSource","Newgrounds did not expose a playable MP4/WEBM source");
    return new PlatformVideoDetails({id:new PlatformID(PLATFORM,id,CONFIG_ID),name:cleanText(title),thumbnails:new Thumbnails(thumbs.filter(Boolean).map(function(x,i){return new Thumbnail(x,i===0?1080:720);})),author:makeAuthor(a.name,a.url,thumbs[0]||""),uploadDate:parseDate(dt),duration:duration,viewCount:views,url:url,isLive:false,description:cleanText(description),video:new VideoSourceDescriptor(sources),dash:null,hls:null,live:[]});
};
source.getComments=function(url,continuationToken){return new NewgroundsCommentPager([],false,{url:url,continuationToken:continuationToken});};
source.getSubComments=function(comment){return new NewgroundsCommentPager([],false,{url:"",continuationToken:null});};
class NewgroundsCommentPager extends CommentPager{constructor(r,h,c){super(r,h,c);}nextPage(){return source.getComments(this.context.url,this.context.continuationToken);}}
class NewgroundsHomeVideoPager extends VideoPager{constructor(r,h,c){super(r,h,c);}nextPage(){return source.getHome(String(this.context.page));}}
class NewgroundsSearchVideoPager extends VideoPager{constructor(r,h,c){super(r,h,c);}nextPage(){return source.search(this.context.query,this.context.type,this.context.order,this.context.filters,String(this.context.page));}}
class NewgroundsSearchChannelVideoPager extends VideoPager{constructor(r,h,c){super(r,h,c);}nextPage(){return source.searchChannelVideos(this.context.channelUrl,this.context.query,this.context.type,this.context.order,this.context.filters,String(this.context.page));}}
class NewgroundsChannelPager extends ChannelPager{constructor(r,h,c){super(r,h,c);}nextPage(){return source.searchChannels(this.context.query,String(this.context.page));}}
