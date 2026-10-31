package com.plezy.jellyfin.data.api

import android.content.Context
import android.os.Build
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.plezy.jellyfin.data.model.CastMember
import com.plezy.jellyfin.data.model.ChapterInfo
import com.plezy.jellyfin.data.model.JellyfinUser
import com.plezy.jellyfin.data.model.MediaItem
import com.plezy.jellyfin.data.model.MediaTrack
import com.plezy.jellyfin.data.model.MediaType
import com.plezy.jellyfin.util.CodecDetector
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.net.URLEncoder
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.UUID
import java.util.concurrent.TimeUnit

/**
 * Client API Jellyfin complet pour Plezy TV (Android 5.1 / API 22) :
 * - Authentification, Reprise (Continue Watching), Ajouts récents, Recommandations, Collections, Playlists
 * - Recherche temps réel (`/Users/{userId}/Items?SearchTerm=...`)
 * - Marquage Vu / Non-vu (`POST / DELETE /Users/{userId}/PlayedItems/{id}`)
 * - Rapport de progression de lecture (`POST /Sessions/Playing/Progress`)
 * - Sélection de qualité / transcodage HLS et pistes audio / sous-titres
 */
class JellyfinClient(context: Context) {

    private val prefs = context.getSharedPreferences("plezy_jellyfin_prefs", Context.MODE_PRIVATE)

    private val httpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    var serverUrl: String
        get() = prefs.getString("server_url", "")?.trimEnd('/') ?: ""
        set(value) = prefs.edit().putString("server_url", value.trim().trimEnd('/')).apply()

    var accessToken: String
        get() = prefs.getString("access_token", "") ?: ""
        set(value) = prefs.edit().putString("access_token", value).apply()

    var userId: String
        get() = prefs.getString("user_id", "") ?: ""
        set(value) = prefs.edit().putString("user_id", value).apply()

    var currentUserName: String
        get() = prefs.getString("user_name", "Tom") ?: "Tom"
        set(value) = prefs.edit().putString("user_name", value).apply()

    var isDemoMode: Boolean
        get() = prefs.getBoolean("is_demo_mode", false)
        set(value) = prefs.edit().putBoolean("is_demo_mode", value).apply()

    private val deviceId: String by lazy {
        var saved = prefs.getString("device_id", null)
        if (saved == null) {
            saved = UUID.randomUUID().toString()
            prefs.edit().putString("device_id", saved).apply()
        }
        saved
    }

    fun isConfigured(): Boolean = isDemoMode || (serverUrl.isNotBlank() && accessToken.isNotBlank() && userId.isNotBlank())

    /**
     * Nettoie le nom de l'appareil pour éviter les caractères invalides dans l'en-tête HTTP
     * (sinon Jellyfin 10.8 / 10.9+ rejette la requête avec HTTP 400 Bad Request).
     */
    private val safeDeviceName: String by lazy {
        val raw = Build.MODEL ?: "FireTV"
        raw.replace(Regex("[^a-zA-Z0-9 _.-]"), "").trim().ifBlank { "AmazonFireTV" }
    }

    /**
     * Construit l'en-tête d'authentification MediaBrowser.
     * IMPORTANT : Lors de l'appel à `/Users/AuthenticateByName`, `includeToken` DOIT être `false`,
     * sinon Jellyfin renvoie `HTTP 400 Bad Request` si un Token vide ou expiré est présent.
     */
    private fun buildAuthHeader(includeToken: Boolean = true): String {
        val base = "MediaBrowser Client=\"PlezyTV\", Device=\"$safeDeviceName\", DeviceId=\"$deviceId\", Version=\"1.0.0\""
        return if (includeToken && accessToken.isNotBlank()) "$base, Token=\"$accessToken\"" else base
    }

    /**
     * Normalise l'URL saisie par l'utilisateur (ajoute `http://` si omis, supprime `/web/index.html` éventuel).
     */
    private fun normalizeServerUrl(input: String): String {
        var clean = input.trim()
        if (!clean.startsWith("http://", ignoreCase = true) && !clean.startsWith("https://", ignoreCase = true)) {
            clean = "http://$clean"
        }

        val webIndex = clean.indexOf("/web", ignoreCase = true)
        if (webIndex > 0) {
            clean = clean.substring(0, webIndex)
        }
        val hashIndex = clean.indexOf("/#", ignoreCase = true)
        if (hashIndex > 0) {
            clean = clean.substring(0, hashIndex)
        }
        clean = clean.trimEnd('/')
        return clean
    }

    private fun buildCandidateUrls(url: String): List<String> {
        val baseCandidate = normalizeServerUrl(url)
        val candidates = mutableListOf<String>()
        candidates.add(baseCandidate)

        val afterScheme = baseCandidate.substringAfter("://")
        val hostPart = afterScheme.substringBefore("/")
        if (!hostPart.contains(":") && baseCandidate.startsWith("http://", ignoreCase = true)) {
            val with8096 = "http://$hostPart:8096" + afterScheme.substringAfter(hostPart, "")
            candidates.add(with8096.trimEnd('/'))
        }
        if (!baseCandidate.endsWith("/jellyfin", ignoreCase = true)) {
            candidates.add("$baseCandidate/jellyfin")
        }
        return candidates.distinct()
    }

    data class QuickConnectState(
        val code: String,
        val secret: String,
        val resolvedServerUrl: String
    )

    /**
     * Démarre une session Quick Connect (`POST /QuickConnect/Initiate`) et retourne le code à 6 chiffres
     * à saisir sur l'interface Web Jellyfin (/web/#/quickconnect).
     */
    suspend fun initiateQuickConnect(url: String): Result<QuickConnectState> = withContext(Dispatchers.IO) {
        try {
            val candidates = buildCandidateUrls(url)
            var lastError = "Quick Connect indisponible"

            for (candidateUrl in candidates) {
                val authHeader = buildAuthHeader(includeToken = false)
                val emptyBody = ByteArray(0).toRequestBody(null, 0, 0)
                val request = Request.Builder()
                    .url("$candidateUrl/QuickConnect/Initiate")
                    .header("Accept", "application/json")
                    .header("X-Emby-Authorization", authHeader)
                    .header("Authorization", authHeader)
                    .post(emptyBody)
                    .build()

                httpClient.newCall(request).execute().use { response ->
                    val responseBody = response.body?.string().orEmpty()
                    if (response.isSuccessful && responseBody.trim().startsWith("{")) {
                        val json = JsonParser.parseString(responseBody).asJsonObject
                        val code = json.get("Code")?.asString.orEmpty()
                        val secret = json.get("Secret")?.asString.orEmpty()
                        if (code.isNotBlank() && secret.isNotBlank()) {
                            serverUrl = candidateUrl
                            return@withContext Result.success(
                                QuickConnectState(code = code, secret = secret, resolvedServerUrl = candidateUrl)
                            )
                        }
                    } else {
                        lastError = "HTTP ${response.code}"
                    }
                }
            }
            Result.failure(Exception(lastError))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Vérifie si l'utilisateur a autorisé le code Quick Connect (`GET /QuickConnect/Connect?secret=...`)
     * et, dès que `Authenticated == true`, échange le secret contre un AccessToken (`POST /Users/AuthenticateWithQuickConnect`).
     */
    suspend fun checkAndAuthenticateQuickConnect(state: QuickConnectState): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            val authHeader = buildAuthHeader(includeToken = false)
            val checkRequest = Request.Builder()
                .url("${state.resolvedServerUrl}/QuickConnect/Connect?secret=${state.secret}")
                .header("Accept", "application/json")
                .header("X-Emby-Authorization", authHeader)
                .header("Authorization", authHeader)
                .get()
                .build()

            var isAuthorized = false
            httpClient.newCall(checkRequest).execute().use { response ->
                if (!response.isSuccessful) return@withContext Result.success(false)
                val bodyStr = response.body?.string().orEmpty()
                if (bodyStr.trim().startsWith("{")) {
                    val json = JsonParser.parseString(bodyStr).asJsonObject
                    isAuthorized = json.get("Authenticated")?.asBoolean ?: false
                }
            }

            if (!isAuthorized) {
                return@withContext Result.success(false)
            }

            // Échange du Secret contre le jeton de session Jellyfin
            val payload = JsonObject().apply {
                addProperty("Secret", state.secret)
            }
            val postBody = payload.toString().toRequestBody("application/json; charset=utf-8".toMediaType())
            val authRequest = Request.Builder()
                .url("${state.resolvedServerUrl}/Users/AuthenticateWithQuickConnect")
                .header("Accept", "application/json")
                .header("X-Emby-Authorization", authHeader)
                .header("Authorization", authHeader)
                .post(postBody)
                .build()

            httpClient.newCall(authRequest).execute().use { response ->
                val responseBody = response.body?.string().orEmpty()
                if (response.isSuccessful && responseBody.trim().startsWith("{")) {
                    val json = JsonParser.parseString(responseBody).asJsonObject
                    val token = json.get("AccessToken")?.asString.orEmpty()
                    val userObj = json.getAsJsonObject("User")
                    val uid = userObj?.get("Id")?.asString.orEmpty()
                    val uname = userObj?.get("Name")?.asString ?: "lounis"

                    if (token.isNotBlank() && uid.isNotBlank()) {
                        serverUrl = state.resolvedServerUrl
                        accessToken = token
                        userId = uid
                        currentUserName = uname
                        isDemoMode = false
                        return@withContext Result.success(true)
                    }
                }
                Result.failure(Exception("Erreur d'échange Quick Connect HTTP ${response.code}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun authenticate(url: String, username: String, password: String): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val candidates = buildCandidateUrls(url)
            var lastError = "HTTP 400"

            for (candidateUrl in candidates) {
                val payload = JsonObject().apply {
                    addProperty("Username", username.trim())
                    addProperty("Pw", password)
                    addProperty("Password", password) // Compatibilité anciennes et nouvelles versions Jellyfin
                }
                val authHeader = buildAuthHeader(includeToken = false)
                val body = payload.toString().toRequestBody("application/json; charset=utf-8".toMediaType())
                val request = Request.Builder()
                    .url("$candidateUrl/Users/AuthenticateByName")
                    .header("Accept", "application/json")
                    .header("X-Emby-Authorization", authHeader)
                    .header("Authorization", authHeader)
                    .post(body)
                    .build()

                httpClient.newCall(request).execute().use { response ->
                    val responseBody = response.body?.string().orEmpty()
                    if (response.isSuccessful && responseBody.trim().startsWith("{")) {
                        val json = JsonParser.parseString(responseBody).asJsonObject
                        val token = json.get("AccessToken")?.asString.orEmpty()
                        val userObj = json.getAsJsonObject("User")
                        val uid = userObj?.get("Id")?.asString.orEmpty()
                        val uname = userObj?.get("Name")?.asString ?: username.trim()

                        if (token.isNotBlank() && uid.isNotBlank()) {
                            serverUrl = candidateUrl
                            accessToken = token
                            userId = uid
                            currentUserName = uname
                            isDemoMode = false
                            return@withContext Result.success(Unit)
                        }
                    } else {
                        val detail = responseBody.take(120).replace("\n", " ").trim()
                        lastError = if (detail.isNotBlank()) {
                            "HTTP ${response.code} ($detail)"
                        } else {
                            "HTTP ${response.code}"
                        }
                    }
                }
            }

            Result.failure(Exception(lastError))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Récupère la liste des utilisateurs du serveur Jellyfin (`/Users/Public` ou `/Users`)
     * pour le bouton de changement rapide de profil en haut à droite de l'écran d'accueil.
     */
    suspend fun getPublicUsers(): List<JellyfinUser> = withContext(Dispatchers.IO) {
        if (isDemoMode || serverUrl.isBlank()) {
            return@withContext listOf(
                JellyfinUser("demo_tom", "Tom (Principal)", false),
                JellyfinUser("demo_guest", "Salon TV", false),
                JellyfinUser("demo_kids", "Enfants", false)
            )
        }
        try {
            val authHeader = buildAuthHeader()
            val request = Request.Builder()
                .url("$serverUrl/Users/Public")
                .header("Accept", "application/json")
                .header("X-Emby-Authorization", authHeader)
                .header("Authorization", authHeader)
                .get()
                .build()
            httpClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@withContext emptyList()
                val arr = JsonParser.parseString(response.body?.string().orEmpty()).asJsonArray
                val users = mutableListOf<JellyfinUser>()
                for (el in arr) {
                    val obj = el.asJsonObject
                    users.add(
                        JellyfinUser(
                            id = obj.get("Id")?.asString.orEmpty(),
                            name = obj.get("Name")?.asString.orEmpty(),
                            hasPassword = obj.get("HasPassword")?.asBoolean ?: false,
                            primaryImageTag = obj.get("PrimaryImageTag")?.asString
                        )
                    )
                }
                users
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    suspend fun getContinueWatching(): List<MediaItem> = withContext(Dispatchers.IO) {
        if (isDemoMode || !isConfigured()) return@withContext DemoCatalog.continueWatching
        val resumeEndpoint = "$serverUrl/Users/$userId/Items/Resume?Limit=12&Recursive=true" +
                "&Fields=Overview,PrimaryImageAspectRatio,MediaSources,Chapters,CommunityRating,CriticRating,OfficialRating,Genres,People,PremiereDate" +
                "&MediaTypes=Video"
        val resumed = fetchItemsList(resumeEndpoint)

        resumed.distinctBy { it.id }
    }

    suspend fun getRecentlyAddedMovies(): List<MediaItem> = withContext(Dispatchers.IO) {
        if (isDemoMode || !isConfigured()) return@withContext DemoCatalog.movies
        val endpoint = "$serverUrl/Users/$userId/Items?Recursive=true&IncludeItemTypes=Movie" +
                "&SortBy=DateCreated,SortName&SortOrder=Descending&Limit=20" +
                "&Fields=Overview,MediaSources,Chapters,CommunityRating,CriticRating,OfficialRating,Genres,People,PremiereDate"
        fetchItemsList(endpoint)
    }

    suspend fun getRecentlyAdded(includeItemTypes: String = "Series"): List<MediaItem> = withContext(Dispatchers.IO) {
        if (isDemoMode || !isConfigured()) return@withContext DemoCatalog.recentlyAddedShows
        val endpoint = "$serverUrl/Users/$userId/Items?Recursive=true&IncludeItemTypes=$includeItemTypes" +
                "&SortBy=DateCreated,SortName&SortOrder=Descending&Limit=20" +
                "&Fields=Overview,MediaSources,Chapters,CommunityRating,CriticRating,OfficialRating,Genres,People,ChildCount,PremiereDate"
        fetchItemsList(endpoint)
    }

    /**
     * Catalogue filtrable par onglet Plezy (Recommended, Browse, Collections, Playlists),
     * par type (Series, Movie) et par tri (SortName, CommunityRating, DateCreated, ProductionYear).
     */
    suspend fun getLibraryCatalog(
        tab: String = "Browse",
        includeItemTypes: String = "Series",
        sortBy: String = "SortName",
        sortOrder: String = "Ascending",
        onlyUnplayed: Boolean = false
    ): List<MediaItem> = withContext(Dispatchers.IO) {
        if (isDemoMode || !isConfigured()) {
            val base = when (tab) {
                "Collections" -> DemoCatalog.collections
                "Playlists" -> DemoCatalog.playlists
                "Recommended" -> DemoCatalog.libraryShows.sortedByDescending { it.communityRating ?: 0.0 }
                else -> if (includeItemTypes == "Movie") DemoCatalog.movies else DemoCatalog.libraryShows
            }
            val filtered = if (onlyUnplayed) base.filter { (it.unplayedItemCount ?: 1) > 0 } else base
            return@withContext when (sortBy) {
                "CommunityRating" -> filtered.sortedByDescending { it.communityRating ?: 0.0 }
                "ProductionYear" -> filtered.sortedByDescending { it.productionYear ?: 0 }
                else -> filtered.sortedBy { it.title }
            }
        }

        val targetTypes = when (tab) {
            "Collections" -> "BoxSet"
            "Playlists" -> "Playlist"
            else -> includeItemTypes
        }
        val targetSort = if (tab == "Recommended") "CommunityRating,SortName" else sortBy
        val targetOrder = if (tab == "Recommended") "Descending" else sortOrder
        val filterParam = if (onlyUnplayed) "&Filters=IsUnplayed" else ""

        val endpoint = "$serverUrl/Users/$userId/Items?Recursive=true" +
                "&IncludeItemTypes=$targetTypes" +
                "&SortBy=$targetSort&SortOrder=$targetOrder" +
                "$filterParam&Limit=60" +
                "&Fields=Overview,CommunityRating,OfficialRating,MediaSources,Chapters,Genres,People,ProviderIds"
        fetchItemsList(endpoint)
    }

    /**
     * Recherche globale Jellyfin (Films, Séries, Épisodes)
     */
    suspend fun searchItems(query: String): List<MediaItem> = withContext(Dispatchers.IO) {
        if (query.isBlank()) return@withContext emptyList()
        if (isDemoMode || !isConfigured()) {
            val all = DemoCatalog.continueWatching + DemoCatalog.libraryShows + DemoCatalog.movies
            return@withContext all.distinctBy { it.id }.filter {
                it.title.contains(query, ignoreCase = true) ||
                        it.subtitle.contains(query, ignoreCase = true) ||
                        it.overview.contains(query, ignoreCase = true)
            }
        }
        val encoded = URLEncoder.encode(query.trim(), "UTF-8")
        val endpoint = "$serverUrl/Users/$userId/Items?Recursive=true" +
                "&SearchTerm=$encoded&IncludeItemTypes=Movie,Series,Episode&Limit=30" +
                "&Fields=Overview,CommunityRating,OfficialRating,MediaSources,Chapters,Genres,People,ProviderIds"
        fetchItemsList(endpoint)
    }

    suspend fun getEpisodesBySeason(seriesId: String): Map<Int, List<MediaItem>> = withContext(Dispatchers.IO) {
        if (seriesId.startsWith("seerr_")) return@withContext emptyMap()
        if (isDemoMode || !isConfigured()) return@withContext DemoCatalog.getSeasonsForSeries(seriesId)
        val endpoint = "$serverUrl/Shows/$seriesId/Episodes?UserId=$userId" +
                "&Fields=Overview,MediaSources,Chapters,CommunityRating,CriticRating,OfficialRating,PremiereDate,People"
        val episodes = fetchItemsList(endpoint)
        episodes.groupBy { it.seasonNumber ?: 1 }.toSortedMap()
    }

    /**
     * Marque un média comme Vu ou Non-vu sur le serveur Jellyfin (`✓` sur `tv-md`)
     */
    suspend fun setPlayedStatus(itemId: String, played: Boolean): Boolean = withContext(Dispatchers.IO) {
        if (isDemoMode || !isConfigured()) return@withContext true
        try {
            val authHeader = buildAuthHeader()
            val url = "$serverUrl/Users/$userId/PlayedItems/$itemId"
            val builder = Request.Builder()
                .url(url)
                .header("Accept", "application/json")
                .header("X-Emby-Authorization", authHeader)
                .header("Authorization", authHeader)
            val request = if (played) {
                builder.post("".toRequestBody("application/json".toMediaType())).build()
            } else {
                builder.delete().build()
            }
            httpClient.newCall(request).execute().use { it.isSuccessful }
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Envoie la progression de lecture au serveur Jellyfin pour alimenter "Continue Watching"
     */
    suspend fun reportPlaybackProgress(itemId: String, positionTicks: Long, isPaused: Boolean, event: String = "Progress") = withContext(Dispatchers.IO) {
        if (isDemoMode || !isConfigured()) return@withContext
        try {
            val payload = JsonObject().apply {
                addProperty("ItemId", itemId)
                addProperty("PositionTicks", positionTicks)
                addProperty("IsPaused", isPaused)
                addProperty("CanSeek", true)
            }
            val authHeader = buildAuthHeader()
            val request = Request.Builder()
                .url("$serverUrl/Sessions/Playing" + if (event.isEmpty()) "" else "/$event")
                .header("Accept", "application/json")
                .header("X-Emby-Authorization", authHeader)
                .header("Authorization", authHeader)
                .post(payload.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
                .build()
            httpClient.newCall(request).execute().close()
        } catch (_: Exception) {
        }
    }

    /**
     * Construit l'URL de lecture vidéo en prenant en compte :
     * - Le mode automatique (Direct Play H.264 vs Transcodage HLS pour HEVC/4K sur API 22)
     * - Le débit maximum choisi dans l'overlay Qualité (`maxBitrateMbps`)
     * - L'index de piste audio et de sous-titres choisi dans l'overlay du lecteur
     */
    fun buildPlaybackUrl(
        item: MediaItem,
        forceTranscodeBitrate: Int? = null,
        audioStreamIndex: Int? = null,
        subtitleStreamIndex: Int? = null
    ): String {
        if (isDemoMode || serverUrl.isBlank()) {
            return "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4"
        }

        val canDirectPlay = forceTranscodeBitrate == null && audioStreamIndex == null &&
                (item.audioCodec == null || item.audioCodec.lowercase() in listOf("aac", "mp3", "ac3", "eac3")) &&
                CodecDetector.canDirectPlay(item.videoCodec, item.videoWidth) &&
                (subtitleStreamIndex == null || subtitleStreamIndex < 0)

        return if (canDirectPlay) {
            "$serverUrl/Videos/${item.id}/stream?static=true&MediaSourceId=${item.mediaSourceId ?: item.id}&api_key=$accessToken"
        } else {
            val bitrate = forceTranscodeBitrate ?: 8_000_000
            val maxHeight = if (bitrate <= 1_500_000) 480 else if (bitrate <= 4_000_000) 720 else 1080
            val maxWidth = if (maxHeight == 480) 854 else if (maxHeight == 720) 1280 else 1920
            val audioParam = audioStreamIndex?.let { "&AudioStreamIndex=$it" } ?: ""
            val subParam = if (subtitleStreamIndex != null && subtitleStreamIndex >= 0) {
                "&SubtitleStreamIndex=$subtitleStreamIndex&SubtitleMethod=Encode"
            } else "&SubtitleStreamIndex=-1"

            "$serverUrl/Videos/${item.id}/master.m3u8" +
                    "?MediaSourceId=${item.mediaSourceId ?: item.id}" +
                    "&DeviceId=$deviceId" +
                    "&VideoCodec=h264" +
                    "&AudioCodec=aac" +
                    "&MaxStreamingBitrate=$bitrate" +
                    "&MaxWidth=$maxWidth" +
                    "&MaxHeight=$maxHeight" +
                    "&TranscodingMaxAudioChannels=2" +
                    "$audioParam$subParam" +
                    "&SegmentContainer=ts" +
                    "&MinSegments=1" +
                    "&api_key=$accessToken"
        }
    }

    suspend fun getItemDetails(id: String): MediaItem? = withContext(Dispatchers.IO) {
        if (isDemoMode) return@withContext null
        try {
            val request = Request.Builder().url("$serverUrl/Users/$userId/Items/$id")
                .header("X-Emby-Authorization", buildAuthHeader()).build()
            httpClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) null else parseMediaItem(JsonParser.parseString(response.body?.string().orEmpty()).asJsonObject)
            }
        } catch (_: Exception) { null }
    }

    suspend fun resolveSeerrItem(item: MediaItem): MediaItem? = withContext(Dispatchers.IO) {
        val tmdb = item.tmdbId ?: return@withContext null
        val type = if (item.type == MediaType.SERIES) "Series" else "Movie"
        fetchItemsList("$serverUrl/Users/$userId/Items?Recursive=true&IncludeItemTypes=$type&AnyProviderIdEquals=tmdb.$tmdb&Fields=MediaSources,Chapters,Overview,People,Genres,ProviderIds").firstOrNull { it.tmdbId == tmdb }
    }

    suspend fun getCollectionItems(id: String): List<MediaItem> = withContext(Dispatchers.IO) {
        fetchItemsList("$serverUrl/Users/$userId/Items?ParentId=$id&Fields=MediaSources,Overview,ProviderIds")
    }

    suspend fun setFavorite(id: String, favorite: Boolean): Boolean = withContext(Dispatchers.IO) {
        if (isDemoMode) return@withContext true
        try {
            val builder = Request.Builder().url("$serverUrl/Users/$userId/FavoriteItems/$id")
                .header("X-Emby-Authorization", buildAuthHeader())
            val request = if (favorite) builder.post("".toRequestBody(null)).build() else builder.delete().build()
            httpClient.newCall(request).execute().use { it.isSuccessful }
        } catch (_: Exception) { false }
    }

    private fun fetchItemsList(url: String, isLatestEndpoint: Boolean = false): List<MediaItem> {
        return try {
            val authHeader = buildAuthHeader()
            val request = Request.Builder()
                .url(url)
                .header("Accept", "application/json")
                .header("X-Emby-Authorization", authHeader)
                .header("Authorization", authHeader)
                .get()
                .build()

            httpClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return emptyList()
                val raw = response.body?.string() ?: return emptyList()
                val element = JsonParser.parseString(raw)
                val itemsArray = if (isLatestEndpoint && element.isJsonArray) {
                    element.asJsonArray
                } else if (element.isJsonObject && element.asJsonObject.has("Items")) {
                    element.asJsonObject.getAsJsonArray("Items")
                } else {
                    return emptyList()
                }

                val result = mutableListOf<MediaItem>()
                for (itemEl in itemsArray) {
                    if (itemEl.isJsonObject) {
                        result.add(parseMediaItem(itemEl.asJsonObject))
                    }
                }
                result
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    private fun parseMediaItem(obj: JsonObject): MediaItem {
        val id = obj.get("Id")?.asString.orEmpty()
        val name = obj.get("Name")?.asString.orEmpty()
        val typeStr = obj.get("Type")?.asString.orEmpty()
        val type = when (typeStr) {
            "Series" -> MediaType.SERIES
            "Episode" -> MediaType.EPISODE
            "BoxSet" -> MediaType.COLLECTION
            "Playlist" -> MediaType.PLAYLIST
            else -> MediaType.MOVIE
        }

        val seriesName = obj.get("SeriesName")?.asString
        val seriesId = obj.get("SeriesId")?.asString
        val seasonNum = obj.get("ParentIndexNumber")?.asInt
        val epNum = obj.get("IndexNumber")?.asInt
        val year = obj.get("ProductionYear")?.asInt

        val displayTitle = when (type) {
            MediaType.EPISODE -> seriesName ?: name
            else -> name
        }
        val displaySubtitle = when (type) {
            MediaType.EPISODE -> {
                val s = seasonNum ?: 1
                val e = epNum ?: 1
                "S$s • E$e - $name"
            }
            else -> year?.toString() ?: ""
        }

        val userData = obj.getAsJsonObject("UserData")
        val playbackTicks = userData?.get("PlaybackPositionTicks")?.asLong ?: 0L
        val unplayedCount = userData?.get("UnplayedItemCount")?.asInt
        val isPlayed = userData?.get("Played")?.asBoolean ?: false

        var videoCodec: String? = null
        var videoWidth: Int? = null
        var detectedAudioLabel = ""
        var audioCodec: String? = null
        var sourceId: String? = null
        val audioTracks = mutableListOf<MediaTrack>()
        val subtitleTracks = mutableListOf(MediaTrack(-1, "Off", "off", true))

        val mediaSources = obj.getAsJsonArray("MediaSources")
        if (mediaSources != null && mediaSources.size() > 0) {
            sourceId = mediaSources[0].asJsonObject.get("Id")?.asString
            val streams = mediaSources[0].asJsonObject.getAsJsonArray("MediaStreams")
            if (streams != null) {
                for (streamEl in streams) {
                    val streamObj = streamEl.asJsonObject
                    val streamType = streamObj.get("Type")?.asString
                    val index = streamObj.get("Index")?.asInt ?: 0
                    val lang = streamObj.get("Language")?.asString ?: "und"
                    val title = streamObj.get("DisplayTitle")?.asString ?: lang.uppercase()
                    val isDef = streamObj.get("IsDefault")?.asBoolean ?: false

                    when (streamType) {
                        "Video" -> {
                            if (videoCodec == null) {
                                videoCodec = streamObj.get("Codec")?.asString
                                videoWidth = streamObj.get("Width")?.asInt
                            }
                        }
                        "Audio" -> {
                            if (audioTracks.isEmpty()) {
                                audioCodec = streamObj.get("Codec")?.asString
                                val aCodec = streamObj.get("Codec")?.asString?.uppercase().orEmpty()
                                val channels = streamObj.get("Channels")?.asInt ?: 6
                                val chStr = if (channels >= 6) "5.1" else if (channels == 2) "2.0" else "$channels.0"
                                detectedAudioLabel = when {
                                    aCodec.contains("DTS") -> "DTS-HD MA $chStr"
                                    aCodec.contains("TRUEHD") -> "TrueHD $chStr"
                                    aCodec.contains("EAC3") -> "Dolby Digital+ $chStr"
                                    aCodec.contains("AC3") -> "Dolby $chStr"
                                    aCodec.isNotBlank() -> "$aCodec $chStr"
                                    else -> "DTS-HD MA 5.1"
                                }
                            }
                            audioTracks.add(MediaTrack(index, title, lang, isDef))
                        }
                        "Subtitle" -> subtitleTracks.add(MediaTrack(index, title, lang, isDef))
                    }
                }
            }
        }

        val chapters = mutableListOf<ChapterInfo>()
        val chaptersArray = obj.getAsJsonArray("Chapters")
        if (chaptersArray != null) {
            for (chEl in chaptersArray) {
                val chObj = chEl.asJsonObject
                chapters.add(
                    ChapterInfo(
                        name = chObj.get("Name")?.asString ?: "",
                        startPositionTicks = chObj.get("StartPositionTicks")?.asLong ?: 0L
                    )
                )
            }
        }

        val genresList = mutableListOf<String>()
        obj.getAsJsonArray("Genres")?.forEach { g ->
            g?.asString?.takeIf { it.isNotBlank() }?.let { genresList.add(it) }
        }

        val apiKeyParam = if (accessToken.isNotBlank()) "&api_key=$accessToken" else ""
        val castNames = mutableListOf<String>()
        val castMemberObjs = mutableListOf<CastMember>()
        obj.getAsJsonArray("People")?.take(12)?.forEach { p ->
            val pObj = p.asJsonObject
            val pId = pObj.get("Id")?.asString.orEmpty()
            val pName = pObj.get("Name")?.asString.orEmpty()
            val pRole = pObj.get("Role")?.asString ?: pObj.get("Type")?.asString ?: ""
            val hasPhoto = pObj.has("PrimaryImageTag") && !pObj.get("PrimaryImageTag").isJsonNull
            if (pName.isNotBlank()) {
                castNames.add(if (pRole.isNotBlank()) "$pName ($pRole)" else pName)
                val photoUrl = if (pId.isNotBlank() && hasPhoto) {
                    "$serverUrl/Items/$pId/Images/Primary?maxWidth=200&quality=80$apiKeyParam"
                } else null
                castMemberObjs.add(CastMember(id = pId, name = pName, role = pRole, imageUrl = photoUrl))
            }
        }

        var formattedPremiere: String? = null
        val rawPremiere = obj.get("PremiereDate")?.asString
        if (!rawPremiere.isNullOrBlank() && rawPremiere.length >= 10) {
            try {
                val parser = SimpleDateFormat("yyyy-MM-dd", Locale.US)
                val parsed = parser.parse(rawPremiere.substring(0, 10))
                if (parsed != null) {
                    formattedPremiere = SimpleDateFormat("MMM d, yyyy", Locale.US).format(parsed)
                }
            } catch (_: Exception) {
            }
        }

        val imageTags = obj.getAsJsonObject("ImageTags")
        val hasLogo = (imageTags != null && imageTags.has("Logo")) || obj.has("ParentLogoImageTag")
        val hasThumb = (imageTags != null && imageTags.has("Thumb")) || obj.has("ParentThumbImageTag")

        val backdropId = if (type == MediaType.EPISODE && !seriesId.isNullOrBlank()) seriesId else id
        val primaryUrl = if (type == MediaType.SERIES || type == MediaType.MOVIE) {
            "$serverUrl/Items/$id/Images/Primary?maxWidth=340&quality=82$apiKeyParam"
        } else {
            "$serverUrl/Items/$id/Images/Primary?maxWidth=480&quality=82$apiKeyParam"
        }
        val backdropUrl = "$serverUrl/Items/$backdropId/Images/Backdrop/0?maxWidth=1280&quality=80$apiKeyParam"
        val thumbUrl = if (hasThumb) {
            val thumbItemId = if (imageTags != null && imageTags.has("Thumb")) id else backdropId
            "$serverUrl/Items/$thumbItemId/Images/Thumb?maxWidth=560&quality=80$apiKeyParam"
        } else {
            backdropUrl
        }
        val logoUrl = if (hasLogo) {
            val logoItemId = if (imageTags != null && imageTags.has("Logo")) id else backdropId
            "$serverUrl/Items/$logoItemId/Images/Logo?maxWidth=520&quality=85$apiKeyParam"
        } else null

        return MediaItem(
            id = id,
            title = displayTitle,
            subtitle = displaySubtitle,
            type = type,
            overview = obj.get("Overview")?.asString.orEmpty(),
            communityRating = obj.get("CommunityRating")?.asDouble,
            criticRating = obj.get("CriticRating")?.asInt,
            officialRating = obj.get("OfficialRating")?.asString,
            runtimeTicks = obj.get("RunTimeTicks")?.asLong ?: 0L,
            playbackPositionTicks = playbackTicks,
            isPlayed = isPlayed,
            isFavorite = userData?.get("IsFavorite")?.asBoolean ?: false,
            productionYear = year,
            premiereDateFormatted = formattedPremiere,
            genres = genresList,
            castMembers = castNames,
            castList = castMemberObjs,
            unplayedItemCount = unplayedCount,
            seriesName = seriesName,
            seriesId = seriesId,
            seasonNumber = seasonNum,
            episodeNumber = epNum,
            episodeTitle = if (type == MediaType.EPISODE) name else null,
            mediaSourceId = sourceId,
            audioCodec = audioCodec,
            tmdbId = obj.getAsJsonObject("ProviderIds")?.get("Tmdb")?.takeUnless { it.isJsonNull }?.asString?.toIntOrNull(),
            videoCodec = videoCodec,
            videoWidth = videoWidth,
            audioFormatLabel = detectedAudioLabel,
            audioTracks = if (audioTracks.isNotEmpty()) audioTracks else listOf(MediaTrack(0, "Default Audio", "und", true)),
            subtitleTracks = subtitleTracks,
            chapters = chapters,
            primaryImageUrl = primaryUrl,
            backdropImageUrl = backdropUrl,
            thumbImageUrl = thumbUrl,
            logoImageUrl = logoUrl
        )
    }
}
