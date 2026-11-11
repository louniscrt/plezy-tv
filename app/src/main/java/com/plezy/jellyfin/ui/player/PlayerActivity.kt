package com.plezy.jellyfin.ui.player

import android.os.Build
import android.os.Bundle
import com.google.android.exoplayer2.PlaybackException
import com.google.android.exoplayer2.C
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.withContext
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.View
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.android.exoplayer2.DefaultLoadControl
import com.google.android.exoplayer2.ExoPlayer
import com.google.android.exoplayer2.MediaItem as ExoMediaItem
import com.google.android.exoplayer2.Player
import com.google.android.exoplayer2.ui.AspectRatioFrameLayout
import com.google.android.exoplayer2.ui.StyledPlayerView
import com.plezy.jellyfin.R
import com.plezy.jellyfin.data.api.JellyfinClient
import com.plezy.jellyfin.data.local.OfflineDownloadManager
import com.plezy.jellyfin.data.model.MediaItem
import com.plezy.jellyfin.util.CodecDetector
import kotlinx.coroutines.launch
import kotlinx.coroutines.Job
import kotlinx.coroutines.CancellationException
import com.plezy.jellyfin.data.api.StremioClient
import com.plezy.jellyfin.data.api.StremioEngine
import com.google.android.exoplayer2.source.DefaultMediaSourceFactory
import com.google.android.exoplayer2.upstream.DefaultDataSource
import com.google.android.exoplayer2.upstream.DefaultHttpDataSource
import com.google.android.exoplayer2.Tracks
import com.google.android.exoplayer2.source.TrackGroup
import com.google.android.exoplayer2.trackselection.TrackSelectionOverride
import com.google.android.exoplayer2.util.MimeTypes
import android.net.Uri
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Lecteur vidéo ExoPlayer identique au pixel près à **Infuse 8 Liquid Glass** (`media_1793397589653_d20cda3d.jpg` "Big Buck Bunny") :
 * - Titre centré tout en haut sans bandeau sombre.
 * - Capsule flottante Liquid Glass en bas au centre avec :
 *   - Curseur de volume à gauche
 *   - 5 icônes vectorielles blanches au centre (`⏮`, `↺10`, `❚❚`/`▶`, `↻10`, `⏭`)
 *   - 5 icônes vectorielles utilitaires à droite (`⚙` Qualité, `⧉` Audio/Sous-titres, `🖥` Flux/AirPlay, `⛶` Plein écran, `☰` Chapitres)
 *   - Scrubber continu avec curseur circulaire blanc (`6:23 [====(O)---] -4:12`)
 */
class PlayerActivity : AppCompatActivity() {

    private lateinit var jellyfinClient: JellyfinClient
    private lateinit var offlineManager: OfflineDownloadManager
    private lateinit var mediaItem: MediaItem
    private var playlist: List<MediaItem> = emptyList()
    private var player: ExoPlayer? = null

    private var streamJob: Job? = null
    private var stremioStreams: List<StremioEngine.Stream> = emptyList()
    private var stremioKey: String? = null
    private var stremioIndex = 0
    private var stremioHlsFallback = false

    private var selectedBitrate: Int? = null
    private var selectedAudioIndex: Int? = null
    private var selectedSubtitleIndex: Int? = null
    private var currentResizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT

    private lateinit var playerView: StyledPlayerView
    private lateinit var playerOverlay: View
    private lateinit var tvPlayerTitle: TextView
    private lateinit var tvPlayerSubtitle: TextView
    private lateinit var tvStreamModeBadge: TextView
    private lateinit var tvElapsedTime: TextView
    private lateinit var tvRemainingTime: TextView
    private lateinit var tvEndsAt: TextView
    private lateinit var btnPlayPause: ImageView
    private lateinit var chapterProgressBar: SegmentedChapterBar

    private var resumePosition = 0L
    private var resumePlaying = true
    private var dialogOpen = false
    private var fallbackTried = false
    private val reportScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var tickCounter = 0
    private val uiHandler = Handler(Looper.getMainLooper())
    private val hideOverlayRunnable = Runnable {
        if (!dialogOpen && player?.isPlaying == true && playerOverlay.visibility == View.VISIBLE) {
            playerOverlay.animate()
                .alpha(0f)
                .setDuration(300)
                .withEndAction {
                    playerOverlay.visibility = View.GONE
                    playerOverlay.alpha = 1f
                }
                .start()
        }
    }

    private fun showOverlayAndScheduleHide() {
        val wasHidden = playerOverlay.visibility != View.VISIBLE
        playerOverlay.animate().cancel()
        playerOverlay.alpha = 1f
        playerOverlay.visibility = View.VISIBLE
        if (wasHidden) btnPlayPause.requestFocus()
        uiHandler.removeCallbacks(hideOverlayRunnable)
        if (!dialogOpen && player?.isPlaying == true) {
            uiHandler.postDelayed(hideOverlayRunnable, 3500L)
        }
    }

    private val progressUpdater = object : Runnable {
        override fun run() {
            updateTimelineUi()
            tickCounter++
            if (tickCounter % 10 == 0) {
                val exo = player
                if (exo != null) {
                    val posTicks = exo.currentPosition * 10_000L
                    val paused = !exo.isPlaying
                    val itemId = mediaItem.id
                    reportScope.launch { jellyfinClient.reportPlaybackProgress(itemId, posTicks, paused) }
                }
            }
            uiHandler.postDelayed(this, 1000L)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_player)

        jellyfinClient = JellyfinClient(this)
        offlineManager = OfflineDownloadManager(this)
        @Suppress("DEPRECATION")
        mediaItem = (intent.getSerializableExtra("media_item") as? MediaItem) ?: run {
            finish()
            return
        }
        @Suppress("UNCHECKED_CAST", "DEPRECATION")
        playlist = (intent.getSerializableExtra("playlist") as? ArrayList<MediaItem>).orEmpty()
        if (playlist.isEmpty() && mediaItem.seriesId != null) {
            lifecycleScope.launch(Dispatchers.IO) {
                runCatching {
                    val sId = mediaItem.seriesId!!
                    val bySeason = jellyfinClient.getEpisodesBySeason(sId)
                    val currentSeasonEpisodes = mediaItem.seasonNumber?.let { bySeason[it] } ?: bySeason.values.flatten()
                    if (currentSeasonEpisodes.isNotEmpty()) {
                        withContext(Dispatchers.Main) { playlist = currentSeasonEpisodes }
                    }
                }
            }
        }

        playerView = findViewById(R.id.exoPlayerView)
        playerOverlay = findViewById(R.id.playerOverlay)
        tvPlayerTitle = findViewById(R.id.tvPlayerTitle)
        tvPlayerSubtitle = findViewById(R.id.tvPlayerSubtitle)
        tvStreamModeBadge = findViewById(R.id.tvStreamModeBadge)
        tvElapsedTime = findViewById(R.id.tvElapsedTime)
        tvRemainingTime = findViewById(R.id.tvRemainingTime)
        tvEndsAt = findViewById(R.id.tvEndsAt)
        btnPlayPause = findViewById(R.id.btnPlayPause)
        chapterProgressBar = findViewById(R.id.chapterProgressBar)

        playerView.useController = false

        bindMetadata()
        setupControls()
        resumePosition = savedInstanceState?.getLong("position") ?: mediaItem.playbackPositionTicks / 10_000L
        resumePlaying = savedInstanceState?.getBoolean("playing", true) ?: true
        selectedBitrate = savedInstanceState?.getInt("bitrate")?.takeIf { it > 0 }
        selectedAudioIndex = savedInstanceState?.getInt("audio", -1)?.takeIf { it >= 0 }
        selectedSubtitleIndex = savedInstanceState?.getInt("subtitle", -1) ?: -1
    }

    private fun bindMetadata() {
        tvPlayerTitle.text = if (mediaItem.episodeTitle != null && mediaItem.seriesName != null) {
            "${mediaItem.seriesName} — ${mediaItem.episodeTitle}"
        } else {
            mediaItem.title
        }
        tvPlayerSubtitle.text = mediaItem.subtitle
        chapterProgressBar.progressFraction = 0f
        chapterProgressBar.setChapterFractions(emptyList())
        tvElapsedTime.text = "00:00"
        tvRemainingTime.text = "-00:00"
        tvEndsAt.text = ""

        val isDirectPlay = selectedBitrate == null &&
                CodecDetector.canDirectPlay(mediaItem.videoCodec, mediaItem.videoWidth) &&
                (selectedSubtitleIndex == null || selectedSubtitleIndex!! < 0)

        tvStreamModeBadge.text = if (isDirectPlay) {
            "Direct Play · H.264"
        } else {
            val mbps = (selectedBitrate ?: 8_000_000) / 1_000_000
            "HLS Transcode · ${mbps} Mbps"
        }
    }

    private fun addFocusBounce(view: View, scale: Float = 1.10f) {
        view.setOnFocusChangeListener { v, hasFocus ->
            val target = if (hasFocus) scale else 1.0f
            v.animate().scaleX(target).scaleY(target).setDuration(140).start()
            if (hasFocus) {
                showOverlayAndScheduleHide()
            }
        }
    }

    private fun setupControls() {
        val btnBack = findViewById<View>(R.id.btnPlayerBack)
        btnBack.setOnClickListener { finish() }
        addFocusBounce(btnBack, 1.15f)

        btnPlayPause.setOnClickListener {
            val exo = player ?: return@setOnClickListener
            if (exo.playWhenReady) {
                exo.pause()
                showOverlayAndScheduleHide()
                btnPlayPause.setImageResource(R.drawable.ic_player_play)
                uiHandler.removeCallbacks(hideOverlayRunnable)
            } else {
                if (exo.playbackState == Player.STATE_ENDED) exo.seekTo(0L)
                exo.play()
                btnPlayPause.setImageResource(R.drawable.ic_player_pause)
                showOverlayAndScheduleHide()
            }
        }
        addFocusBounce(btnPlayPause, 1.10f)

        val btnReplay10 = findViewById<View>(R.id.btnReplay10)
        btnReplay10.setOnClickListener {
            seekRelative(-10_000L)
            showOverlayAndScheduleHide()
        }
        addFocusBounce(btnReplay10, 1.12f)

        val btnForward10 = findViewById<View>(R.id.btnForward10)
        btnForward10.setOnClickListener {
            seekRelative(10_000L)
            showOverlayAndScheduleHide()
        }
        addFocusBounce(btnForward10, 1.12f)

        findViewById<View>(R.id.btnRewindFast)?.setOnClickListener { seekRelative(-30_000L) }
        findViewById<View>(R.id.btnFastForward)?.setOnClickListener { seekRelative(30_000L) }

        val btnPrev = findViewById<View>(R.id.btnPrev)
        btnPrev.setOnClickListener {
            jumpToChapter(next = false)
            showOverlayAndScheduleHide()
        }
        addFocusBounce(btnPrev, 1.12f)

        val btnNext = findViewById<View>(R.id.btnNext)
        btnNext.visibility = View.VISIBLE
        btnNext.setOnClickListener {
            jumpToChapter(next = true)
            showOverlayAndScheduleHide()
        }
        addFocusBounce(btnNext, 1.12f)

        // 1. Gear (Qualité / Transcodage)
        val btnQuality = findViewById<View>(R.id.btnQuality)
        btnQuality.setOnClickListener {
            dialogOpen = true
            uiHandler.removeCallbacks(hideOverlayRunnable)
            val options = arrayOf(
                "Automatique (4K / 1080p Direct)",
                "4K UHD · 20 Mbps",
                "1080p · 12 Mbps (H.264)",
                "1080p · 8 Mbps (H.264)",
                "720p · 4 Mbps (H.264)"
            )
            AlertDialog.Builder(this)
                .setTitle("Qualité Vidéo")
                .setItems(options) { _, which ->
                    selectedBitrate = when (which) {
                        1 -> 20_000_000
                        2 -> 12_000_000
                        3 -> 8_000_000
                        4 -> 4_000_000
                        else -> null
                    }
                    reloadStreamPreservingPosition()
                    showOverlayAndScheduleHide()
                }
                .setOnDismissListener { dialogOpen = false; showOverlayAndScheduleHide() }
                .show()
        }
        addFocusBounce(btnQuality, 1.08f)

        // 2. Audio & Subtitles
        applySubtitleStyle()
        val btnSubtitles = findViewById<View>(R.id.btnSubtitles)
        btnSubtitles.setOnClickListener {
            val exo = player ?: return@setOnClickListener
            dialogOpen = true
            uiHandler.removeCallbacks(hideOverlayRunnable)
            showAudioAndSubtitlesDialog(exo)
        }
        addFocusBounce(btnSubtitles, 1.08f)

        // 3. Stream Info / AirPlay icon
        val btnAirPlay = findViewById<View>(R.id.btnAirPlay)
        btnAirPlay.setOnClickListener {
            Toast.makeText(
                this,
                "${mediaItem.resolutionBadge} · ${mediaItem.audioFormatLabel} · ${tvStreamModeBadge.text}",
                Toast.LENGTH_SHORT
            ).show()
            showOverlayAndScheduleHide()
        }
        addFocusBounce(btnAirPlay, 1.15f)

        // 4. Fullscreen / Aspect Ratio
        val btnAspect = findViewById<TextView>(R.id.btnAspect)
        btnAspect.setOnClickListener {
            currentResizeMode = when (currentResizeMode) {
                AspectRatioFrameLayout.RESIZE_MODE_FIT -> {
                    btnAspect.text = "Format : zoom"
                    Toast.makeText(this, "Mode: Zoom plein écran", Toast.LENGTH_SHORT).show()
                    AspectRatioFrameLayout.RESIZE_MODE_ZOOM
                }
                AspectRatioFrameLayout.RESIZE_MODE_ZOOM -> {
                    btnAspect.text = "Format : étiré"
                    Toast.makeText(this, "Mode: Étiré 16:9", Toast.LENGTH_SHORT).show()
                    AspectRatioFrameLayout.RESIZE_MODE_FILL
                }
                else -> {
                    btnAspect.text = "Format : original"
                    Toast.makeText(this, "Mode: Ajusté (Ratio original)", Toast.LENGTH_SHORT).show()
                    AspectRatioFrameLayout.RESIZE_MODE_FIT
                }
            }
            playerView.resizeMode = currentResizeMode
            showOverlayAndScheduleHide()
        }
        addFocusBounce(btnAspect, 1.08f)

        // 5. Chapters list
        val btnChapters = findViewById<View>(R.id.btnChapters)
        btnChapters.setOnClickListener {
            dialogOpen = true
            uiHandler.removeCallbacks(hideOverlayRunnable)
            val chapters = mediaItem.chapters
            if (chapters.isEmpty()) {
                dialogOpen = false
                Toast.makeText(this, "Aucun chapitre disponible", Toast.LENGTH_SHORT).show()
                showOverlayAndScheduleHide()
                return@setOnClickListener
            }
            val names = chapters.map { ch ->
                val min = (ch.startPositionTicks / 600_000_000L)
                val sec = (ch.startPositionTicks / 10_000_000L) % 60
                String.format(Locale.FRANCE, "%s (%d:%02d)", ch.name, min, sec)
            }.toTypedArray()

            AlertDialog.Builder(this)
                .setTitle("Chapitres")
                .setItems(names) { _, which ->
                    player?.seekTo(chapters[which].startPositionTicks / 10_000L)
                    updateTimelineUi()
                    showOverlayAndScheduleHide()
                }
                .setOnDismissListener { dialogOpen = false; showOverlayAndScheduleHide() }
                .show()
        }
        addFocusBounce(btnChapters, 1.08f)

        chapterProgressBar.setOnKeyListener { _, key, event ->
            if (event.action == KeyEvent.ACTION_DOWN && (key == KeyEvent.KEYCODE_DPAD_LEFT || key == KeyEvent.KEYCODE_DPAD_RIGHT)) {
                seekRelative(if (key == KeyEvent.KEYCODE_DPAD_LEFT) -10_000L else 10_000L)
                showOverlayAndScheduleHide()
                true
            } else false
        }
        chapterProgressBar.setOnFocusChangeListener { _, _ -> chapterProgressBar.invalidate() }
        val bottomButtons = listOf(btnPrev, btnReplay10, btnPlayPause, btnForward10, btnNext, btnQuality, btnSubtitles, btnAirPlay, btnAspect, btnChapters)
        bottomButtons.forEach { it.nextFocusUpId = R.id.chapterProgressBar }
        chapterProgressBar.nextFocusDownId = R.id.btnPlayPause
        chapterProgressBar.nextFocusUpId = R.id.btnPlayerBack
        btnBack.nextFocusDownId = R.id.chapterProgressBar
        btnPlayPause.requestFocus()
        showOverlayAndScheduleHide()
    }

    private fun applySubtitleStyle() {
        val prefs = getSharedPreferences("plezy_sub_prefs", MODE_PRIVATE)
        val scale = prefs.getFloat("scale", 0.058f)
        val fg = prefs.getInt("fg", android.graphics.Color.WHITE)
        val bg = prefs.getInt("bg", android.graphics.Color.argb(190, 0, 0, 0))
        val bottom = prefs.getFloat("bottom", 0.20f)
        playerView.subtitleView?.apply {
            setApplyEmbeddedStyles(false)
            setFractionalTextSize(scale)
            setBottomPaddingFraction(bottom)
            setStyle(
                com.google.android.exoplayer2.ui.CaptionStyleCompat(
                    fg,
                    bg,
                    android.graphics.Color.TRANSPARENT,
                    com.google.android.exoplayer2.ui.CaptionStyleCompat.EDGE_TYPE_DROP_SHADOW,
                    android.graphics.Color.BLACK,
                    null
                )
            )
        }
    }

    private fun showSubtitleStyleDialog() {
        val prefs = getSharedPreferences("plezy_sub_prefs", MODE_PRIVATE)
        val options = arrayOf(
            "Taille : Petit",
            "Taille : Normal",
            "Taille : Grand",
            "Taille : Très grand",
            "Couleur : Blanc",
            "Couleur : Jaune",
            "Couleur : Cyan",
            "Fond : Semi-transparent",
            "Fond : Transparent",
            "Fond : Noir opaque",
            "Position : Bas",
            "Position : Relevé",
            "Position : Haut"
        )
        AlertDialog.Builder(this)
            .setTitle("Personnaliser les sous-titres")
            .setItems(options) { _, which ->
                val ed = prefs.edit()
                when (which) {
                    0 -> ed.putFloat("scale", 0.046f)
                    1 -> ed.putFloat("scale", 0.058f)
                    2 -> ed.putFloat("scale", 0.072f)
                    3 -> ed.putFloat("scale", 0.088f)
                    4 -> ed.putInt("fg", android.graphics.Color.WHITE)
                    5 -> ed.putInt("fg", android.graphics.Color.rgb(255, 215, 0))
                    6 -> ed.putInt("fg", android.graphics.Color.CYAN)
                    7 -> ed.putInt("bg", android.graphics.Color.argb(190, 0, 0, 0))
                    8 -> ed.putInt("bg", android.graphics.Color.TRANSPARENT)
                    9 -> ed.putInt("bg", android.graphics.Color.argb(250, 0, 0, 0))
                    10 -> ed.putFloat("bottom", 0.16f)
                    11 -> ed.putFloat("bottom", 0.22f)
                    12 -> ed.putFloat("bottom", 0.30f)
                }
                ed.apply()
                applySubtitleStyle()
            }
            .show()
    }

    private data class TrackOption(
        val type: Int, // 0 = audio, 1 = sub, 2 = custom
        val title: String,
        val isSelected: Boolean,
        val group: TrackGroup? = null,
        val trackIndex: Int = -1,
        val isOff: Boolean = false,
        val fallbackIndex: Int? = null
    )

    private fun showAudioAndSubtitlesDialog(exo: ExoPlayer) {
        val tracks = exo.currentTracks
        val options = mutableListOf<TrackOption>()

        // 1. Audio tracks
        val detectedAudios = mutableListOf<TrackOption>()
        for (group in tracks.groups) {
            if (group.type == C.TRACK_TYPE_AUDIO) {
                val tg = group.mediaTrackGroup
                for (i in 0 until group.length) {
                    if (group.isTrackSupported(i)) {
                        val format = group.getTrackFormat(i)
                        val lang = format.language ?: "und"
                        val langName = when {
                            lang.startsWith("fr", ignoreCase = true) -> "Français"
                            lang.startsWith("en", ignoreCase = true) -> "Anglais"
                            else -> lang.uppercase()
                        }
                        val channels = if (format.channelCount >= 6) "5.1" else if (format.channelCount == 2) "2.0" else if (format.channelCount > 0) "${format.channelCount}ch" else ""
                        val customLabel = format.label?.takeIf { it.isNotBlank() }
                        val display = when {
                            customLabel != null && channels.isNotEmpty() && !customLabel.contains(channels) -> "$customLabel ($channels)"
                            customLabel != null -> customLabel
                            channels.isNotEmpty() -> "$langName ($channels)"
                            else -> langName
                        }
                        detectedAudios.add(TrackOption(0, display, group.isTrackSelected(i), tg, i))
                    }
                }
            }
        }
        if (detectedAudios.isNotEmpty()) {
            options.addAll(detectedAudios)
        } else {
            mediaItem.audioTracks.forEach { at ->
                options.add(TrackOption(0, at.displayTitle, at.index == selectedAudioIndex, fallbackIndex = at.index))
            }
        }

        // 2. Subtitle tracks
        val detectedSubs = mutableListOf<TrackOption>()
        val hasSelectedSub = tracks.isTypeSelected(C.TRACK_TYPE_TEXT)
        val isSubOff = !hasSelectedSub || selectedSubtitleIndex == -1
        detectedSubs.add(TrackOption(1, "Désactivés", isSubOff, null, -1, true))

        for (group in tracks.groups) {
            if (group.type == C.TRACK_TYPE_TEXT) {
                val tg = group.mediaTrackGroup
                for (i in 0 until group.length) {
                    if (group.isTrackSupported(i)) {
                        val format = group.getTrackFormat(i)
                        val lang = format.language ?: "und"
                        val isForced = (format.selectionFlags and C.SELECTION_FLAG_FORCED) != 0 || format.label?.contains("forc", ignoreCase = true) == true
                        val isSdh = (format.roleFlags and C.ROLE_FLAG_DESCRIBES_MUSIC_AND_SOUND) != 0 || format.label?.contains("sdh", ignoreCase = true) == true
                        val langName = when {
                            lang.startsWith("fr", ignoreCase = true) -> "Français"
                            lang.startsWith("en", ignoreCase = true) -> "Anglais"
                            else -> lang.uppercase()
                        }
                        val typeSuffix = when {
                            isForced -> " (forcé)"
                            isSdh -> " (malentendants)"
                            format.label?.contains("OpenSubtitles", ignoreCase = true) == true -> ""
                            format.label?.isNotBlank() == true -> " (${format.label})"
                            else -> " (complet)"
                        }
                        val title = if (format.label?.isNotBlank() == true && format.label!!.contains(langName, ignoreCase = true)) {
                            format.label!!
                        } else if (format.label?.isNotBlank() == true) {
                            "$langName - ${format.label}"
                        } else {
                            "$langName$typeSuffix"
                        }
                        detectedSubs.add(TrackOption(1, title, !isSubOff && group.isTrackSelected(i), tg, i))
                    }
                }
            }
        }
        if (detectedSubs.size > 1) {
            options.addAll(detectedSubs)
        } else {
            mediaItem.subtitleTracks.forEach { st ->
                options.add(TrackOption(1, st.displayTitle, st.index == selectedSubtitleIndex, fallbackIndex = st.index, isOff = st.index == -1 || st.language == "off"))
            }
        }

        // 3. Customization entry
        options.add(TrackOption(2, "🎨 Personnaliser les sous-titres…", false))

        val menuItems = options.map { opt ->
            when (opt.type) {
                0 -> "🔊 Audio: ${if (opt.isSelected) "✓ " else ""}${opt.title}"
                1 -> "💬 Sous-titres: ${if (opt.isSelected) "✓ " else ""}${opt.title}"
                else -> opt.title
            }
        }.toTypedArray()

        AlertDialog.Builder(this)
            .setTitle("Audio & Sous-titres")
            .setItems(menuItems) { _, which ->
                val choice = options[which]
                when (choice.type) {
                    0 -> {
                        if (choice.group != null && choice.trackIndex >= 0) {
                            exo.trackSelectionParameters = exo.trackSelectionParameters.buildUpon()
                                .setOverrideForType(TrackSelectionOverride(choice.group, choice.trackIndex))
                                .build()
                            Toast.makeText(this, "Audio : ${choice.title}", Toast.LENGTH_SHORT).show()
                        } else if (choice.fallbackIndex != null) {
                            selectedAudioIndex = choice.fallbackIndex
                            Toast.makeText(this, "Audio : ${choice.title}", Toast.LENGTH_SHORT).show()
                            reloadStreamPreservingPosition()
                        }
                    }
                    1 -> {
                        if (choice.isOff) {
                            selectedSubtitleIndex = -1
                            exo.trackSelectionParameters = exo.trackSelectionParameters.buildUpon()
                                .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
                                .clearOverridesOfType(C.TRACK_TYPE_TEXT)
                                .build()
                            Toast.makeText(this, "Sous-titres : Désactivés", Toast.LENGTH_SHORT).show()
                        } else if (choice.group != null && choice.trackIndex >= 0) {
                            selectedSubtitleIndex = choice.trackIndex
                            exo.trackSelectionParameters = exo.trackSelectionParameters.buildUpon()
                                .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false)
                                .setOverrideForType(TrackSelectionOverride(choice.group, choice.trackIndex))
                                .build()
                            Toast.makeText(this, "Sous-titres : ${choice.title}", Toast.LENGTH_SHORT).show()
                        } else if (choice.fallbackIndex != null) {
                            selectedSubtitleIndex = choice.fallbackIndex
                            Toast.makeText(this, "Sous-titres : ${choice.title}", Toast.LENGTH_SHORT).show()
                            reloadStreamPreservingPosition()
                        }
                    }
                    2 -> showSubtitleStyleDialog()
                }
                showOverlayAndScheduleHide()
            }
            .setOnDismissListener { dialogOpen = false; showOverlayAndScheduleHide() }
            .show()
    }

    private fun jumpToChapter(next: Boolean) {
        val exo = player ?: return
        val chapters = mediaItem.chapters
        if (chapters.size < 2) {
            if (next && playlist.size > 1) {
                playNextEpisodeInPlaylist()
            } else {
                seekRelative(if (next) 60_000L else -60_000L)
            }
            return
        }
        val currentTicks = exo.currentPosition * 10_000L
        val targetChapter = if (next) {
            val nextChap = chapters.firstOrNull { it.startPositionTicks > currentTicks + 20_000_000L }
            if (nextChap == null && playlist.size > 1) {
                playNextEpisodeInPlaylist()
                return
            }
            nextChap ?: chapters.last()
        } else {
            chapters.lastOrNull { it.startPositionTicks < currentTicks - 30_000_000L } ?: chapters.first()
        }
        exo.seekTo(targetChapter.startPositionTicks / 10_000L)
        Toast.makeText(this, targetChapter.name, Toast.LENGTH_SHORT).show()
        updateTimelineUi()
    }

    private fun report(event: String = "Progress", paused: Boolean = !resumePlaying) {
        val id = mediaItem.id
        val ticks = (player?.currentPosition ?: resumePosition).coerceAtLeast(0L) * 10_000L
        reportScope.launch { jellyfinClient.reportPlaybackProgress(id, ticks, paused, event) }
    }

    private fun playNextEpisodeInPlaylist() {
        val exo = player ?: return
        val idx = playlist.indexOfFirst { it.id == mediaItem.id }
        if (idx < 0 || idx + 1 >= playlist.size) {
            showOverlayAndScheduleHide()
            return
        }
        report("Stopped", true)
        mediaItem = playlist[idx + 1]
        selectedAudioIndex = null
        selectedSubtitleIndex = -1
        fallbackTried = false
        resumePosition = 0L
        resumePlaying = true
        bindMetadata()
        setStream(exo, 0L, true)
        report("", false)
    }

    private fun setStream(exo: ExoPlayer, position: Long, playing: Boolean) {
        val local = offlineManager.getLocalFileFor(mediaItem.id)
        if (local == null && StremioClient.owns(mediaItem.id)) {
            streamJob?.cancel()
            val selectedItem = mediaItem
            streamJob = lifecycleScope.launch {
                findViewById<View>(R.id.playerBuffering).visibility = View.VISIBLE
                try {
                    if (stremioKey != selectedItem.id) {
                        stremioStreams = jellyfinClient.playbackStreams(selectedItem)
                        stremioKey = selectedItem.id
                        stremioIndex = 0
                        stremioHlsFallback = false
                    }
                    if (player !== exo || mediaItem.id != selectedItem.id) return@launch
                    val stream = stremioStreams.getOrNull(stremioIndex)
                    if (stream == null) {
                        findViewById<View>(R.id.playerBuffering).visibility = View.GONE
                        Toast.makeText(this@PlayerActivity, "Aucun lien de lecture compatible. Vérifiez vos addons et votre compte Real-Debrid.", Toast.LENGTH_LONG).show()
                        return@launch
                    }
                    jellyfinClient.stremio.remember(selectedItem)
                    val chosenAudio = selectedItem.audioTracks.firstOrNull { it.index == selectedAudioIndex }
                    val wantEn = chosenAudio?.language?.startsWith("en", ignoreCase = true) == true ||
                        chosenAudio?.displayTitle?.contains("Anglais", ignoreCase = true) == true ||
                        chosenAudio?.displayTitle?.contains("English", ignoreCase = true) == true
                    val langCode = if (wantEn) "en" else "fr"

                    // Quand le film/programme est en français, désactiver les sous-titres
                    if (!wantEn && (selectedSubtitleIndex == null || selectedSubtitleIndex == -1)) {
                        selectedSubtitleIndex = -1
                    } else if (wantEn && (selectedSubtitleIndex == null || selectedSubtitleIndex == -1)) {
                        val frSub = selectedItem.subtitleTracks.firstOrNull {
                            it.language.startsWith("fr", ignoreCase = true) || it.displayTitle.contains("Français", ignoreCase = true)
                        }
                        if (frSub != null) selectedSubtitleIndex = frSub.index
                    }

                    val chosenSub = selectedItem.subtitleTracks.firstOrNull { it.index == selectedSubtitleIndex }
                    val subDisabled = selectedSubtitleIndex == null || selectedSubtitleIndex!! < 0 || chosenSub?.language == "off"
                    val subLang = chosenSub?.language?.takeIf { it != "off" } ?: "fr"
                    val paramsBuilder = exo.trackSelectionParameters.buildUpon()
                        .setPreferredAudioLanguage(langCode)
                        .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, subDisabled)
                    if (!subDisabled) {
                        paramsBuilder.setPreferredTextLanguage(subLang)
                    } else {
                        paramsBuilder.clearOverridesOfType(C.TRACK_TYPE_TEXT)
                    }
                    exo.trackSelectionParameters = paramsBuilder.build()
                    tvStreamModeBadge.text = if (stremioHlsFallback) {
                        if (wantEn) "HLS 1080p/4K · Audio EN" else "HLS 1080p/4K · Audio FR (Principal)"
                    } else {
                        if (wantEn) "Direct Play 4K/1080p · Audio EN" else "Direct Play 4K/1080p · Audio FR (Principal)"
                    }
                    findViewById<View>(R.id.btnQuality).isEnabled = true
                    findViewById<View>(R.id.btnSubtitles).isEnabled = true
                    val resolvedUrl = if (!stremioHlsFallback && stream.url.contains("/api/stremio/hls/") && stream.url.contains("/master.m3u8")) {
                        stream.url.substringBefore("?").replace("/api/stremio/hls/", "/api/stremio/media/").removeSuffix("/master.m3u8")
                    } else if (wantEn && stream.url.contains("/api/stremio/hls/")) {
                        val base = stream.url.substringBefore("?")
                        "$base?lang=en&fallback=1"
                    } else {
                        stream.url
                    }
                    val http = DefaultHttpDataSource.Factory().setDefaultRequestProperties(stream.headers)
                    val factory = DefaultMediaSourceFactory(DefaultDataSource.Factory(this@PlayerActivity, http))
                    val subConfigs = stream.subtitles.mapNotNull { sub ->
                        val subUri = Uri.parse(sub.url)
                        ExoMediaItem.SubtitleConfiguration.Builder(subUri)
                            .setMimeType(MimeTypes.TEXT_VTT)
                            .setLanguage(sub.lang)
                            .setLabel(sub.label)
                            .setRoleFlags(C.ROLE_FLAG_SUBTITLE)
                            .build()
                    }
                    val exoMediaItem = ExoMediaItem.Builder()
                        .setUri(resolvedUrl)
                        .setSubtitleConfigurations(subConfigs)
                        .build()
                    exo.setMediaSource(factory.createMediaSource(exoMediaItem), position)
                    exo.prepare(); exo.playWhenReady = playing
                    showOverlayAndScheduleHide()
                } catch (error: Exception) {
                    if (error is CancellationException) throw error
                    findViewById<View>(R.id.playerBuffering).visibility = View.GONE
                    Toast.makeText(this@PlayerActivity, "Impossible de résoudre les liens Stremio. Vérifiez la configuration des addons.", Toast.LENGTH_LONG).show()
                }
            }
            return
        }
        val url = local?.toURI()?.toString() ?: jellyfinClient.buildPlaybackUrl(mediaItem, selectedBitrate, selectedAudioIndex, selectedSubtitleIndex)
        tvStreamModeBadge.text = when {
            local != null -> "Hors ligne"
            url.contains(".m3u8") -> "Lecture adaptée · H.264"
            else -> "Qualité originale"
        }
        findViewById<View>(R.id.btnQuality).isEnabled = local == null
        findViewById<View>(R.id.btnSubtitles).isEnabled = local == null
        val jSubDisabled = selectedSubtitleIndex == null || selectedSubtitleIndex == -1
        val jParams = exo.trackSelectionParameters.buildUpon().setTrackTypeDisabled(C.TRACK_TYPE_TEXT, jSubDisabled)
        if (!jSubDisabled) {
            val chosen = mediaItem.subtitleTracks.firstOrNull { it.index == selectedSubtitleIndex }
            jParams.setPreferredTextLanguage(chosen?.language?.takeIf { it != "off" } ?: "fr")
        } else {
            jParams.clearOverridesOfType(C.TRACK_TYPE_TEXT)
        }
        exo.trackSelectionParameters = jParams.build()
        exo.setMediaItem(ExoMediaItem.fromUri(url), position)
        exo.prepare()
        exo.playWhenReady = playing
        showOverlayAndScheduleHide()
    }

    private fun reloadStreamPreservingPosition() {
        val exo = player ?: return
        val position = exo.currentPosition
        val playing = exo.playWhenReady
        fallbackTried = false
        setStream(exo, position, playing)
    }

    private fun initializeExoPlayer() {
        if (player != null || !::mediaItem.isInitialized) return
        val loadControl = DefaultLoadControl.Builder()
            .setBufferDurationsMs(20_000, 60_000, 1_000, 4_000)
            .setTargetBufferBytes(32 * 1024 * 1024)
            .setPrioritizeTimeOverSizeThresholds(false).build()
        val exo = ExoPlayer.Builder(this).setLoadControl(loadControl).build()
        exo.trackSelectionParameters = exo.trackSelectionParameters.buildUpon().setPreferredAudioLanguage("fr").build()
        player = exo
        playerView.player = exo
        exo.addListener(object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                btnPlayPause.setImageResource(if (exo.playWhenReady && exo.playbackState != Player.STATE_ENDED) R.drawable.ic_player_pause else R.drawable.ic_player_play)
                if (isPlaying) showOverlayAndScheduleHide() else uiHandler.removeCallbacks(hideOverlayRunnable)
            }
            override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
                btnPlayPause.setImageResource(if (playWhenReady) R.drawable.ic_player_pause else R.drawable.ic_player_play)
                report(paused = !playWhenReady)
            }
            override fun onPlaybackStateChanged(state: Int) {
                findViewById<View>(R.id.playerBuffering).visibility = if (state == Player.STATE_BUFFERING) View.VISIBLE else View.GONE
                if (state == Player.STATE_READY) {
                    val duration = exo.duration
                    if (duration > 0) chapterProgressBar.setChapterFractions(mediaItem.chapters.map { (it.startPositionTicks / 10_000.0 / duration).toFloat() })
                }
                if (state == Player.STATE_ENDED) {
                    btnPlayPause.setImageResource(R.drawable.ic_player_play)
                    playNextEpisodeInPlaylist()
                }
            }
            override fun onPlayerError(error: PlaybackException) {
                findViewById<View>(R.id.playerBuffering).visibility = View.GONE
                if (StremioClient.owns(mediaItem.id)) {
                    if (!stremioHlsFallback) {
                        stremioHlsFallback = true
                        setStream(exo, exo.currentPosition.coerceAtLeast(0L), exo.playWhenReady)
                    } else if (stremioIndex + 1 < stremioStreams.size) {
                        stremioIndex++
                        stremioHlsFallback = false
                        setStream(exo, exo.currentPosition.coerceAtLeast(0L), exo.playWhenReady)
                    } else {
                        Toast.makeText(this@PlayerActivity, "Les liens proposés ne sont pas lisibles sur cet appareil.", Toast.LENGTH_LONG).show()
                        showOverlayAndScheduleHide()
                    }
                    return
                }
                if (!fallbackTried && selectedBitrate == null && offlineManager.getLocalFileFor(mediaItem.id) == null) {
                    fallbackTried = true
                    selectedBitrate = 4_000_000
                    setStream(exo, exo.currentPosition.coerceAtLeast(0L), exo.playWhenReady)
                    return
                }
                showOverlayAndScheduleHide()
                dialogOpen = true
                AlertDialog.Builder(this@PlayerActivity).setTitle("Lecture interrompue")
                    .setMessage("Le flux ne peut pas être lu. Vérifiez le serveur et sa capacité de transcodage. Code : " + error.errorCodeName)
                    .setPositiveButton("Réessayer") { _, _ -> exo.prepare() }
                    .setNegativeButton("Retour") { _, _ -> finish() }
                    .setOnDismissListener { dialogOpen = false; showOverlayAndScheduleHide() }.show()
            }
        })
        setStream(exo, resumePosition, resumePlaying)
        report("", !resumePlaying)
        uiHandler.removeCallbacks(progressUpdater)
        uiHandler.post(progressUpdater)
    }

    private fun seekRelative(deltaMs: Long) {
        val exo = player ?: return
        val duration = exo.duration.takeIf { it > 0 } ?: Long.MAX_VALUE
        val target = (exo.currentPosition + deltaMs).coerceIn(0L, duration)
        exo.seekTo(target)
        updateTimelineUi()
    }

    private fun updateTimelineUi() {
        val exo = player ?: return
        val durationMs = exo.duration.takeIf { it > 0 }
            ?: (mediaItem.runtimeTicks / 10_000L).takeIf { it > 0 }
            ?: 0L

        val currentMs = exo.currentPosition.coerceAtLeast(0L)
        val remainingMs = (durationMs - currentMs).coerceAtLeast(0L)

        tvElapsedTime.text = formatDurationMs(currentMs)
        tvRemainingTime.text = "-${formatDurationMs(remainingMs)}"
        chapterProgressBar.progressFraction = if (durationMs > 0) (currentMs.toFloat() / durationMs.toFloat()).coerceIn(0f, 1f) else 0f
        chapterProgressBar.contentDescription = "${formatDurationMs(currentMs)} sur ${formatDurationMs(durationMs)}"

        val endTimeDate = Date(System.currentTimeMillis() + remainingMs)
        val formatter = SimpleDateFormat("HH:mm", Locale.FRANCE)
        tvEndsAt.text = if (durationMs <= 0) "Durée inconnue" else if (!exo.playWhenReady) "En pause" else "Fin à ${formatter.format(endTimeDate)}"
    }

    private fun formatDurationMs(ms: Long): String {
        val totalSec = ms / 1000L
        val hours = totalSec / 3600L
        val minutes = (totalSec % 3600L) / 60L
        val seconds = totalSec % 60L
        return if (hours > 0) {
            String.format(Locale.FRANCE, "%d:%02d:%02d", hours, minutes, seconds)
        } else {
            String.format(Locale.FRANCE, "%02d:%02d", minutes, seconds)
        }
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        when (keyCode) {
            KeyEvent.KEYCODE_MEDIA_PLAY -> { player?.play(); showOverlayAndScheduleHide(); return true }
            KeyEvent.KEYCODE_MEDIA_PAUSE -> { player?.pause(); showOverlayAndScheduleHide(); return true }
            KeyEvent.KEYCODE_MEDIA_REWIND -> { seekRelative(-10_000L); showOverlayAndScheduleHide(); return true }
            KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> { seekRelative(10_000L); showOverlayAndScheduleHide(); return true }
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> {
                btnPlayPause.performClick()
                return true
            }
            KeyEvent.KEYCODE_DPAD_CENTER -> {
                if (playerOverlay.visibility != View.VISIBLE) {
                    showOverlayAndScheduleHide()
                    btnPlayPause.requestFocus()
                    return true
                }
            }
            KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_DPAD_DOWN -> {
                if (playerOverlay.visibility != View.VISIBLE) {
                    showOverlayAndScheduleHide()
                    btnPlayPause.requestFocus()
                    return true
                } else {
                    showOverlayAndScheduleHide()
                }
            }
            KeyEvent.KEYCODE_DPAD_LEFT -> {
                if (playerOverlay.visibility != View.VISIBLE) {
                    seekRelative(-10_000L)
                    showOverlayAndScheduleHide()
                    return true
                } else {
                    showOverlayAndScheduleHide()
                }
            }
            KeyEvent.KEYCODE_DPAD_RIGHT -> {
                if (playerOverlay.visibility != View.VISIBLE) {
                    seekRelative(10_000L)
                    showOverlayAndScheduleHide()
                    return true
                } else {
                    showOverlayAndScheduleHide()
                }
            }
            KeyEvent.KEYCODE_BACK -> {
                if (playerOverlay.visibility == View.VISIBLE && player?.isPlaying == true) {
                    uiHandler.removeCallbacks(hideOverlayRunnable)
                    playerOverlay.animate()
                        .alpha(0f)
                        .setDuration(200)
                        .withEndAction {
                            playerOverlay.visibility = View.GONE
                            playerOverlay.alpha = 1f
                        }
                        .start()
                    return true
                }
            }
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onStart() {
        super.onStart()
        if (Build.VERSION.SDK_INT > 23) initializeExoPlayer()
    }
    override fun onResume() {
        super.onResume()
        if (Build.VERSION.SDK_INT <= 23) initializeExoPlayer()
    }
    private fun releasePlayer() {
        uiHandler.removeCallbacksAndMessages(null)
        playerOverlay.animate().cancel()
        player?.let { exo ->
            resumePosition = exo.currentPosition.coerceAtLeast(0L)
            resumePlaying = exo.playWhenReady
            report("Stopped", true)
            playerView.player = null
            exo.release()
        }
        player = null
    }
    override fun onPause() {
        if (Build.VERSION.SDK_INT <= 23 && ::playerOverlay.isInitialized) releasePlayer()
        super.onPause()
    }
    override fun onStop() {
        streamJob?.cancel()
        if (Build.VERSION.SDK_INT > 23 && ::playerOverlay.isInitialized) releasePlayer()
        super.onStop()
    }
    override fun onSaveInstanceState(outState: Bundle) {
        outState.putLong("position", player?.currentPosition ?: resumePosition)
        outState.putBoolean("playing", player?.playWhenReady ?: resumePlaying)
        outState.putInt("bitrate", selectedBitrate ?: 0)
        outState.putInt("audio", selectedAudioIndex ?: -1)
        outState.putInt("subtitle", selectedSubtitleIndex ?: -1)
        intent.putExtra("media_item", mediaItem)
        super.onSaveInstanceState(outState)
    }
}
