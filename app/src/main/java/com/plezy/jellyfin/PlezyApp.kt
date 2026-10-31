package com.plezy.jellyfin

import android.app.Application
import android.content.ComponentCallbacks2
import androidx.multidex.MultiDexApplication
import com.bumptech.glide.Glide
import com.bumptech.glide.GlideBuilder
import com.bumptech.glide.load.DecodeFormat
import com.bumptech.glide.load.engine.DiskCacheStrategy
import com.bumptech.glide.load.engine.cache.InternalCacheDiskCacheFactory
import com.bumptech.glide.load.engine.cache.LruResourceCache
import com.bumptech.glide.request.RequestOptions

/**
 * Application principale optimisée pour les anciens Fire TV Stick (API 22 / 1 Go RAM).
 * - Utilise RGB_565 par défaut (2 octets par pixel au lieu de 4) : réduit de 50% l'empreinte RAM des images.
 * - Plafonne le cache mémoire de Glide à 16 Mo.
 * - Vide immédiatement les caches lors des alertes mémoire du système Fire OS.
 */
class PlezyApp : MultiDexApplication() {

    override fun onCreate() {
        super.onCreate()
        configureGlideForLowRam()
    }

    private fun configureGlideForLowRam() {
        val memoryCacheSizeBytes = 16 * 1024 * 1024L // 16 Mo max en RAM
        val diskCacheSizeBytes = 64 * 1024 * 1024L   // 64 Mo max sur disque

        val builder = GlideBuilder()
            .setMemoryCache(LruResourceCache(memoryCacheSizeBytes))
            .setDiskCache(InternalCacheDiskCacheFactory(this, diskCacheSizeBytes))
            .setDefaultRequestOptions(
                RequestOptions()
                    .format(DecodeFormat.PREFER_RGB_565)
                    .diskCacheStrategy(DiskCacheStrategy.RESOURCE)
                    .disallowHardwareConfig() // Plus stable sur Android 5.1
            )

        Glide.init(this, builder)
    }

    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        if (level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW) {
            Glide.get(this).clearMemory()
        }
    }

    override fun onLowMemory() {
        super.onLowMemory()
        Glide.get(this).clearMemory()
    }
}
