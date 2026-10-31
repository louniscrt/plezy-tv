package com.plezy.jellyfin.data.model

import java.io.Serializable

/**
 * Modèle d'un acteur / membre de l'équipe ("Cast and Crew" au bas de la fiche Infuse 8)
 */
data class CastMember(
    val id: String,
    val name: String,
    val role: String,
    val imageUrl: String? = null
) : Serializable

/**
 * Modèle unifié d'un média Jellyfin OU d'une découverte Overseerr / Seerr (TMDB) :
 * - Supporte toutes les métadonnées Infuse 8 (ClearLogo, Résolution 1080p/4K, Audio DTS-HD MA 5.1, Genres, Cast & Crew avec photos, TMDB & Metacritic ratings)
 * - Supporte l'état Overseerr (`tmdbId`, `overseerrStatus`)
 */
data class MediaItem(
    val id: String,
    val title: String,
    val subtitle: String = "",
    val type: MediaType = MediaType.MOVIE,
    val overview: String = "",
    val communityRating: Double? = null,
    val criticRating: Int? = null,
    val officialRating: String? = null,
    val runtimeTicks: Long = 0L,
    val playbackPositionTicks: Long = 0L,
    val isPlayed: Boolean = false,
    val isFavorite: Boolean = false,
    val productionYear: Int? = null,
    val premiereDateFormatted: String? = null, // ex: "Jul 26, 2007"
    val genres: List<String> = emptyList(),    // ex: ["Drama"]
    val castMembers: List<String> = emptyList(),
    val castList: List<CastMember> = emptyList(),
    val unplayedItemCount: Int? = null,
    val seriesName: String? = null,
    val seriesId: String? = null,
    val seasonNumber: Int? = null,
    val episodeNumber: Int? = null,
    val episodeTitle: String? = null,
    val mediaSourceId: String? = null,
    val audioCodec: String? = null,
    val videoCodec: String? = null,
    val videoWidth: Int? = null,
    val audioFormatLabel: String = "",
    val audioTracks: List<MediaTrack> = emptyList(),
    val subtitleTracks: List<MediaTrack> = listOf(MediaTrack(-1, "Désactivés", "off", true)),
    val chapters: List<ChapterInfo> = emptyList(),
    val primaryImageUrl: String? = null,
    val backdropImageUrl: String? = null,
    val thumbImageUrl: String? = null,
    val logoImageUrl: String? = null,
    // Champs spécifiques Overseerr / Seerr (Demande de films & séries)
    val tmdbId: Int? = null,
    val isOverseerrItem: Boolean = false,
    val overseerrStatus: OverseerrStatus = OverseerrStatus.AVAILABLE_ON_JELLYFIN,
    val totalSeasons: Int? = null,
    val totalEpisodes: Int? = null,
    val trailerUrl: String? = null
) : Serializable {

    val isSeerrMedia: Boolean
        get() = isOverseerrItem || id.startsWith("seerr_")

    val isReadyToPlay: Boolean
        get() = !isSeerrMedia || overseerrStatus == OverseerrStatus.AVAILABLE_ON_JELLYFIN

    val progressPercent: Int
        get() = if (isReadyToPlay && runtimeTicks > 0 && playbackPositionTicks > 0) {
            ((playbackPositionTicks.toDouble() / runtimeTicks.toDouble()) * 100.0).toInt().coerceIn(1, 100)
        } else 0

    /**
     * Format de reprise :
     * - Pour un média Overseerr non disponible : "Demander sur Seerr" ou "Demandé (En cours)"
     * - Pour un média Jellyfin : "Reprendre 00:10:54" ou "Lecture"
     */
    val resumeLabel: String
        get() {
            if (!isReadyToPlay) {
                return when (overseerrStatus) {
                    OverseerrStatus.REQUESTED -> "Demandé sur Seerr"
                    OverseerrStatus.AVAILABLE_ON_JELLYFIN -> "Lecture"
                    OverseerrStatus.NOT_REQUESTED -> "Demander sur Seerr"
                }
            }
            if (playbackPositionTicks <= 0L) {
                return "Lecture"
            }
            val totalSec = playbackPositionTicks / 10_000_000L
            val h = totalSec / 3600L
            val m = (totalSec % 3600L) / 60L
            val s = totalSec % 60L
            return if (h > 0) {
                String.format("Reprendre %02d:%02d:%02d", h, m, s)
            } else {
                String.format("Reprendre %02d:%02d", m, s)
            }
        }

    /**
     * Titre numéroté d'épisode pour le rail "Season 1" d'Infuse : "1. Smoke Gets in Your Eyes"
     */
    val numberedEpisodeTitle: String
        get() {
            val cleanEpName = episodeTitle?.takeIf { it.isNotBlank() }
                ?: subtitle.substringAfter("· ", "").takeIf { it.isNotBlank() }
                ?: subtitle.substringAfter("- ", "").takeIf { it.isNotBlank() }
                ?: title
            return if (episodeNumber != null) {
                "${episodeNumber}. $cleanEpName"
            } else {
                cleanEpName
            }
        }

    /**
     * Sous-titre d'épisode au format exact Infuse : "S1 • E2 - Ladies Room"
     */
    val infuseEpisodeHeader: String
        get() {
            if (type == MediaType.EPISODE || (seasonNumber != null && episodeNumber != null)) {
                val s = seasonNumber ?: 1
                val e = episodeNumber ?: 1
                val epName = episodeTitle?.takeIf { it.isNotBlank() }
                    ?: subtitle.substringAfter("· ", "").takeIf { it.isNotBlank() }
                    ?: subtitle
                return "S$s • E$e - $epName"
            }
            return subtitle.ifBlank { productionYear?.toString() ?: "" }
        }

    val formattedDuration: String
        get() {
            val totalMinutes = (runtimeTicks / 600_000_000L).toInt()
            if (totalMinutes <= 0) return ""
            val hours = totalMinutes / 60
            val mins = totalMinutes % 60
            return if (hours > 0) "${hours}h ${mins}m" else "$mins min"
        }

    val resolutionBadge: String
        get() = when {
            (videoWidth ?: 0) >= 3800 -> "4K"
            (videoWidth ?: 0) >= 1900 -> "1080p"
            (videoWidth ?: 0) >= 1200 -> "720p"
            (videoWidth ?: 0) > 0 -> "SD"
            else -> ""
        }

    val formattedDateOrYear: String
        get() = premiereDateFormatted?.takeIf { it.isNotBlank() }
            ?: productionYear?.toString()
            ?: ""

    fun buildInfuseTechLine(): String {
        val parts = mutableListOf<String>()
        parts.add(formattedDuration)
        parts.add(formattedDateOrYear)
        officialRating?.takeIf { it.isNotBlank() }?.let { parts.add("[$it]") } ?: parts.add("[TV-14]")
        parts.add(resolutionBadge)
        parts.add(audioFormatLabel)
        return parts.joinToString("   ")
    }

    fun buildHeroMetadataLine(): String = buildInfuseTechLine()
}

enum class MediaType {
    MOVIE,
    SERIES,
    EPISODE,
    COLLECTION,
    PLAYLIST
}

enum class OverseerrStatus {
    AVAILABLE_ON_JELLYFIN,
    NOT_REQUESTED,
    REQUESTED
}

data class MediaTrack(
    val index: Int,
    val displayTitle: String,
    val language: String,
    val isDefault: Boolean = false
) : Serializable

data class ChapterInfo(
    val name: String,
    val startPositionTicks: Long
) : Serializable
