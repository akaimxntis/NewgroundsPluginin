const PLATFORM = "Newgrounds";
const BASE_URL = "https://www.newgrounds.com";
const USER_AGENT = "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36";
const CONFIG_ID = "4f480e7b-4161-4c6b-8864-fb6b8730b695";

const URL_MOVIES = BASE_URL + "/movies";
const URL_MOVIE_SEARCH = BASE_URL + "/search/conduct/movies?terms={0}&page={1}&inner=1";
const URL_CREATOR_SEARCH = BASE_URL + "/search/conduct/users?terms={0}&page={1}&inner=1";
const URL_MOVIE_DETAILS = BASE_URL + "/portal/view/{0}";
const URL_MOVIE_API = BASE_URL + "/portal/video/{0}";

const REGEX_DETAILS_URL = /^https?:\/\/(?:www\.)?newgrounds\.com\/portal\/(?:view|video)\/(\d+)/i;
const REGEX_CHANNEL_URL = /^https?:\/\/([a-z0-9_-]+)\.newgrounds\.com(?:\/movies)?\/?(?:[?#].*)?$/i;
const REGEX_VIDEO_LINK = /<a\b[^>]*href=["'](?:https?:\/\/www\.newgrounds\.com)?\/portal\/(?:view|video)\/(\d+)[^"']*["'][^>]*>/gi;
const REGEX_CHANNEL_LINK = /https?:\/\/([a-z0-9_-]+)\.newgrounds\.com(?:\/movies)?/gi;

source.enable = function (conf) {};

function get(url, extraHeaders) {
    const headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/json,text/javascript,*/*;q=0.8"
    };
    if (extraHeaders) for (const k in extraHeaders) headers[k] = extraHeaders[k];
    const r = http.GET(url, headers);
    if (!r || r.body == null) throw new ScriptException("HttpError", "Empty response from " + url);
    return r;
}

function cleanText(s) {
    if (s == null) return "";
    return decodeEntities(String(s).replace(/<[^>]*>/g, " ").replace(/\\s+/g, " ").trim());
}

function decodeEntities(s) {
    return String(s || "")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(parseInt(n, 10)); });
}

function attr(tag, name) {
    if (!tag) return "";
    const re = new RegExp(name + "\\s*=\\s*[\\\"']([^\\\"']*)[\\\"']", "i");
    const m = String(tag).match(re);
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

function mediaPicon(id) {
    return "https://picon.ngfiles.com/" + (Math.floor(Number(id) / 1000) * 1000) + "/flash_" + id + "_card.png";
}

function stripBlock(html) {
    return String(html || "")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ");
}

function makeAuthor(name, url, thumb) {
    const n = cleanText(name || "Newgrounds");
    const id = url ? ((String(url).match(/^https?:\/\/([a-z0-9_-]+)\.newgrounds\.com/i) || [])[1] || n) : n;
    return new PlatformAuthorLink(new PlatformID(PLATFORM, id, CONFIG_ID), n, url || "", thumb || "");
}

function makeVideo(id, title, authorName, authorUrl, thumb) {
    return new PlatformVideo({
        id: new PlatformID(PLATFORM, String(id), CONFIG_ID),
        name: cleanText(title) || ("Newgrounds " + id),
        thumbnails: new Thumbnails([new Thumbnail(thumb || mediaPicon(id), 720)]),
        author: makeAuthor(authorName || "Newgrounds", authorUrl || BASE_URL, thumb || ""),
        uploadDate: 0,
        duration: 0,
        viewCount: 0,
        url: BASE_URL + "/portal/view/" + id,
        isLive: false
    });
}

function extractVideos(html) {
    html = stripBlock(html);
    const out = [];
    const seen = {};
    let m;
    while ((m = REGEX_VIDEO_LINK.exec(html)) !== null) {
        const id = m[1];
        if (seen[id]) continue;
        seen[id] = true;

        const start = Math.max(0, m.index - 2500);
        const end = Math.min(html.length, m.index + 5000);
        const block = html.substring(start, end);
        const anchor = m[0];

        let title = attr(anchor, "title") || attr(anchor, "aria-label");
        if (!title) {
            const t = block.match(/<(?:h[1-6]|div|span)[^>]*(?:class|data-title)=["'][^"']*(?:title|item-title|pod-title)[^"']*["'][^>]*>([\s\S]*?)<\//i);
            if (t) title = cleanText(t[1]);
        }
        if (!title) {
            const aText = anchor.replace(/^[\s\S]*?>/, "").replace(/<\/[\s\S]*$/, "");
            title = cleanText(aText);
        }

        let authorName = "Newgrounds";
        let authorUrl = "";
        const am = block.match(/https?:\/\/([a-z0-9_-]+)\.newgrounds\.com(?:\/[^\"'<> ]*)?/i);
        if (am) {
            authorName = am[1];
            authorUrl = "https://" + am[1] + ".newgrounds.com/movies";
        }

        const img = block.match(/<img\b[^>]*(?:data-src|data-original|src)=["']([^"']+)["'][^>]*>/i);
        const thumb = img ? absoluteUrl(img[1]) : mediaPicon(id);
        out.push(makeVideo(id, title, authorName, authorUrl, thumb));
    }
    return out;
}

function searchVideos(html) {
    let out = extractVideos(html);
    if (out.length) return out;
    try {
        const json = JSON.parse(html);
        const text = JSON.stringify(json);
        out = extractVideos(text);
    } catch (_) {}
    return out;
}

function meta(html, key, attrName) {
    const re = new RegExp("<meta\\b[^>]*" + key + "\\s*=\\s*[\\\"']([^\\\"']+)[\\\"'][^>]*>", "i");
    let m = html.match(re);
    if (m) return decodeEntities(m[1]);
    const re2 = new RegExp("<meta\\b[^>]*" + attrName + "\\s*=\\s*[\\\"']([^\\\"']+)[\\\"'][^>]*>", "i");
    m = html.match(re2);
    return m ? decodeEntities(m[1]) : "";
}

function firstText(html, regexes) {
    for (let i = 0; i < regexes.length; i++) {
        const m = html.match(regexes[i]);
        if (m) return cleanText(m[1]);
    }
    return "";
}

function findMediaUrls(text) {
    const urls = [];
    const seen = {};
    const patterns = [
        /https?:\\?\/\\?\/uploads\.ungrounded\.net\\?\/[^\"'\\s<>]+?\.(?:mp4|webm)(?:\?[^\"'\\s<>]*)?/gi,
        /https?:\\?\/\\?\/[^\"'\\s<>]+?\.ngfiles\.com[^\"'\\s<>]+?\.(?:mp4|webm)(?:\?[^\"'\\s<>]*)?/gi,
        /https?:\\?\/\\?\/[^\"'\\s<>]+?\.(?:m3u8)(?:\?[^\"'\\s<>]*)?/gi
    ];
    for (const re of patterns) {
        let m;
        while ((m = re.exec(text)) !== null) {
            const u = m[0].replace(/\\\\/g, "");
            if (!seen[u]) { seen[u] = true; urls.push(u); }
        }
    }
    return urls;
}

source.getHome = function (continuationToken) {
    const page = continuationToken ? Number(continuationToken) : 1;
    const r = get(page <= 1 ? URL_MOVIES : URL_MOVIES + "?page=" + page);
    const videos = extractVideos(r.body);
    return new NewgroundsHomeVideoPager(videos, videos.length > 0, { page: page + 1 });
};

source.searchSuggestions = function (query) { return query ? [query] : []; };
source.getSearchCapabilities = function () { return { types: [Type.Feed.Mixed], sorts: [Type.Order.Chronological], filters: [] }; };

source.search = function (query, type, order, filters, continuationToken) {
    const page = continuationToken ? Number(continuationToken) : 1;
    const q = encodeURIComponent(query || "");
    const r = get(URL_MOVIE_SEARCH.replace("{0}", q).replace("{1}", String(page)));
    const videos = searchVideos(r.body);
    return new NewgroundsSearchVideoPager(videos, videos.length > 0, { query: query, type: type, order: order, filters: filters, page: page + 1 });
};

source.getSearchChannelVideoCapabilities = function () { return { types: [Type.Feed.Mixed], sorts: [Type.Order.Chronological], filters: [] }; };

source.searchChannelVideos = function (url, query, type, order, filters, continuationToken) {
    const page = continuationToken ? Number(continuationToken) : 1;
    const base = String(url).replace(/\/$/, "") + "/movies";
    const r = get(base + "?page=" + page);
    let videos = extractVideos(r.body);
    if (query) {
        const q = String(query).toLowerCase();
        videos = videos.filter(v => String(v.name || "").toLowerCase().indexOf(q) >= 0);
    }
    return new NewgroundsSearchChannelVideoPager(videos, videos.length > 0, { channelUrl: url, query: query, type: type, order: order, filters: filters, page: page + 1 });
};

source.isChannelUrl = function (url) { return REGEX_CHANNEL_URL.test(url || ""); };

source.searchChannels = function (query, continuationToken) {
    const page = continuationToken ? Number(continuationToken) : 1;
    const q = encodeURIComponent(query || "");
    const r = get(URL_CREATOR_SEARCH.replace("{0}", q).replace("{1}", String(page)));
    const out = [];
    const seen = {};
    let m;
    REGEX_CHANNEL_LINK.lastIndex = 0;
    while ((m = REGEX_CHANNEL_LINK.exec(r.body)) !== null) {
        const user = m[1].toLowerCase();
        if (seen[user]) continue;
        seen[user] = true;
        out.push(new PlatformChannel({ id: user, name: user, thumbnail: "", banner: "", subscribers: 0, description: "", url: "https://" + user + ".newgrounds.com/movies", links: {} }));
    }
    return new NewgroundsChannelPager(out, out.length > 0, { query: query, page: page + 1 });
};

source.getChannel = function (url) {
    const m = String(url).match(REGEX_CHANNEL_URL);
    if (!m) throw new ScriptException("InvalidChannel", "Invalid Newgrounds channel URL");
    const username = m[1];
    const r = get("https://" + username + ".newgrounds.com/");
    const html = r.body;
    const title = meta(html, "property", "og:title") || firstText(html, [/<h1[^>]*>([\s\S]*?)<\/h1>/i, /<title[^>]*>([\s\S]*?)<\/title>/i]) || username;
    return new PlatformChannel({
        id: username,
        name: title.replace(/\s*[-|]\s*Newgrounds.*$/i, ""),
        thumbnail: meta(html, "property", "og:image") || "",
        banner: "",
        subscribers: 0,
        description: meta(html, "name", "description") || meta(html, "property", "og:description") || "",
        url: "https://" + username + ".newgrounds.com/movies",
        links: {}
    });
};

source.getChannelVideos = function (url, type, order, filters, continuationToken) {
    return source.searchChannelVideos(url, "", type, order, filters, continuationToken);
};
source.getChannelCapabilities = function () { return { types: [Type.Feed.Mixed], sorts: [Type.Order.Chronological], filters: [] }; };
source.isVideoDetailsUrl = function (url) { return REGEX_DETAILS_URL.test(url || ""); };

source.getVideoDetails = function (url) {
    const m = String(url).match(REGEX_DETAILS_URL);
    if (!m) throw new ScriptException("InvalidContent", "Invalid Newgrounds movie URL");
    const id = m[1];
    const r = get(URL_MOVIE_DETAILS.replace("{0}", id), { "Referer": url });
    const html = r.body;

    const title = meta(html, "property", "og:title") || firstText(html, [/<h1[^>]*>([\s\S]*?)<\/h1>/i, /<title[^>]*>([\s\S]*?)<\/title>/i]) || ("Newgrounds " + id);
    const description = meta(html, "property", "og:description") || meta(html, "name", "description") || "";
    const thumbnail = meta(html, "property", "og:image") || mediaPicon(id);

    let authorName = "Newgrounds";
    let authorUrl = BASE_URL;
    const am = html.match(/https?:\/\/([a-z0-9_-]+)\.newgrounds\.com(?:\/[^\"'<> ]*)?/i);
    if (am) { authorName = am[1]; authorUrl = "https://" + am[1] + ".newgrounds.com/movies"; }

    const durationMatch = html.match(/(?:duration|length)[^0-9]{0,30}(\d+(?:\.\d+)?)/i);
    const duration = durationMatch ? Number(durationMatch[1]) || 0 : 0;
    const uploadDateRaw = (html.match(/<time[^>]+datetime=["']([^"']+)["']/i) || [])[1] || "";
    const uploadDate = uploadDateRaw ? Math.floor(Date.parse(uploadDateRaw) / 1000) : 0;
    const viewRaw = (html.match(/(?:views|viewed)[^0-9]{0,20}([\d,.]+)/i) || [])[1] || "0";
    const viewCount = parseInt(String(viewRaw).replace(/[^0-9]/g, ""), 10) || 0;

    let mediaText = html;
    try {
        const api = get(URL_MOVIE_API.replace("{0}", id), { "Accept": "application/json", "Referer": url, "X-Requested-With": "XMLHttpRequest" });
        mediaText += "\n" + api.body;
    } catch (_) {}

    const mediaUrls = findMediaUrls(mediaText);
    const videoSources = [];
    for (let i = 0; i < mediaUrls.length; i++) {
        const u = mediaUrls[i];
        if (/\.m3u8(?:\?|$)/i.test(u)) continue;
        videoSources.push(new VideoUrlSource({ width: 0, height: 0, container: /\.webm(?:\?|$)/i.test(u) ? "webm" : "mp4", codec: "", name: "Source " + (i + 1), bitrate: 0, duration: duration, url: u }));
    }

    if (videoSources.length === 0) throw new ScriptException("NoSource", "Newgrounds did not expose a playable video source");

    return new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, id, CONFIG_ID),
        name: cleanText(title),
        thumbnails: new Thumbnails([new Thumbnail(thumbnail, 720)]),
        author: makeAuthor(authorName, authorUrl, thumbnail),
        uploadDate: uploadDate,
        duration: duration,
        viewCount: viewCount,
        url: url,
        isLive: false,
        description: cleanText(description),
        video: new VideoSourceDescriptor(videoSources),
        dash: null,
        hls: null,
        live: []
    });
};

source.getComments = function (url, continuationToken) { return new NewgroundsCommentPager([], false, { url: url, continuationToken: continuationToken }); };
source.getSubComments = function (comment) { return new NewgroundsCommentPager([], false, { url: "", continuationToken: null }); };

class NewgroundsCommentPager extends CommentPager {
    constructor(results, hasMore, context) { super(results, hasMore, context); }
    nextPage() { return source.getComments(this.context.url, this.context.continuationToken); }
}
class NewgroundsHomeVideoPager extends VideoPager {
    constructor(results, hasMore, context) { super(results, hasMore, context); }
    nextPage() { return source.getHome(String(this.context.page)); }
}
class NewgroundsSearchVideoPager extends VideoPager {
    constructor(results, hasMore, context) { super(results, hasMore, context); }
    nextPage() { return source.search(this.context.query, this.context.type, this.context.order, this.context.filters, String(this.context.page)); }
}
class NewgroundsSearchChannelVideoPager extends VideoPager {
    constructor(results, hasMore, context) { super(results, hasMore, context); }
    nextPage() { return source.searchChannelVideos(this.context.channelUrl, this.context.query, this.context.type, this.context.order, this.context.filters, String(this.context.page)); }
}
class NewgroundsChannelPager extends ChannelPager {
    constructor(results, hasMore, context) { super(results, hasMore, context); }
    nextPage() { return source.searchChannels(this.context.query, String(this.context.page)); }
}
