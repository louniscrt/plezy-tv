package com.plezy.jellyfin.util

import android.media.MediaCodecList
import android.os.Build

/**
 * Utilitaire de détection matérielle des codecs pour anciens Fire TV Stick (API Level 22).
 * Les puces d'ancienne génération décodent matériellement l'AVC (H.264) jusqu'en 1080p,
 * mais échouent ou saccadent sur HEVC (H.265), 10-bit, 4K ou AV1.
 */
object CodecDetector {

    /**
     * Vérifie si un décodeur matériel existe sur la Fire TV pour un type MIME donné.
     */
    fun hasHardwareDecoder(mimeType: String): Boolean {
        return try {
            val codecList = MediaCodecList(MediaCodecList.REGULAR_CODECS)
            for (info in codecList.codecInfos) {
                if (info.isEncoder) continue
                val supportedTypes = info.supportedTypes
                for (type in supportedTypes) {
                    if (type.equals(mimeType, ignoreCase = true)) {
                        val name = info.name.lowercase()
                        val isSoftware = name.startsWith("omx.google.") ||
                                name.startsWith("c2.android.") ||
                                name.contains("sw")
                        if (!isSoftware) return true
                    }
                }
            }
            false
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Détermine si le média peut être lu en Direct Play sur la Fire TV ou s'il faut
     * demander un transcodage HLS H.264 1080p au serveur Jellyfin.
     */
    fun canDirectPlay(videoCodec: String?, width: Int?): Boolean {
        // Au-delà de 1080p (ex: 4K UHD), un vieux Fire TV Stick API 22 doit transcoder
        if (width != null && width > 1920) {
            return false
        }

        val normalized = videoCodec?.lowercase() ?: return true
        return when (normalized) {
            "h264", "avc" -> true
            "hevc", "h265" -> {
                // Sur API <= 22, le HEVC est presque toujours absent ou limité au 720p/8-bit
                if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.LOLLIPOP_MR1) {
                    false
                } else {
                    hasHardwareDecoder("video/hevc")
                }
            }
            "av1", "vp9" -> false
            else -> false
        }
    }
}
