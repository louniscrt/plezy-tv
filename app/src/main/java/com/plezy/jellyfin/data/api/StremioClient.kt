package com.plezy.jellyfin.data.api

import android.content.Context
import com.plezy.jellyfin.BuildConfig
import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.google.gson.reflect.TypeToken
import com.plezy.jellyfin.data.model.MediaItem
import java.io.File

/** Private runtime file: Android/data/com.plezy.jellyfin/files/stremio.json. No UI changes. */
class StremioClient(context: Context) {
    private val prefs = context.getSharedPreferences("plezy_stremio_history", Context.MODE_PRIVATE)
    private val gson = Gson()
    val engine: StremioEngine
    init {
        val file = File(context.getExternalFilesDir(null) ?: context.filesDir, "stremio.json")
        synchronized(StremioClient::class.java) {
            val stamp = if (file.isFile) file.lastModified() else 0L
            if (shared == null || stamp != loadedStamp) {
                val config = try { if (file.isFile) JsonParser.parseString(file.readText()).asJsonObject else JsonObject() } catch (_: Exception) { JsonObject() }
                if (!config.has("backendUrl") && BuildConfig.STREMIO_BACKEND_URL.isNotBlank()) config.addProperty("backendUrl", BuildConfig.STREMIO_BACKEND_URL)
                shared = try { StremioEngine(config) } catch (_: Exception) { StremioEngine(JsonObject()) }
                loadedStamp = stamp
            }
            engine = checkNotNull(shared)
        }
    }
    val enabled get() = engine.enabled
    fun history(): List<MediaItem> = try {
        gson.fromJson<List<MediaItem>>(prefs.getString("items", "[]"), object : TypeToken<List<MediaItem>>() {}.type).orEmpty()
    } catch (_: Exception) { emptyList() }
    fun decorate(item: MediaItem): MediaItem = history().firstOrNull { it.id == item.id }?.let {
        item.copy(playbackPositionTicks = it.playbackPositionTicks, isPlayed = it.isPlayed, isFavorite = it.isFavorite)
    } ?: item
    @Synchronized fun remember(item: MediaItem, position: Long? = null, played: Boolean? = null, favorite: Boolean? = null) {
        val before = decorate(item)
        val next = before.copy(playbackPositionTicks = position ?: before.playbackPositionTicks, isPlayed = played ?: before.isPlayed, isFavorite = favorite ?: before.isFavorite)
        prefs.edit().putString("items", gson.toJson((listOf(next) + history().filterNot { it.id == item.id }).take(200))).apply()
    }
    companion object {
        private var shared: StremioEngine? = null
        private var loadedStamp = -1L
        fun owns(id: String) = id.startsWith("stremio~")
    }
}
