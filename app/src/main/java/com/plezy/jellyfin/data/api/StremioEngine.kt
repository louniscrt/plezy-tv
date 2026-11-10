package com.plezy.jellyfin.data.api

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.plezy.jellyfin.data.model.MediaItem
import com.plezy.jellyfin.data.model.MediaType
import kotlinx.coroutines.*
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.net.URLEncoder
import java.net.URLDecoder
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

/** Stremio HTTP protocol; account-specific manifests are supplied at runtime, never compiled in. */
class StremioEngine(config: JsonObject, private val http: OkHttpClient = OkHttpClient.Builder()
    .connectTimeout(5, TimeUnit.SECONDS).readTimeout(10, TimeUnit.SECONDS).callTimeout(12, TimeUnit.SECONDS).build()) {
    data class Stream(val url: String, val headers: Map<String, String> = emptyMap(), val priority: Int = 0)
    private val configured = config.getAsJsonArray("addons")?.map { base(if (it.isJsonPrimitive) it.asString else it.asJsonObject.get("manifestUrl").asString) }.orEmpty().distinct()
    private val backend = config.get("backendUrl")?.asString?.trimEnd('/')?.takeIf { it.toHttpUrlOrNull() != null }
    val enabled = configured.isNotEmpty() || backend != null
    private val frenchOnly = config.get("frenchOnly")?.asBoolean ?: true
    private val bases = (configured + if (enabled && config.get("metadataManifest")?.toString() != "false")
        listOf(base(config.get("metadataManifest")?.asString ?: "https://v3-cinemeta.strem.io/manifest.json")) else emptyList()).distinct()
    private val permits = Semaphore(4)
    private val manifests = ConcurrentHashMap<String, Pair<Long, JsonObject>>()
    private val known = ConcurrentHashMap<String, MediaItem>()
    private val cached = ConcurrentHashMap<String, Pair<Long, JsonObject>>()

    companion object {
        fun encode(value: String): String = URLEncoder.encode(value, "UTF-8").replace("+", "%20")
        fun key(type: String, id: String) = "stremio~$type~${encode(id)}"
        fun parse(key: String): Pair<String, String> {
            val parts = key.split('~', limit = 3)
            require(parts.size == 3 && parts[0] == "stremio" && parts[1] in listOf("movie", "series"))
            val id = URLDecoder.decode(parts[2], "UTF-8")
            require(id.isNotBlank() && id.length <= 512 && id.none { it.code < 32 })
            return parts[1] to id
        }
        fun base(input: String): String {
            val value = input.replace(Regex("^stremio://", RegexOption.IGNORE_CASE), "https://")
            val url = requireNotNull(value.toHttpUrlOrNull())
            require(url.username.isEmpty() && url.password.isEmpty() && url.query == null && url.fragment == null)
            return value.trimEnd('/').removeSuffix("/manifest.json").trimEnd('/')
        }
        fun isFrenchStream(stream: JsonObject): Boolean {
            val languages = listOfNotNull(stream.text("language")) + stream.strings("languages")
            if (languages.any { Regex("^(fr|fra|fre|french|francais|français)(?:[-_].*)?$", RegexOption.IGNORE_CASE).matches(it) }) return true
            val hints = stream.getAsJsonObject("behaviorHints")
            val text = listOfNotNull(stream.text("name"), stream.text("title"), stream.text("description"), hints?.text("filename")).joinToString(" ")
            if (text.contains("🇫🇷")) return true
            val release = hints?.text("filename") ?: stream.text("title") ?: ""
            val marker = Regex("(?:19|20)\\d{2}|(?:2160|1080|720|576|480)p", RegexOption.IGNORE_CASE).find(release)
            val tags = if (marker != null) release.substring(marker.range.last + 1) else release
            val strong = Regex("(?:^|[^a-z0-9])(?:truefrench|vff|vfq|vfi|vf|fra|fre|fr)(?:$|[^a-z0-9])", RegexOption.IGNORE_CASE)
            val french = Regex("(?:^|[^a-z0-9])(?:french|fran[cç]ais)(?:$|[^a-z0-9])", RegexOption.IGNORE_CASE)
            return strong.containsMatchIn(release) || french.containsMatchIn(tags) ||
                Regex("(?:audio|language|langue)\\s*[:=-]\\s*(?:french|fran[cç]ais|fr)\\b", RegexOption.IGNORE_CASE).containsMatchIn(text)
        }
        fun streamPriority(info: String): Int {
            val text = info.lowercase()
            return (if (Regex("h[ ._-]?264|x264|avc").containsMatchIn(text)) 40 else 0) +
                (if (Regex("\\.mp4\\b").containsMatchIn(text)) 40 else if (Regex("\\.webm\\b").containsMatchIn(text)) 20 else 0) +
                (if ("1080p" in text) 20 else if ("720p" in text) 10 else 0) -
                (if (Regex("2160p|\\b4k\\b").containsMatchIn(text)) 30 else 0) -
                (if (Regex("hevc|h[ ._-]?265|x265|av1|dolby.?vision|dovi").containsMatchIn(text)) 50 else 0)
        }
        private fun JsonObject.text(name: String): String? = get(name)?.takeIf { it.isJsonPrimitive }?.asString
        private fun JsonObject.strings(name: String): List<String> = getAsJsonArray(name)?.filter { it.isJsonPrimitive }?.map { it.asString }.orEmpty()
        private fun safeUrl(value: String?): String? = value?.takeIf { it.toHttpUrlOrNull()?.let { u -> u.username.isEmpty() && u.password.isEmpty() } == true }
    }
    private suspend fun json(url: String, ttl: Long = 60000): JsonObject = withContext(Dispatchers.IO) {
        cached[url]?.takeIf { it.first > System.currentTimeMillis() }?.let { return@withContext it.second }
        permits.withPermit {
            cached[url]?.takeIf { it.first > System.currentTimeMillis() }?.let { return@withPermit it.second }
            ((if (backend != null && url.startsWith(backend + "/")) http.newBuilder().callTimeout(60, TimeUnit.SECONDS).build() else http)).newCall(Request.Builder().url(url).header("Accept", "application/json").build()).execute().use { response ->
                check(response.isSuccessful) { "Addon indisponible (HTTP ${response.code})" }
                val body = checkNotNull(response.body)
                require(body.contentLength() <= 4 * 1024 * 1024) { "Réponse trop volumineuse" }
                val bytes = body.byteStream().use { stream ->
                    val out = java.io.ByteArrayOutputStream(); val buffer = ByteArray(8192)
                    while (true) { val count = stream.read(buffer); if (count < 0) break; require(out.size() + count <= 4 * 1024 * 1024); out.write(buffer, 0, count) }
                    out.toByteArray()
                }
                val data = JsonParser.parseString(String(bytes, Charsets.UTF_8)).asJsonObject
                if (cached.size > 256) cached.clear()
                cached[url] = System.currentTimeMillis() + ttl to data
                data
            }
        }
    }
    private suspend fun <T> isolated(block: suspend () -> T): T? = try { block() } catch (e: Exception) {
        if (e is CancellationException) throw e
        null
    }
    private suspend fun addons(): List<Pair<String, JsonObject>> = coroutineScope {
        bases.map { base -> async { isolated {
            val hit = manifests[base]
            val manifest = if (hit != null && hit.first > System.currentTimeMillis()) hit.second else json("$base/manifest.json", 1800000).also {
                manifests[base] = System.currentTimeMillis() + 1800000 to it
            }
            base to manifest
        } } }.awaitAll().filterNotNull()
    }
    private fun supports(manifest: JsonObject, resource: String, type: String, id: String): Boolean =
        manifest.getAsJsonArray("resources")?.any {
            val entry = if (it.isJsonPrimitive) JsonObject().apply { addProperty("name", it.asString) } else it.asJsonObject
            val types = if (entry.has("types")) entry.strings("types") else manifest.strings("types")
            val prefixes = if (entry.has("idPrefixes")) entry.strings("idPrefixes") else manifest.strings("idPrefixes")
            entry.text("name") == resource && type in types && (prefixes.isEmpty() || prefixes.any { p -> id.startsWith(p) })
        } == true

    private fun media(meta: JsonObject, type: String): MediaItem? {
        val id = meta.text("id") ?: return null
        val title = meta.text("name") ?: return null
        return MediaItem(id = key(type, id), title = title, type = if (type == "series") MediaType.SERIES else MediaType.MOVIE,
            overview = meta.text("description") ?: "", genres = meta.strings("genres"), castMembers = meta.strings("cast"),
            productionYear = (meta.text("releaseInfo") ?: meta.text("year"))?.take(4)?.toIntOrNull(),
            communityRating = meta.text("imdbRating")?.toDoubleOrNull(), tmdbId = meta.text("moviedb_id")?.toIntOrNull(),
            runtimeTicks = Regex("\\d+").find(meta.text("runtime") ?: "")?.value?.toLongOrNull()?.times(600000000L) ?: 0L,
            primaryImageUrl = safeUrl(meta.text("poster")), backdropImageUrl = safeUrl(meta.text("background") ?: meta.text("poster")),
            logoImageUrl = safeUrl(meta.text("logo"))).also { known[it.id] = it }
    }
    private fun backendItem(obj: JsonObject): MediaItem? {
        val id = obj.text("Id") ?: return null
        val kind = when (obj.text("Type")) { "Series" -> MediaType.SERIES; "Episode" -> MediaType.EPISODE; else -> MediaType.MOVIE }
        val art = obj.getAsJsonObject("stremioArt")
        val isSeerr = obj.get("seerr")?.asBoolean == true
        val primary = art?.text("Primary") ?: obj.text("posterPath")?.let { "https://image.tmdb.org/t/p/w500$it" }
        val backdrop = art?.text("Backdrop") ?: obj.text("backdropPath")?.let { "https://image.tmdb.org/t/p/w1280$it" }
        return MediaItem(id = id, title = obj.text("Name") ?: "", type = kind, overview = obj.text("Overview") ?: "",
            productionYear = obj.text("ProductionYear")?.toIntOrNull(), communityRating = obj.text("CommunityRating")?.toDoubleOrNull(),
            runtimeTicks = obj.text("RunTimeTicks")?.toLongOrNull() ?: 0L, genres = obj.strings("Genres"),
            tmdbId = if (isSeerr) obj.text("id")?.toIntOrNull() else obj.getAsJsonObject("ProviderIds")?.text("Tmdb")?.toIntOrNull(),
            isOverseerrItem = isSeerr, primaryImageUrl = primary, backdropImageUrl = backdrop, logoImageUrl = art?.text("Logo"),
            seriesId = obj.text("SeriesId"), seriesName = obj.text("SeriesName"),
            seasonNumber = obj.text("ParentIndexNumber")?.toIntOrNull(), episodeNumber = obj.text("IndexNumber")?.toIntOrNull(),
            episodeTitle = if (kind == MediaType.EPISODE) obj.text("Name") else null).also { known[it.id] = it }
    }
    suspend fun resolveTmdb(tmdbId: Int, series: Boolean): MediaItem? = isolated {
        val base = backend ?: return@isolated null
        val type = if (series) "series" else "movie"
        val data = json("$base/api/stremio/resolve?type=$type&tmdbId=$tmdbId")
        media(data.getAsJsonObject("meta"), type)
    }
    suspend fun requestDownload(item: MediaItem): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val base = checkNotNull(backend) { "Le serveur Plezy n'est pas configuré." }
            val payload = JsonObject().apply {
                addProperty("type", if (item.type == MediaType.SERIES || item.type == MediaType.EPISODE) "series" else "movie")
                if (item.tmdbId != null) addProperty("tmdbId", item.tmdbId) else addProperty("id", item.id)
            }
            val request = Request.Builder().url("$base/api/stremio/request").post(payload.toString().toRequestBody("application/json".toMediaType())).build()
            http.newCall(request).execute().use { response -> check(response.isSuccessful) { "La demande Seerr ne peut pas être envoyée (${response.code})." } }
            Result.success(Unit)
        } catch (error: Exception) { if (error is CancellationException) throw error; Result.failure(error) }
    }
    suspend fun catalog(types: List<String> = listOf("movie", "series"), search: String = "", limit: Int = 100): List<MediaItem> = coroutineScope {
        if (backend != null) {
            val type = if (types.size == 1) "&type=${types[0]}" else ""
            val data = json("$backend/api/stremio/catalog?limit=$limit$type&search=${encode(search)}")
            return@coroutineScope data.getAsJsonArray("Items")?.mapNotNull { backendItem(it.asJsonObject) }.orEmpty()
        }
        val jobs = addons().flatMap { (base, manifest) -> manifest.getAsJsonArray("catalogs")?.mapNotNull { element ->
            val c = element.asJsonObject; val type = c.text("type") ?: return@mapNotNull null
            val extras = c.getAsJsonArray("extra")?.map { it.asJsonObject }.orEmpty()
            if (type !in types || search.isNotBlank() && extras.none { it.text("name") == "search" } ||
                extras.any { it.get("isRequired")?.asBoolean == true && !(it.text("name") == "search" && search.isNotBlank()) && it.text("name") != "skip" }) return@mapNotNull null
            Triple(base, c, type)
        }.orEmpty() }
        jobs.map { (base, c, type) -> async { isolated {
            val extra = if (search.isNotBlank()) "/search=${encode(search)}" else ""
            val data = json("$base/catalog/$type/${encode(c.text("id") ?: "")}$extra.json")
            data.getAsJsonArray("metas")?.mapNotNull { media(it.asJsonObject, type) }.orEmpty()
        }.orEmpty() } }.awaitAll().flatten().distinctBy { it.id }.take(limit)
    }
    private suspend fun rawMeta(key: String): JsonObject? {
        val (type, id) = parse(key)
        if (backend != null) return isolated { json("$backend/api/stremio/raw-meta?id=${encode(key)}").getAsJsonObject("meta") }
        for ((base, manifest) in addons()) if (supports(manifest, "meta", type, id)) {
            isolated { json("$base/meta/$type/${encode(id)}.json").getAsJsonObject("meta") }?.let { return it }
        }
        return null
    }
    suspend fun details(key: String): MediaItem? = isolated {
        if (known[key]?.type == MediaType.EPISODE) return@isolated known[key]
        rawMeta(key)?.let { media(it, parse(key).first) } ?: known[key]
    }
    suspend fun episodes(key: String): Map<Int, List<MediaItem>> = isolated {
        if (backend != null) {
            val data = json("$backend/api/stremio/episodes?id=${encode(key)}")
            return@isolated data.getAsJsonArray("Items")?.mapNotNull { backendItem(it.asJsonObject) }?.groupBy { it.seasonNumber ?: 1 }.orEmpty()
        }
        val raw = rawMeta(key) ?: return@isolated emptyMap<Int, List<MediaItem>>()
        val series = media(raw, "series") ?: return@isolated emptyMap<Int, List<MediaItem>>()
        raw.getAsJsonArray("videos")?.mapNotNull {
            val v = it.asJsonObject; val id = v.text("id") ?: return@mapNotNull null
            val season = v.text("season")?.toIntOrNull() ?: return@mapNotNull null
            val episode = v.text("episode")?.toIntOrNull() ?: return@mapNotNull null
            series.copy(id = StremioEngine.key("series", id), type = MediaType.EPISODE, title = v.text("title") ?: v.text("name") ?: "Épisode $episode",
                seriesName = series.title, seriesId = series.id, seasonNumber = season, episodeNumber = episode,
                episodeTitle = v.text("title") ?: v.text("name"), overview = v.text("overview") ?: series.overview,
                primaryImageUrl = safeUrl(v.text("thumbnail")) ?: series.primaryImageUrl).also { known[it.id] = it }
        }?.sortedWith(compareBy({ it.seasonNumber }, { it.episodeNumber }))?.groupBy { it.seasonNumber ?: 1 }.orEmpty()
    }.orEmpty()
    suspend fun streams(key: String): List<Stream> = coroutineScope {
        val (type, id) = parse(key)
        if (backend != null) {
            val data = json("$backend/api/stremio/streams?id=${encode(key)}", 30000)
            return@coroutineScope data.getAsJsonArray("streams")?.mapNotNull {
                val path = it.asJsonObject.text("url") ?: return@mapNotNull null
                val hlsPath = path.replace("/media/", "/hls/") + "/master.m3u8"
                val url = backend.toHttpUrlOrNull()?.resolve(hlsPath)?.toString() ?: return@mapNotNull null
                Stream(url)
            }.orEmpty()
        }
        addons().filter { supports(it.second, "stream", type, id) }.map { (base, _) -> async { isolated {
            json("$base/stream/$type/${encode(id)}.json", 30000).getAsJsonArray("streams")?.mapNotNull {
                val s = it.asJsonObject; val url = safeUrl(s.text("url")) ?: return@mapNotNull null
                val hints = s.getAsJsonObject("behaviorHints")
                if (frenchOnly && !isFrenchStream(s)) return@mapNotNull null
                if (hints?.get("notWebReady")?.asBoolean == true || Regex("rd\\s+download", RegexOption.IGNORE_CASE).containsMatchIn(s.text("name") ?: "")) return@mapNotNull null
                val headers = hints?.getAsJsonObject("proxyHeaders")?.getAsJsonObject("request")?.entrySet()?.mapNotNull { (k, v) ->
                    if (k.lowercase() !in listOf("user-agent", "referer", "origin", "authorization", "cookie") || !v.isJsonPrimitive || v.asString.any { it == '\r' || it == '\n' }) null else k to v.asString
                }?.toMap().orEmpty()
                Stream(url, headers, streamPriority(listOfNotNull(s.text("name"), s.text("title"), hints?.text("filename")).joinToString(" ")))
            }.orEmpty()
        }.orEmpty() } }.awaitAll().flatten().sortedByDescending { it.priority }.distinctBy { it.url to it.headers }
    }
}
