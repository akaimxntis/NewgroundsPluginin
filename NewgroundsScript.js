const PLATFORM = "Newgrounds";
const BASE_URL = "https://www.newgrounds.com";
const USER_AGENT = "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36";
const CONFIG_ID = "4f480e7b-4161-4c6b-8864-fb6b8730b695";

const URL_MOVIES = BASE_URL + "/movies";
const URL_MOVIE_SEARCH = BASE_URL + "/search/conduct/movies?terms={0}&page={1}&inner=1";
const URL_CREATOR_PROFILE = "https://{0}.newgrounds.com";
const URL_CREATOR_MOVIES = "https://{0}.newgrounds.com/movies";
const URL_MOVIE_DETAILS = BASE_URL + "/portal/view/{0}";
const URL_MOVIE_API = BASE_URL + "/portal/video/{0}";

const REGEX_DETAILS_URL = /^https?:\/\/(?:www\.)?newgrounds\.com\/portal\/(?:view|video)\/(\d+)/i;
const REGEX_CHANNEL_URL = /^https?:\/\/([a-z0-9_-]+)\.newgrounds\.com(?:\/movies)?\/?(?:[?#].*)?$/i;

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
    const response = http.GET(url, getHeaders(extraHeaders));
    if (!response || response.body == null) {
        throw new ScriptException("HttpError", "Empty response from " + url);
    }
    return response;
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
        .replace(/&gt;/g, ">")
        .replace(/\\\//g, "/")
        .replace(/\\u002F/gi, "/")
        .replace(/\\u003A/gi, ":");
}

function absoluteUrl(url) {
    if (!url) return "";
    url = decodeEntities(String(url));
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
    const raw = String(value).replace(/,/g, "").trim();
    const n = parseInt(raw, 10);
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
    return domParser.parseFromString(html, "text/html");
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

function mediaPicon(id, ext) {
    const base = Math.floor(Number(id) / 1000) * 1000;
    return "https://picon.ngfiles.com/" + base + "/flash_" + id + "_" + ext;
}

function findThumbnail(card, mediaId) {
    if (card) {
        const img = card.querySelector("img");
        if (img) {
            const src = firstAttr(img, ["data-src", "data-original", "src"]);
            if (src) return absoluteUrl(src);
        }
    }
    return mediaId ? mediaPicon(mediaId, "card.png") : "";
}

function extractMediaId(url) {
    const m = String(url || "").match(/(?:portal\/(?:view|video)|audio\/listen)\/(\d+)/i);
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
    if (!card) return null;

    let link = null;
    try { link = card.querySelector("a.item-portalsubmission, a[href*='/portal/view/']"); } catch (_) {}
    if (!link) return null;

    const url = absoluteUrl(nodeAttr(link, "href"));
    const id = extractMediaId(url);
    if (!id) return null;

    let title = nodeAttr(link, "title");
    if (!title) title = nodeText(card.querySelector(".item-title, .title, h2, h3"));
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
    let uploadDate = 0;
    const time = card.querySelector("time");
    if (time) uploadDate = formatTimestamp(firstAttr(time, ["datetime", "content"])) || formatTimestamp(nodeText(time));

    return new PlatformVideo({
        id: new PlatformID(PLATFORM, id, CONFIG_ID),
        name: cleanText(title) || ("Newgrounds " + id),
        thumbnails: new Thumbnails([new Thumbnail(thumbnail, 720)]),
        author: makeAuthor(authorName, authorName, authorUrl, img ? firstAttr(img, ["src", "data-src"]) : thumbnail),
        uploadDate: uploadDate,
        duration: 0,
        viewCount: 0,
        url: url,
        isLive: false
    });
}

function extractVideosFromHtml(html) {
    const doc = parseDocument(html);
    const anchors = doc.querySelectorAll("a.item-portalsubmission, a[href*='/portal/view/']");
    const result = [];
    const seen = {};

    for (let i = 0; i < anchors.length; i++) {
        const anchor = anchors[i];
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

function mediaCandidate(value) {
    if (!value || typeof value !== "string") return null;
    let url = decodeEntities(value).replace(/[\\"'<>\s]+$/g, "");
    if (!/^https?:\/\//i.test(url)) return null;
    if (!/(?:\.mp4|\.webm|\.m3u8)(?:[?#]|$)/i.test(url)) return null;
    return url;
}

function collectMediaUrlsFromValue(root) {
    const found = [];
    const seen = {};

    function add(value) {
        const url = mediaCandidate(value);
        if (url && !seen[url]) {
            seen[url] = true;
            found.push(url);
        }
    }

    function walk(value) {
        if (value == null) return;
        if (typeof value === "string") {
            add(value);
            return;
        }
        if (Array.isArray(value)) {
            for (let i = 0; i < value.length; i++) walk(value[i]);
            return;
        }
        if (typeof value === "object") {
            for (const key in value) walk(value[key]);
        }
    }

    walk(root);
    return found;
}

function extractMediaUrlsFromHtml(html) {
    const urls = [];
    const seen = {};

    function add(value) {
        const url = mediaCandidate(value);
        if (url && !seen[url]) {
            seen[url] = true;
            urls.push(url);
        }
    }

    const normalized = String(html || "")
        .replace(/\\\//g, "/")
        .replace(/\\u002F/gi, "/")
        .replace(/\\u003A/gi, ":")
        .replace(/&amp;/g, "&");

    const doc = parseDocument(html);
    const mediaNodes = doc.querySelectorAll("video source, video, source, meta[property='og:video'], [data-video], [data-src]");
    for (let i = 0; i < mediaNodes.length; i++) {
        const node = mediaNodes[i];
        add(firstAttr(node, ["src", "data-src", "content", "data-video"]));
    }

    const patterns = [
        /https?:\/\/[^\s"'\\<>]+\.(?:mp4|webm)(?:\?[^\s"'\\<>]*)?/gi,
        /https?:\/\/[^\s"'\\<>]+\.m3u8(?:\?[^\s"'\\<>]*)?/gi
    ];

    for (let p = 0; p < patterns.length; p++) {
        const matches = normalized.match(patterns[p]) || [];
        for (let i = 0; i < matches.length; i++) add(matches[i]);
    }

    return urls;
}

function extractSources(id, pageHtml, duration) {
    let videoUrls = extractMediaUrlsFromHtml(pageHtml);
    let apiJson = null;

    try {
        const apiResp = get(URL_MOVIE_API.replace("{0}", id), {
            "Accept": "application/json",
            "Referer": URL_MOVIE_DETAILS.replace("{0}", id),
            "X-Requested-With": "XMLHttpRequest"
        });
        apiJson = JSON.parse(apiResp.body);
        videoUrls = videoUrls.concat(collectMediaUrlsFromValue(apiJson));
    } catch (_) {}

    const unique = [];
    const seen = {};
    for (let i = 0; i < videoUrls.length; i++) {
        const url = videoUrls[i];
        if (!seen[url]) {
            seen[url] = true;
            unique.push(url);
        }
    }

    const videoSources = [];
    const audioSources = [];

    for (let i = 0; i < unique.length; i++) {
        const url = unique[i];
        if (/\.m3u8(?:[?#]|$)/i.test(url)) continue;

        const quality = (url.match(/(?:\.|_)(\d{3,4})p(?:\.|\?|$)/i) || [])[1];
        const height = quality ? parseInt(quality, 10) : 0;
        videoSources.push(new VideoUrlSource({
            width: 0,
            height: height,
            container: /\.webm(?:[?#]|$)/i.test(url) ? "webm" : "mp4",
            codec: "",
            name: quality ? quality + "p" : "Source",
            bitrate: 0,
            duration: duration,
            url: url
        }));
    }

    return { videoSources, audioSources };
}

function getPageVideoMetadata(doc, api, id) {
    const titleNode = doc.querySelector("h1, .pod-description h2, meta[property='og:title']");
    const title = nodeText(titleNode) || (titleNode && nodeAttr(titleNode, "content")) || (api && api.title) || ("Newgrounds " + id);

    let authorName = "Newgrounds";
    let authorUrl = "";
    const authorLink = doc.querySelector("a[href$='.newgrounds.com'], a[href*='.newgrounds.com/']");
    if (authorLink) {
        authorName = nodeText(authorLink) || authorName;
        authorUrl = absoluteUrl(nodeAttr(authorLink, "href"));
    } else if (api && api.author) {
        authorName = cleanText(api.author);
    }

    const ogImage = doc.querySelector("meta[property='og:image']");
    const thumbnail = ogImage ? absoluteUrl(nodeAttr(ogImage, "content")) : mediaPicon(id, "card.png");

    const descNode = doc.querySelector("#author_comments, meta[property='og:description'], meta[name='description']");
    const description = descNode ? (String(descNode.tagName).toUpperCase() === "META" ? nodeAttr(descNode, "content") : nodeText(descNode)) : "";

    let uploadDate = 0;
    const dateNode = doc.querySelector("time[datetime], meta[itemprop='uploadDate'], meta[itemprop='datePublished']");
    if (dateNode) uploadDate = formatTimestamp(firstAttr(dateNode, ["datetime", "content"]));

    let duration = 0;
    const durationNode = doc.querySelector("meta[itemprop='duration'], [data-duration]");
    if (durationNode) duration = parseDuration(firstAttr(durationNode, ["content", "data-duration"]));

    let viewCount = 0;
    const bodyText = nodeText(doc);
    const viewMatch = bodyText.match(/(?:Views|Views:)\s*([\d,.]+)/i);
    if (viewMatch) viewCount = parseCount(viewMatch[1]);

    return {
        title: cleanText(title),
        authorName,
        authorUrl,
        thumbnail,
        description: cleanText(description),
        uploadDate,
        duration,
        viewCount
    };
}

function makePager(results, hasMore, context, PagerClass) {
    return new PagerClass(results, hasMore, context);
}

source.getHome = function (continuationToken) {
    const page = continuationToken ? Number(continuationToken) : 1;
    const url = page <= 1 ? URL_MOVIES : URL_MOVIES + "?page=" + page;
    const resp = get(url);
    const videos = extractVideosFromHtml(resp.body);
    return new NewgroundsHomeVideoPager(videos, videos.length > 0, { page: page + 1 });
};

source.searchSuggestions = function (query) {
    return query ? [query] : [];
};

source.getSearchCapabilities = function () {
    return new ResultCapabilities(
        [Type.Feed.Mixed],
        [Type.Order.Chronological],
        []
    );
};

source.search = function (query, type, order, filters, continuationToken) {
    const page = continuationToken ? Number(continuationToken) : 1;
    const q = encodeURIComponent(query || "");
    const resp = get(URL_MOVIE_SEARCH.replace("{0}", q).replace("{1}", String(page)), {
        "X-Requested-With": "XMLHttpRequest"
    });
    const videos = extractVideosFromHtml(resp.body);
    return new NewgroundsSearchVideoPager(videos, videos.length > 0, {
        query: query,
        type: type,
        order: order,
        filters: filters,
        page: page + 1
    });
};

source.getSearchChannelVideoCapabilities = function () {
    return new ResultCapabilities(
        [Type.Feed.Mixed],
        [Type.Order.Chronological],
        []
    );
};

source.searchChannelVideos = function (url, query, type, order, filters, continuationToken) {
    const page = continuationToken ? Number(continuationToken) : 1;
    const base = String(url).replace(/\/?$/, "") + "/movies";
    const resp = get(base + "?page=" + page, {
        "X-Requested-With": "XMLHttpRequest"
    });
    let videos = extractVideosFromHtml(resp.body);
    if (query) {
        const q = String(query).toLowerCase();
        videos = videos.filter(v => String(v.name || "").toLowerCase().indexOf(q) >= 0);
    }
    return new NewgroundsSearchChannelVideoPager(videos, videos.length > 0, {
        channelUrl: url,
        query: query,
        type: type,
        order: order,
        filters: filters,
        page: page + 1
    });
};

source.isChannelUrl = function (url) {
    return REGEX_CHANNEL_URL.test(url || "");
};

source.getChannel = function (url) {
    const m = String(url).match(REGEX_CHANNEL_URL);
    if (!m) throw new ScriptException("InvalidChannel", "Invalid Newgrounds channel URL");

    const username = m[1];
    const profileUrl = URL_CREATOR_PROFILE.replace("{0}", username);
    const resp = get(profileUrl);
    const doc = parseDocument(resp.body);

    const title = doc.querySelector("h1, .user-header-name, .profile-name, meta[property='og:title']");
    const desc = doc.querySelector("meta[name='description'], meta[property='og:description']");
    const image = doc.querySelector("meta[property='og:image'], .user-header img, .avatar img");

    return new PlatformChannel({
        id: username,
        name: nodeText(title) || nodeAttr(title, "content") || username,
        thumbnail: image ? firstAttr(image, ["content", "src", "data-src"]) : "",
        banner: "",
        subscribers: 0,
        description: desc ? nodeAttr(desc, "content") : "",
        url: URL_CREATOR_MOVIES.replace("{0}", username),
        links: {}
    });
};

source.getChannelVideos = function (url, type, order, filters, continuationToken) {
    const page = continuationToken ? Number(continuationToken) : 1;
    const base = String(url).replace(/\/?$/, "") + "/movies";
    const resp = get(base + "?page=" + page);
    const videos = extractVideosFromHtml(resp.body);
    return new NewgroundsChannelVideoPager(videos, videos.length > 0, {
        url: url,
        type: type,
        order: order,
        filters: filters,
        page: page + 1
    });
};

source.getChannelCapabilities = function () {
    return new ResultCapabilities(
        [Type.Feed.Mixed],
        [Type.Order.Chronological],
        []
    );
};

source.isVideoDetailsUrl = function (url) {
    return REGEX_DETAILS_URL.test(url || "");
};

source.getVideoDetails = function (url) {
    const m = String(url).match(REGEX_DETAILS_URL);
    if (!m) throw new ScriptException("InvalidContent", "Invalid Newgrounds movie URL");

    const id = m[1];
    const pageUrl = URL_MOVIE_DETAILS.replace("{0}", id);
    const pageResp = get(pageUrl, {
        "Referer": BASE_URL + "/movies"
    });
    const html = pageResp.body;
    const doc = parseDocument(html);

    let api = null;
    try {
        const apiResp = get(URL_MOVIE_API.replace("{0}", id), {
            "Accept": "application/json",
            "Referer": pageUrl,
            "X-Requested-With": "XMLHttpRequest"
        });
        api = JSON.parse(apiResp.body);
    } catch (_) {}

    const meta = getPageVideoMetadata(doc, api, id);
    const sources = extractSources(id, html, meta.duration);

    if (sources.videoSources.length === 0 && sources.audioSources.length === 0) {
        throw new ScriptException("NoSource", "Newgrounds did not expose a playable media URL for this movie");
    }

    let descriptor;
    if (sources.audioSources.length > 0 && sources.videoSources.length > 0) {
        descriptor = new UnMuxVideoSourceDescriptor(sources.videoSources, sources.audioSources);
    } else {
        descriptor = new MuxVideoSourceDescriptor({
            isUnMuxed: false,
            videoSources: sources.videoSources
        });
    }

    return new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, id, CONFIG_ID),
        name: meta.title,
        thumbnails: new Thumbnails([new Thumbnail(meta.thumbnail, 720)]),
        author: makeAuthor(meta.authorName, meta.authorName, meta.authorUrl, meta.thumbnail),
        uploadDate: meta.uploadDate,
        duration: meta.duration,
        viewCount: meta.viewCount,
        url: pageUrl,
        isLive: false,
        description: meta.description,
        video: descriptor,
        dash: null,
        hls: null,
        live: []
    });
};

source.getComments = function (url, continuationToken) {
    return new NewgroundsCommentPager([], false, { url: url, continuationToken: continuationToken });
};

source.getSubComments = function (comment) {
    return new NewgroundsCommentPager([], false, { url: "", continuationToken: null });
};

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
    nextPage() {
        return source.search(this.context.query, this.context.type, this.context.order, this.context.filters, String(this.context.page));
    }
}

class NewgroundsSearchChannelVideoPager extends VideoPager {
    constructor(results, hasMore, context) { super(results, hasMore, context); }
    nextPage() {
        return source.searchChannelVideos(
            this.context.channelUrl,
            this.context.query,
            this.context.type,
            this.context.order,
            this.context.filters,
            String(this.context.page)
        );
    }
}

class NewgroundsChannelVideoPager extends VideoPager {
    constructor(results, hasMore, context) { super(results, hasMore, context); }
    nextPage() {
        return source.getChannelVideos(
            this.context.url,
            this.context.type,
            this.context.order,
            this.context.filters,
            String(this.context.page)
        );
    }
}
