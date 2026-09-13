const PLATFORM = "Newgrounds";
const BASE_URL = "https://www.newgrounds.com";
const USER_AGENT = "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36";

const CONFIG_ID = "4f480e7b-4161-4c6b-8864-fb6b8730b695";

const URL_MOVIES = BASE_URL + "/movies";
const URL_MOVIE_SEARCH = BASE_URL + "/search/conduct/movies?terms={0}&page={1}&inner=1";
const URL_CREATOR_SEARCH = BASE_URL + "/search/conduct/users?terms={0}&page={1}&inner=1";
const URL_CREATOR_PROFILE = "https://{0}.newgrounds.com";
const URL_CREATOR_MOVIES = "https://{0}.newgrounds.com/movies";
const URL_MOVIE_DETAILS = BASE_URL + "/portal/view/{0}";
const URL_MOVIE_API = BASE_URL + "/portal/video/{0}";

const REGEX_DETAILS_URL = /^https?:\/\/(?:www\.)?newgrounds\.com\/portal\/view\/(\d+)/i;
const REGEX_AUDIO_URL = /^https?:\/\/(?:www\.)?newgrounds\.com\/audio\/listen\/(\d+)/i;
const REGEX_CHANNEL_URL = /^https?:\/\/([a-z0-9_-]+)\.newgrounds\.com(?:\/movies)?(?:[?#].*)?$/i;
const REGEX_USER_URL = /^https?:\/\/([a-z0-9_-]+)\.newgrounds\.com/i;

let config = null;

source.enable = function (conf) {
    config = conf;
};

function getHeaders(extra) {
    const headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/json,text/javascript,*/*;q=0.8"
    };
    if (extra) {
        for (const k in extra) headers[k] = extra[k];
    }
    return headers;
}

function get(url, extraHeaders) {
    return http.GET(url, getHeaders(extraHeaders));
}

function cleanText(value) {
    if (value == null) return "";
    return String(value).replace(/\s+/g, " ").trim();
}

function decodeEntities(value) {
    return cleanText(value)
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");
}

function absoluteUrl(url) {
    if (!url) return "";
    if (/^https?:\/\//i.test(url)) return url;
    if (url.indexOf("//") === 0) return "https:" + url;
    if (url.charAt(0) === "/") return BASE_URL + url;
    return BASE_URL + "/" + url;
}

function formatTimestamp(value) {
    if (!value) return 0;
    const parsed = Date.parse(value);
    if (!isNaN(parsed)) return Math.floor(parsed / 1000);
    const n = Number(value);
    return isNaN(n) ? 0 : n;
}

function parseCount(value) {
    if (!value) return 0;
    const normalized = String(value).replace(/,/g, "").replace(/\./g, "").trim();
    const n = parseInt(normalized, 10);
    return isNaN(n) ? 0 : n;
}

function parseDuration(value) {
    if (!value) return 0;
    const raw = String(value).trim();
    if (/^\d+$/.test(raw)) return parseInt(raw, 10);
    const parts = raw.split(":").map(x => parseInt(x, 10) || 0);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return 0;
}

function parseDocument(html) {
    return new DOMParser().parseFromString(html, "text/html");
}

function nodeAttr(node, name) {
    try { return node ? (node.getAttribute(name) || "") : ""; }
    catch (_) { return ""; }
}

function nodeText(node) {
    try { return decodeEntities(node ? node.textContent : ""); }
    catch (_) { return ""; }
}

function firstAttr(node, names) {
    for (let i = 0; i < names.length; i++) {
        const value = nodeAttr(node, names[i]);
        if (value) return value;
    }
    return "";
}

function findThumbnail(card, mediaId) {
    if (card) {
        const img = card.querySelector("img");
        if (img) {
            const src = firstAttr(img, ["data-src", "data-original", "src"]);
            if (src) return absoluteUrl(src);
        }
    }
    if (mediaId) return "https://picon.ngfiles.com/" + Math.floor(Number(mediaId) / 1000) * 1000 + "/flash_" + mediaId + "_card.png";
    return "";
}

function extractMediaId(url) {
    if (!url) return "";
    let m = String(url).match(/(?:portal\/view|portal\/video|audio\/listen)\/(\d+)/i);
    return m ? m[1] : "";
}

function makeAuthor(authorId, authorName, authorUrl, thumbnail) {
    const id = String(authorId || authorName || "unknown");
    return new PlatformAuthorLink(
        new PlatformID(PLATFORM, id, CONFIG_ID),
        cleanText(authorName || authorId || "Newgrounds"),
        authorUrl || "",
        thumbnail || ""
    );
}

function makeVideoFromCard(card) {
    const link = card.querySelector("a.item-portalsubmission, a[href*='/portal/view/']");
    if (!link) return null;

    const url = absoluteUrl(nodeAttr(link, "href"));
    const id = extractMediaId(url);
    if (!id) return null;

    let title = nodeAttr(link, "title");
    if (!title) {
        const titleNode = card.querySelector(".item-title, .title, h2, h3");
        title = nodeText(titleNode);
    }
    if (!title) title = nodeText(link);

    let authorName = "Newgrounds";
    let authorUrl = "";
    const author = card.querySelector("a[href*='.newgrounds.com']");
    if (author) {
        authorName = nodeText(author) || authorName;
        authorUrl = absoluteUrl(nodeAttr(author, "href"));
    }

    const img = card.querySelector("img");
    const thumbnail = findThumbnail(card, id);

    let timestamp = 0;
    const time = card.querySelector("time");
    if (time) timestamp = formatTimestamp(firstAttr(time, ["datetime"])) || formatTimestamp(nodeText(time));

    return new PlatformVideo({
        id: new PlatformID(PLATFORM, id, CONFIG_ID),
        name: cleanText(title) || ("Newgrounds " + id),
        thumbnails: new Thumbnails([
            new Thumbnail(thumbnail, 720)
        ]),
        author: makeAuthor(authorName, authorName, authorUrl, img ? firstAttr(img, ["src"]) : ""),
        uploadDate: timestamp,
        duration: 0,
        viewCount: 0,
        url: url,
        isLive: false
    });
}

function extractVideosFromHtml(html) {
    const doc = parseDocument(html);
    const cards = doc.querySelectorAll("a.item-portalsubmission");
    const result = [];
    const seen = {};

    for (let i = 0; i < cards.length; i++) {
        const anchor = cards[i];
        const url = absoluteUrl(nodeAttr(anchor, "href"));
        const id = extractMediaId(url);
        if (!id || seen[id]) continue;
        seen[id] = true;

        const card = anchor.closest(".item-portalsubmission") || anchor.parentNode || anchor;
        const video = makeVideoFromCard(card);
        if (video) result.push(video);
    }

    return result;
}

function extractVideosFromJson(value) {
    const result = [];
    const seen = {};

    function walk(node) {
        if (!node) return;
        if (typeof node === "string") {
            const m = node.match(/https?:\/\/www\.newgrounds\.com\/portal\/view\/(\d+)/i);
            if (m && !seen[m[1]]) {
                seen[m[1]] = true;
                result.push(new PlatformVideo({
                    id: new PlatformID(PLATFORM, m[1], CONFIG_ID),
                    name: "Newgrounds " + m[1],
                    thumbnails: new Thumbnails([new Thumbnail("https://picon.ngfiles.com/" + Math.floor(Number(m[1]) / 1000) * 1000 + "/flash_" + m[1] + "_card.png", 720)]),
                    author: makeAuthor("newgrounds", "Newgrounds", BASE_URL, ""),
                    uploadDate: 0,
                    duration: 0,
                    viewCount: 0,
                    url: m[0],
                    isLive: false
                }));
            }
            return;
        }
        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) walk(node[i]);
            return;
        }
        if (typeof node === "object") {
            for (const key in node) walk(node[key]);
        }
    }

    walk(value);
    return result;
}

function makePager(results, hasMore, context, PagerClass) {
    return new PagerClass(results, hasMore, context);
}

source.getHome = function(continuationToken) {
    const page = continuationToken ? Number(continuationToken) : 1;
    const url = page <= 1 ? URL_MOVIES : URL_MOVIES + "?page=" + page;
    const resp = get(url, {"X-Requested-With": "XMLHttpRequest"});
    const videos = extractVideosFromHtml(resp.body);
    const hasMore = videos.length > 0;
    return new NewgroundsHomeVideoPager(videos, hasMore, { page: page + 1 });
};

source.searchSuggestions = function(query) {
    return query ? [query] : [];
};

source.getSearchCapabilities = function() {
    return {
        types: [Type.Feed.Mixed],
        sorts: [Type.Order.Chronological],
        filters: []
    };
};

source.search = function(query, type, order, filters, continuationToken) {
    const page = continuationToken ? Number(continuationToken) : 1;
    const q = encodeURIComponent(query || "");
    const resp = get(URL_MOVIE_SEARCH.replace("{0}", q).replace("{1}", String(page)), {"X-Requested-With": "XMLHttpRequest"});
    let videos = [];
    try {
        const json = JSON.parse(resp.body);
        videos = extractVideosFromJson(json);
    } catch (_) {
        videos = extractVideosFromHtml(resp.body);
    }
    return new NewgroundsSearchVideoPager(videos, videos.length > 0, {
        query: query, type: type, order: order, filters: filters, page: page + 1
    });
};

source.getSearchChannelContentsCapabilities = function() {
    return {
        types: [Type.Feed.Mixed],
        sorts: [Type.Order.Chronological],
        filters: []
    };
};

source.searchChannelContents = function(url, query, type, order, filters, continuationToken) {
    const page = continuationToken ? Number(continuationToken) : 1;
    const base = url.replace(/\/?$/, "") + "/movies";
    const resp = get(base + "?page=" + page, {"X-Requested-With": "XMLHttpRequest"});
    const videos = extractVideosFromHtml(resp.body);
    const filtered = query ? videos.filter(v => v.name.toLowerCase().indexOf(String(query).toLowerCase()) >= 0) : videos;
    return new NewgroundsSearchChannelVideoPager(filtered, filtered.length > 0, {
        channelUrl: url, query: query, type: type, order: order, filters: filters, page: page + 1
    });
};

source.searchChannels = function(query, continuationToken) {
    const page = continuationToken ? Number(continuationToken) : 1;
    const q = encodeURIComponent(query || "");
    const resp = get(URL_CREATOR_SEARCH.replace("{0}", q).replace("{1}", String(page)), {"X-Requested-With": "XMLHttpRequest"});
    const doc = parseDocument(resp.body);
    const links = doc.querySelectorAll("a");
    const channels = [];
    const seen = {};

    for (let i = 0; i < links.length; i++) {
        const href = absoluteUrl(nodeAttr(links[i], "href"));
        const m = href.match(REGEX_USER_URL);
        if (!m || seen[m[1]]) continue;
        const name = nodeText(links[i]);
        if (!name) continue;
        seen[m[1]] = true;
        channels.push(new PlatformChannel({
            id: m[1],
            name: name,
            thumbnail: "",
            banner: "",
            subscribers: 0,
            description: "",
            url: "https://" + m[1] + ".newgrounds.com/movies",
            links: {}
        }));
    }

    return new NewgroundsChannelPager(channels, channels.length > 0, {query: query, page: page + 1});
};

source.isChannelUrl = function(url) {
    return REGEX_CHANNEL_URL.test(url || "");
};

source.getChannel = function(url) {
    const m = String(url).match(REGEX_CHANNEL_URL);
    if (!m) throw new ScriptException("InvalidChannel", "Invalid Newgrounds channel URL");

    const username = m[1];
    const profileUrl = URL_CREATOR_PROFILE.replace("{0}", username);
    const resp = get(profileUrl);
    const doc = parseDocument(resp.body);

    const title = doc.querySelector("h1, .user-header-name, .profile-name");
    const desc = doc.querySelector("meta[name='description']");
    const image = doc.querySelector("meta[property='og:image'], .user-header img, .avatar img");

    return new PlatformChannel({
        id: username,
        name: nodeText(title) || username,
        thumbnail: image ? firstAttr(image, ["content", "src"]) : "",
        banner: "",
        subscribers: 0,
        description: desc ? nodeAttr(desc, "content") : "",
        url: profileUrl + "/movies",
        links: {}
    });
};

source.getChannelContents = function(url, type, order, filters, continuationToken) {
    return source.searchChannelContents(url, "", type, order, filters, continuationToken);
};

source.isContentDetailsUrl = function(url) {
    return REGEX_DETAILS_URL.test(url || "");
};

source.getContentDetails = function(url) {
    const m = String(url).match(REGEX_DETAILS_URL);
    if (!m) throw new ScriptException("InvalidContent", "Invalid Newgrounds movie URL");
    const id = m[1];

    const pageResp = get(URL_MOVIE_DETAILS.replace("{0}", id), {"X-Requested-With": "XMLHttpRequest"});
    const html = pageResp.body;

    let media = null;
    const embed = html.match(/embedController\(\[\{\s*"url"\s*:\s*("[^"]+")/i);
    if (embed) {
        try { media = JSON.parse(embed[1]); } catch (_) { media = null; }
    }

    let api = null;
    if (!media) {
        try {
            const apiResp = get(URL_MOVIE_API.replace("{0}", id), {
                "Accept": "application/json",
                "Referer": url,
                "X-Requested-With": "XMLHttpRequest"
            });
            api = JSON.parse(apiResp.body);
        } catch (_) {
            api = null;
        }
    }

    const doc = parseDocument(html);
    const titleNode = doc.querySelector("h1, h2");
    const title = nodeText(titleNode) || (api && api.title) || ("Newgrounds " + id);
    const authorLink = doc.querySelector("a[href$='.newgrounds.com'], a[href*='.newgrounds.com/']");
    const authorName = authorLink ? nodeText(authorLink) : ((api && api.author) || "Newgrounds");
    const authorUrl = authorLink ? absoluteUrl(nodeAttr(authorLink, "href")) : "";

    const ogImage = doc.querySelector("meta[property='og:image']");
    const thumbnail = ogImage ? nodeAttr(ogImage, "content") : findThumbnail(null, id);
    const descNode = doc.querySelector("#author_comments, meta[property='og:description']");
    const description = descNode ? (descNode.tagName === "META" ? nodeAttr(descNode, "content") : nodeText(descNode)) : "";

    let uploadDate = 0;
    const timeNode = doc.querySelector("time[datetime], meta[itemprop='uploadDate'], meta[itemprop='datePublished']");
    if (timeNode) uploadDate = formatTimestamp(firstAttr(timeNode, ["datetime", "content"]));

    let duration = 0;
    const durationNode = doc.querySelector("meta[itemprop='duration']");
    if (durationNode) duration = parseDuration(firstAttr(durationNode, ["content"]));

    let viewCount = 0;
    const bodyText = nodeText(doc);
    const viewMatch = bodyText.match(/Views\s*([\d,.]+)/i);
    if (viewMatch) viewCount = parseCount(viewMatch[1]);

    let videoSources = [];
    let audioSources = [];

    if (media) {
        videoSources.push(new VideoUrlSource({
            width: 0,
            height: 0,
            container: "mp4",
            codec: "",
            name: "Source",
            bitrate: 0,
            duration: duration,
            url: media
        }));
    } else if (api && api.sources) {
        for (const key in api.sources) {
            const group = api.sources[key];
            if (!group || typeof group !== "object") continue;
            for (const sourceKey in group) {
                const item = group[sourceKey];
                if (!item || !item.src) continue;
                const src = String(item.src);
                const isAudio = /\.(?:mp3|m4a|aac|ogg|oga)(?:[?#]|$)/i.test(src) || /audio/i.test(key + " " + sourceKey);
                if (isAudio) {
                    audioSources.push(new AudioUrlSource({
                        name: key,
                        bitrate: 0,
                        container: src.indexOf(".mp3") >= 0 ? "mp3" : "m4a",
                        codecs: "",
                        duration: duration,
                        url: src,
                        language: "Unknown"
                    }));
                } else {
                    videoSources.push(new VideoUrlSource({
                        width: parseInt(String(key).replace(/\D/g, ""), 10) || 0,
                        height: 0,
                        container: "mp4",
                        codec: "",
                        name: key,
                        bitrate: 0,
                        duration: duration,
                        url: src
                    }));
                }
            }
        }
    }

    if (videoSources.length === 0 && audioSources.length === 0) {
        throw new ScriptException("NoSource", "Newgrounds did not expose a playable source for this movie");
    }

    let descriptor;
    if (audioSources.length > 0 && videoSources.length > 0) {
        descriptor = new UnMuxVideoSourceDescriptor(videoSources, audioSources);
    } else {
        descriptor = new VideoSourceDescriptor(videoSources.length > 0 ? videoSources : audioSources);
    }

    return new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, id, CONFIG_ID),
        name: title,
        thumbnails: new Thumbnails([new Thumbnail(thumbnail, 720)]),
        author: makeAuthor(authorName, authorName, authorUrl, thumbnail),
        uploadDate: uploadDate,
        duration: duration,
        viewCount: viewCount,
        url: url,
        isLive: false,
        description: description,
        video: descriptor,
        dash: null,
        hls: null,
        live: []
    });
};

source.getComments = function(url, continuationToken) {
    return new NewgroundsCommentPager([], false, {url: url, continuationToken: continuationToken});
};

source.getSubComments = function(comment) {
    return new NewgroundsCommentPager([], false, {url: "", continuationToken: null});
};

class NewgroundsCommentPager extends CommentPager {
    constructor(results, hasMore, context) { super(results, hasMore, context); }
    nextPage() { return source.getComments(this.context.url, this.context.continuationToken); }
}

class NewgroundsHomeVideoPager extends VideoPager {
    constructor(results, hasMore, context) { super(results, hasMore, context); }
    nextPage() { return source.getHome(this.context.page); }
}

class NewgroundsSearchVideoPager extends VideoPager {
    constructor(results, hasMore, context) { super(results, hasMore, context); }
    nextPage() { return source.search(this.context.query, this.context.type, this.context.order, this.context.filters, this.context.page); }
}

class NewgroundsSearchChannelVideoPager extends VideoPager {
    constructor(results, hasMore, context) { super(results, hasMore, context); }
    nextPage() { return source.searchChannelContents(this.context.channelUrl, this.context.query, this.context.type, this.context.order, this.context.filters, this.context.page); }
}

class NewgroundsChannelPager extends ChannelPager {
    constructor(results, hasMore, context) { super(results, hasMore, context); }
    nextPage() { return source.searchChannels(this.context.query, this.context.page); }
}

class NewgroundsChannelVideoPager extends VideoPager {
    constructor(results, hasMore, context) { super(results, hasMore, context); }
    nextPage() { return source.getChannelContents(this.context.url, this.context.type, this.context.order, this.context.filters, this.context.page); }
}
