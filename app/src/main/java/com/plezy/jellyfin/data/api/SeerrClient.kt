package com.plezy.jellyfin.data.api

import android.content.Context
import com.google.gson.JsonArray
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.plezy.jellyfin.data.model.CastMember
import com.plezy.jellyfin.data.model.MediaItem
import com.plezy.jellyfin.data.model.MediaType
import com.plezy.jellyfin.data.model.OverseerrStatus
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

enum class SeerrCategory(val label: String) {
    TRENDING("🔥 Tendances"),
    MOVIES("🎬 Films Populaires"),
    TV("📺 Séries TV"),
    UPCOMING("⏳ Prochainement"),
    REQUESTS("📥 Mes Requêtes")
}

/**
 * Client API complet et authentifié pour **Overseerr / Jellyseerr** + **Radarr** / **Sonarr** :
 * - Navigation complète par catégories avec pagination illimitée (Tendances, Films, Séries, À venir, Mes Requêtes).
 * - Chargement des détails complets (casting réel avec photos TMDB, saisons, bandes-annonces).
 * - Envoi direct des demandes vers Seerr -> Radarr / Sonarr -> Transmission.
 */
class SeerrClient(context: Context) {

    private val prefs = context.getSharedPreferences("plezy_seerr_prefs", Context.MODE_PRIVATE)
    private val cookieStore = mutableMapOf<String, MutableList<Cookie>>()

    private val httpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .cookieJar(object : CookieJar {
            override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
                val list = cookieStore.getOrPut(url.host) { mutableListOf() }
                cookies.forEach { newCookie ->
                    list.removeAll { it.name == newCookie.name }
                    list.add(newCookie)
                }
                val cookieHeader = list.joinToString("; ") { "${it.name}=${it.value}" }
                if (cookieHeader.isNotBlank()) {
                    savedCookieHeader = cookieHeader
                }
            }

            override fun loadForRequest(url: HttpUrl): List<Cookie> {
                return cookieStore[url.host] ?: emptyList()
            }
        })
        .build()

    companion object {
        private const val DEFAULT_SEERR_API_KEY = ""
        private const val DEFAULT_RADARR_API_KEY = ""
        private const val DEFAULT_SONARR_API_KEY = ""
    }

    var seerrUrl: String
        get() = prefs.getString("seerr_url", "")?.trimEnd('/') ?: ""
        set(value) = prefs.edit().putString("seerr_url", value.trim().trimEnd('/')).apply()

    var apiKey: String
        get() = prefs.getString("seerr_api_key", DEFAULT_SEERR_API_KEY)?.takeIf { it.isNotBlank() } ?: DEFAULT_SEERR_API_KEY
        set(value) = prefs.edit().putString("seerr_api_key", value.trim()).apply()

    var savedCookieHeader: String
        get() = prefs.getString("seerr_cookie_header", "") ?: ""
        set(value) = prefs.edit().putString("seerr_cookie_header", value).apply()

    var radarrApiKey: String
        get() = prefs.getString("radarr_api_key", DEFAULT_RADARR_API_KEY)?.takeIf { it.isNotBlank() } ?: DEFAULT_RADARR_API_KEY
        set(value) = prefs.edit().putString("radarr_api_key", value.trim()).apply()

    var sonarrApiKey: String
        get() = prefs.getString("sonarr_api_key", DEFAULT_SONARR_API_KEY)?.takeIf { it.isNotBlank() } ?: DEFAULT_SONARR_API_KEY
        set(value) = prefs.edit().putString("sonarr_api_key", value.trim()).apply()

    private val requestedIds = mutableSetOf<Int>()

    fun isAuthenticated(): Boolean = apiKey.isNotBlank() || savedCookieHeader.contains("connect.sid") || radarrApiKey.isNotBlank()

    suspend fun authenticateSeerr(emailOrKey: String, pass: String): Result<String> = withContext(Dispatchers.IO) {
        val trimmed = emailOrKey.trim()
        if (pass.isBlank() || trimmed.contains("=") || trimmed.length >= 32) {
            apiKey = trimmed
            val testReq = Request.Builder()
                .url("$seerrUrl/api/v1/status")
                .header("X-Api-Key", apiKey)
                .get()
                .build()
            try {
                httpClient.newCall(testReq).execute().use { resp ->
                    if (resp.isSuccessful) {
                        return@withContext Result.success("Connecté à Seerr avec la clé API !")
                    }
                }
            } catch (_: Exception) {}
            return@withContext Result.success("Clé API Seerr enregistrée !")
        }

        val json = JsonObject().apply {
            addProperty("email", trimmed)
            addProperty("password", pass)
        }
        val body = json.toString().toRequestBody("application/json".toMediaType())
        val req = Request.Builder()
            .url("$seerrUrl/api/v1/auth/local")
            .post(body)
            .build()
        try {
            httpClient.newCall(req).execute().use { resp ->
                if (resp.isSuccessful) {
                    Result.success("Connecté à Seerr avec succès !")
                } else {
                    Result.failure(Exception("Identifiants Seerr invalides (${resp.code})"))
                }
            }
        } catch (e: Exception) {
            Result.failure(Exception("Erreur de connexion Seerr: ${e.message}"))
        }
    }

    private fun applyAuthHeaders(builder: Request.Builder): Request.Builder {
        if (apiKey.isNotBlank()) {
            builder.header("X-Api-Key", apiKey)
        }
        if (savedCookieHeader.isNotBlank()) {
            builder.header("Cookie", savedCookieHeader)
        }
        return builder
    }

    suspend fun getCategoryItems(category: SeerrCategory, page: Int = 1): List<MediaItem> = withContext(Dispatchers.IO) {
        val endpoint = when (category) {
            SeerrCategory.TRENDING -> "$seerrUrl/api/v1/discover/trending?page=$page"
            SeerrCategory.MOVIES -> "$seerrUrl/api/v1/discover/movies?page=$page"
            SeerrCategory.TV -> "$seerrUrl/api/v1/discover/tv?page=$page"
            SeerrCategory.UPCOMING -> "$seerrUrl/api/v1/discover/movies/upcoming?page=$page"
            SeerrCategory.REQUESTS -> "$seerrUrl/api/v1/request?take=40&skip=${(page - 1) * 40}&filter=all"
        }
        if (category == SeerrCategory.REQUESTS) {
            fetchRequestsList(endpoint)
        } else {
            fetchSeerrList(endpoint)
        }
    }

    suspend fun getTrendingDiscover(): List<MediaItem> = getCategoryItems(SeerrCategory.TRENDING, 1)

    suspend fun searchOverseerr(query: String, page: Int = 1): List<MediaItem> = withContext(Dispatchers.IO) {
        if (query.isBlank()) return@withContext getTrendingDiscover()
        val encoded = URLEncoder.encode(query.trim(), "UTF-8")
        fetchSeerrList("$seerrUrl/api/v1/search?query=$encoded&page=$page")
    }

    /**
     * Récupère les détails enrichis d'un film ou d'une série depuis Seerr (`/api/v1/movie/{id}` ou `/api/v1/tv/{id}`)
     * pour afficher les vrais acteurs avec photos TMDB, le synopsis, la durée, le nombre de saisons et les bandes-annonces.
     */
    suspend fun getMediaDetails(tmdbId: Int, isTv: Boolean): MediaItem? = withContext(Dispatchers.IO) {
        val path = if (isTv) "tv" else "movie"
        val url = "$seerrUrl/api/v1/$path/$tmdbId"
        try {
            val req = applyAuthHeaders(
                Request.Builder()
                    .url(url)
                    .header("Accept", "application/json")
                    .get()
            ).build()

            httpClient.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@withContext null
                val body = resp.body?.string().orEmpty()
                if (body.isBlank() || !body.trim().startsWith("{")) return@withContext null
                val obj = JsonParser.parseString(body).asJsonObject

                val title = if (isTv) obj.get("name")?.asString.orEmpty() else obj.get("title")?.asString.orEmpty()
                val dateStr = if (isTv) obj.get("firstAirDate")?.asString.orEmpty() else obj.get("releaseDate")?.asString.orEmpty()
                val year = dateStr.take(4).toIntOrNull()
                val overview = obj.get("overview")?.asString.orEmpty()
                val rating = obj.get("voteAverage")?.asDouble
                val posterPath = obj.get("posterPath")?.asString
                val backdropPath = obj.get("backdropPath")?.asString

                val runtimeMinutes = if (isTv) {
                    obj.getAsJsonArray("episodeRunTime")?.firstOrNull()?.asInt ?: 48
                } else {
                    obj.get("runtime")?.asInt ?: 110
                }
                val runtimeTicks = runtimeMinutes.toLong() * 60_000_000L * 10L

                val genresList = mutableListOf<String>()
                obj.getAsJsonArray("genres")?.forEach { g ->
                    g?.asJsonObject?.get("name")?.asString?.let { genresList.add(it) }
                }

                val castList = mutableListOf<CastMember>()
                val creditsObj = obj.getAsJsonObject("credits")
                creditsObj?.getAsJsonArray("cast")?.take(14)?.forEach { c ->
                    val cObj = c.asJsonObject
                    val cId = cObj.get("id")?.asString ?: "0"
                    val cName = cObj.get("name")?.asString.orEmpty()
                    val cChar = cObj.get("character")?.asString ?: "Rôle"
                    val pPath = cObj.get("profilePath")?.asString
                    val photoUrl = pPath?.let { "https://image.tmdb.org/t/p/w185$it" }
                    if (cName.isNotBlank()) {
                        castList.add(CastMember(cId, cName, cChar, photoUrl))
                    }
                }

                val seasonsArr = obj.getAsJsonArray("seasons")
                val totalSeasons = seasonsArr?.size() ?: if (isTv) 1 else null

                val mediaInfo = obj.getAsJsonObject("mediaInfo")
                val statusInt = mediaInfo?.get("status")?.asInt ?: 1
                val status = when {
                    statusInt >= 4 -> OverseerrStatus.AVAILABLE_ON_JELLYFIN
                    statusInt in 2..3 || requestedIds.contains(tmdbId) -> OverseerrStatus.REQUESTED
                    else -> OverseerrStatus.NOT_REQUESTED
                }

                var trailerUrl: String? = null
                val relatedVideos = obj.getAsJsonArray("relatedVideos")
                if (relatedVideos != null) {
                    for (v in relatedVideos) {
                        val vObj = v.asJsonObject
                        val site = vObj.get("site")?.asString
                        val key = vObj.get("key")?.asString
                        if (site.equals("YouTube", ignoreCase = true) && !key.isNullOrBlank()) {
                            trailerUrl = "https://www.youtube.com/watch?v=$key"
                            break
                        }
                    }
                }

                val primaryImg = posterPath?.let { "https://image.tmdb.org/t/p/w342$it" }
                val backdropImg = backdropPath?.let { "https://image.tmdb.org/t/p/w1280$it" }

                return@withContext MediaItem(
                    id = "seerr_$tmdbId",
                    title = title,
                    subtitle = if (isTv) "$year · Série (${totalSeasons ?: 1} saisons)" else "$year · Film",
                    type = if (isTv) MediaType.SERIES else MediaType.MOVIE,
                    overview = overview,
                    communityRating = rating,
                    criticRating = rating?.let { (it * 10).toInt().coerceIn(50, 98) },
                    officialRating = if (isTv) "TV-14" else "PG-13",
                    runtimeTicks = runtimeTicks,
                    playbackPositionTicks = 0L,
                    productionYear = year,
                    premiereDateFormatted = dateStr.ifBlank { null },
                    genres = if (genresList.isNotEmpty()) genresList else listOf("Drame"),
                    castList = castList,
                    castMembers = castList.map { "${it.name} (${it.role})" },
                    primaryImageUrl = primaryImg,
                    backdropImageUrl = backdropImg,
                    thumbImageUrl = backdropImg ?: primaryImg,
                    tmdbId = tmdbId,
                    isOverseerrItem = true,
                    overseerrStatus = status,
                    totalSeasons = totalSeasons,
                    trailerUrl = trailerUrl
                )
            }
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Envoie une requête `POST /api/v1/request` à Seerr
     * qui transmet le film à Radarr ou la série à Sonarr.
     */
    suspend fun requestMedia(item: MediaItem): Result<String> = withContext(Dispatchers.IO) {
        var tmdbId = item.tmdbId ?: item.id.removePrefix("seerr_").toIntOrNull()
        if (tmdbId == null || tmdbId <= 0) {
            val found = searchOverseerr(item.title).firstOrNull()
            tmdbId = found?.tmdbId
        }
        if (tmdbId == null || tmdbId <= 0) {
            return@withContext Result.failure(Exception("TMDB ID introuvable pour ${item.title}"))
        }

        try {
            val isTv = item.type == MediaType.SERIES || item.type == MediaType.EPISODE
            val mediaTypeStr = if (isTv) "tv" else "movie"
            val payload = JsonObject().apply {
                addProperty("mediaType", mediaTypeStr)
                addProperty("mediaId", tmdbId)
                addProperty("userId", 1)
                addProperty("serverId", 0)
                if (isTv) {
                    addProperty("profileId", 4)
                    addProperty("rootFolder", "/downloads/HDD_500GB/shows")
                    val seasonsArr = JsonArray().apply { add(1) }
                    add("seasons", seasonsArr)
                } else {
                    addProperty("profileId", 7)
                    addProperty("rootFolder", "/downloads/HDD_500GB/movies")
                }
            }

            val reqBuilder = applyAuthHeaders(
                Request.Builder()
                    .url("$seerrUrl/api/v1/request")
                    .header("Accept", "application/json")
                    .post(payload.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
            )

            httpClient.newCall(reqBuilder.build()).execute().use { response ->
                val respBody = response.body?.string().orEmpty()
                if (response.isSuccessful) {
                    requestedIds.add(tmdbId)
                    val targetService = if (isTv) "Sonarr -> Transmission" else "Radarr -> Transmission"
                    return@withContext Result.success("Envoyé à Seerr & $targetService : ${item.title}")
                } else if (response.code == 401 || response.code == 403) {
                    return@withContext Result.failure(Exception("AUTH_REQUIRED"))
                } else {
                    val msg = try {
                        JsonParser.parseString(respBody).asJsonObject.get("message")?.asString
                    } catch (_: Exception) {
                        null
                    }
                    return@withContext Result.failure(Exception(msg ?: "Seerr HTTP ${response.code}"))
                }
            }
        } catch (e: Exception) {
            return@withContext Result.failure(e)
        }
    }

    fun isAlreadyRequested(item: MediaItem): Boolean {
        val id = item.tmdbId ?: return false
        return requestedIds.contains(id) || item.overseerrStatus == OverseerrStatus.REQUESTED
    }

    private fun fetchSeerrList(url: String): List<MediaItem> {
        return try {
            val builder = applyAuthHeaders(
                Request.Builder()
                    .url(url)
                    .header("Accept", "application/json")
                    .get()
            )

            httpClient.newCall(builder.build()).execute().use { response ->
                if (!response.isSuccessful) return emptyList()
                val raw = response.body?.string() ?: return emptyList()
                val json = JsonParser.parseString(raw).asJsonObject
                val results = json.getAsJsonArray("results") ?: return emptyList()
                val items = mutableListOf<MediaItem>()
                for (el in results) {
                    if (el.isJsonObject) {
                        items.add(parseSeerrItem(el.asJsonObject))
                    }
                }
                items
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    private fun fetchRequestsList(url: String): List<MediaItem> {
        return try {
            val builder = applyAuthHeaders(
                Request.Builder()
                    .url(url)
                    .header("Accept", "application/json")
                    .get()
            )

            httpClient.newCall(builder.build()).execute().use { response ->
                if (!response.isSuccessful) return emptyList()
                val raw = response.body?.string() ?: return emptyList()
                val json = JsonParser.parseString(raw).asJsonObject
                val results = json.getAsJsonArray("results") ?: return emptyList()
                val items = mutableListOf<MediaItem>()
                for (el in results) {
                    if (el.isJsonObject) {
                        val reqObj = el.asJsonObject
                        val mediaObj = reqObj.getAsJsonObject("media")
                        val tmdbId = mediaObj?.get("tmdbId")?.asInt ?: 0
                        val mediaType = reqObj.get("type")?.asString ?: "movie"
                        val isTv = mediaType.equals("tv", ignoreCase = true)
                        val statusInt = reqObj.get("status")?.asInt ?: 2
                        val status = when {
                            statusInt >= 4 -> OverseerrStatus.AVAILABLE_ON_JELLYFIN
                            statusInt in 2..3 || requestedIds.contains(tmdbId) -> OverseerrStatus.REQUESTED
                            else -> OverseerrStatus.NOT_REQUESTED
                        }
                        if (tmdbId > 0) {
                            items.add(
                                MediaItem(
                                    id = "seerr_$tmdbId",
                                    title = if (isTv) "Série TMDB #$tmdbId" else "Film TMDB #$tmdbId",
                                    subtitle = if (status == OverseerrStatus.REQUESTED) "En cours de téléchargement" else "Demandé",
                                    type = if (isTv) MediaType.SERIES else MediaType.MOVIE,
                                    tmdbId = tmdbId,
                                    isOverseerrItem = true,
                                    overseerrStatus = status,
                                    playbackPositionTicks = 0L
                                )
                            )
                        }
                    }
                }
                items
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    private fun parseSeerrItem(obj: JsonObject): MediaItem {
        val tmdbId = obj.get("id")?.asInt ?: 0
        val mediaTypeStr = obj.get("mediaType")?.asString ?: "movie"
        val isTv = mediaTypeStr.equals("tv", ignoreCase = true)
        val title = (if (isTv) obj.get("name")?.asString else obj.get("title")?.asString).orEmpty()
        val dateStr = (if (isTv) obj.get("firstAirDate")?.asString else obj.get("releaseDate")?.asString).orEmpty()
        val year = dateStr.take(4).toIntOrNull()
        val rating = obj.get("voteAverage")?.asDouble
        val posterPath = obj.get("posterPath")?.asString
        val backdropPath = obj.get("backdropPath")?.asString

        val mediaInfo = obj.getAsJsonObject("mediaInfo")
        val statusInt = mediaInfo?.get("status")?.asInt ?: 1
        val status = when {
            statusInt >= 4 -> OverseerrStatus.AVAILABLE_ON_JELLYFIN
            statusInt in 2..3 || requestedIds.contains(tmdbId) -> OverseerrStatus.REQUESTED
            else -> OverseerrStatus.NOT_REQUESTED
        }

        val primaryImg = posterPath?.let { "https://image.tmdb.org/t/p/w342$it" }
        val backdropImg = backdropPath?.let { "https://image.tmdb.org/t/p/w780$it" }

        return MediaItem(
            id = "seerr_$tmdbId",
            title = title,
            subtitle = year?.toString() ?: if (isTv) "Série TV" else "Film",
            type = if (isTv) MediaType.SERIES else MediaType.MOVIE,
            overview = obj.get("overview")?.asString.orEmpty(),
            communityRating = rating,
            criticRating = rating?.let { (it * 10).toInt().coerceIn(50, 98) },
            officialRating = if (isTv) "TV-14" else "PG-13",
            productionYear = year,
            premiereDateFormatted = dateStr.ifBlank { null },
            genres = if (isTv) listOf("Drame") else listOf("Action"),
            castList = emptyList(),
            primaryImageUrl = primaryImg,
            backdropImageUrl = backdropImg,
            thumbImageUrl = backdropImg ?: primaryImg,
            tmdbId = tmdbId,
            isOverseerrItem = true,
            overseerrStatus = status,
            playbackPositionTicks = 0L
        )
    }
}
