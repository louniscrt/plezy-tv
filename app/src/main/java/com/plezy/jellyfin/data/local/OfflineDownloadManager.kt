package com.plezy.jellyfin.data.local

import android.content.Context
import android.os.Environment
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.plezy.jellyfin.data.model.MediaItem
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream

/**
 * Gestionnaire de téléchargements et de cache hors-ligne pour la vue "Downloads" de Plezy TV :
 * - Persiste la liste des médias téléchargés dans SharedPreferences.
 * - Télécharge le flux vidéo dans le stockage interne/externe de l'application (`filesDir/offline_media`).
 * - Permet à `PlayerActivity` de lire directement le fichier local `.mp4` sans solliciter le réseau.
 */
class OfflineDownloadManager(private val context: Context) {

    private val prefs = context.getSharedPreferences("plezy_offline_downloads", Context.MODE_PRIVATE)
    private val gson = Gson()
    private val httpClient = OkHttpClient()

    private val offlineDir: File by lazy {
        File(context.getExternalFilesDir(Environment.DIRECTORY_MOVIES) ?: context.filesDir, "offline_media").apply {
            if (!exists()) mkdirs()
        }
    }

    fun getDownloadedItems(): List<MediaItem> {
        val raw = prefs.getString("downloaded_items_json", null) ?: return emptyList()
        return try {
            val type = object : TypeToken<List<MediaItem>>() {}.type
            (gson.fromJson<List<MediaItem>>(raw, type) ?: emptyList()).filter { item ->
                val file = File(offlineDir, "${item.id}.mp4")
                file.exists() && file.length() > 0L
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    fun getLocalFileFor(itemId: String): File? {
        val file = File(offlineDir, "$itemId.mp4")
        return if (isDownloaded(itemId) && file.exists() && file.length() > 0L) file else null
    }

    fun isDownloaded(itemId: String): Boolean {
        return getDownloadedItems().any { it.id == itemId }
    }

    fun removeDownload(itemId: String) {
        val updated = getDownloadedItems().filterNot { it.id == itemId }
        prefs.edit().putString("downloaded_items_json", gson.toJson(updated)).apply()
        File(offlineDir, "$itemId.mp4").delete()
    }

    /**
     * Ajoute un média à la bibliothèque hors-ligne et télécharge le fichier en arrière-plan.
     */
    suspend fun enqueueDownload(item: MediaItem, streamUrl: String): Result<File> = withContext(Dispatchers.IO) {
        val targetFile = File(offlineDir, "${item.id}.mp4")
        val partialFile = File(offlineDir, "${item.id}.part")
        try {
            if (isDownloaded(item.id) && targetFile.exists() && targetFile.length() > 0) return@withContext Result.success(targetFile)
            require(streamUrl.startsWith("http") && !streamUrl.contains(".m3u8")) {
                "Téléchargement disponible uniquement en qualité originale compatible."
            }
            val request = Request.Builder().url(streamUrl).build()
            httpClient.newCall(request).execute().use { response ->
                check(response.isSuccessful) { "Téléchargement refusé (HTTP ${response.code})" }
                val body = checkNotNull(response.body) { "Réponse vide" }
                FileOutputStream(partialFile).use { out -> body.byteStream().use { it.copyTo(out, 32 * 1024) } }
                check(partialFile.length() > 0 && (body.contentLength() < 0 || body.contentLength() == partialFile.length())) { "Téléchargement incomplet" }
            }
            check(partialFile.renameTo(targetFile)) { "Impossible d’enregistrer le fichier" }
            val current = getDownloadedItems().filterNot { it.id == item.id }.toMutableList()
            current.add(0, item)
            prefs.edit().putString("downloaded_items_json", gson.toJson(current)).apply()
            Result.success(targetFile)
        } catch (e: Exception) {
            partialFile.delete()
            Result.failure(e)
        }
    }
}
