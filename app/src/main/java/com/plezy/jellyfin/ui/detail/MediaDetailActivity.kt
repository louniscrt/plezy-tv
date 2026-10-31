package com.plezy.jellyfin.ui.detail

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.bumptech.glide.Glide
import com.plezy.jellyfin.R
import com.plezy.jellyfin.data.api.JellyfinClient
import com.plezy.jellyfin.data.api.SeerrClient
import com.plezy.jellyfin.data.local.OfflineDownloadManager
import com.plezy.jellyfin.data.model.CastMember
import com.plezy.jellyfin.data.model.MediaItem
import com.plezy.jellyfin.data.model.MediaType
import com.plezy.jellyfin.data.model.OverseerrStatus
import com.plezy.jellyfin.ui.common.CastCardAdapter
import com.plezy.jellyfin.ui.common.MediaCardAdapter
import com.plezy.jellyfin.ui.player.PlayerActivity
import kotlinx.coroutines.launch

/**
 * Écran Détails Média / Série identique au pixel près à **Infuse 8 Liquid Glass** (`media_1793397585039_7f5505ca.png` "MAD MEN") :
 * - ClearLogo officiel transparent Jellyfin (`ivDetailLogo`) en haut à gauche avec repli sur le grand titre.
 * - Sous-titre d'épisode (`S1 • E2 - Ladies Room`), ligne technique avec badge encadré `[TV-14]`, genres (`Drama`), badges `THE MOVIE DB 7.6`, `Metacritic 77`, `73%`.
 * - Rangée 1 : 5 pilules ovales Liquid Glass vectorielles (`[Eye] [Bookmark] [Star] [AddBox] [•••]`).
 * - Rangée 2 : 2 grands boutons pilules Liquid Glass (`Resume 00:01:39` + `Trailer` / `Request on Seerr`).
 * - Rail `Season 1` : Vignettes 16:9 avec triangle orange diagonal en coin haut-droit pour les épisodes non vus + titre numéroté `1. Smoke Gets in Your Eyes`.
 * - Rail `Cast and Crew` : Cartes portraits arrondies avec les vraies photos des acteurs depuis Jellyfin / TMDB.
 */
class MediaDetailActivity : AppCompatActivity() {

    private lateinit var jellyfinClient: JellyfinClient
    private lateinit var seerrClient: SeerrClient
    private lateinit var offlineManager: OfflineDownloadManager
    private lateinit var currentItem: MediaItem
    private var selectedEpisode: MediaItem? = null
    private val allEpisodes = mutableListOf<MediaItem>()
    private var isWatchedState = false
    private var seasons: Map<Int, List<MediaItem>> = emptyMap()
    private var activeSeason = 0
    private var hasResumed = false
    private val savedStore by lazy { com.plezy.jellyfin.data.local.SavedMediaStore(this, jellyfinClient.userId) }

    private lateinit var ivBackdrop: ImageView
    private lateinit var ivLogo: ImageView
    private lateinit var tvTitle: TextView
    private lateinit var tvEpisodeSubtitle: TextView
    private lateinit var tvMeta: TextView
    private lateinit var tvTechRatingBadge: TextView
    private lateinit var tvMetaRight: TextView
    private lateinit var tvGenres: TextView
    private lateinit var tvTmdbRating: TextView
    private lateinit var tvMetacriticScore: TextView
    private lateinit var tvTraktScore: TextView
    private lateinit var tvOverview: TextView
    private lateinit var btnPlayEpisode: Button
    private lateinit var btnOverseerrRequest: Button
    private lateinit var btnMarkWatched: View
    private lateinit var tvSeason1Header: TextView
    private lateinit var tvSeason2Header: TextView
    private lateinit var rvSeason1: RecyclerView
    private lateinit var rvSeason2: RecyclerView
    private lateinit var rvCastCrew: RecyclerView

    private lateinit var season1Adapter: MediaCardAdapter
    private lateinit var season2Adapter: MediaCardAdapter
    private lateinit var castAdapter: CastCardAdapter

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_media_detail)

        jellyfinClient = JellyfinClient(this)
        seerrClient = SeerrClient(this)
        offlineManager = OfflineDownloadManager(this)
        @Suppress("DEPRECATION")
        currentItem = (intent.getSerializableExtra("media_item") as? MediaItem) ?: run {
            finish()
            return
        }

        ivBackdrop = findViewById(R.id.ivDetailBackdrop)
        ivLogo = findViewById(R.id.ivDetailLogo)
        tvTitle = findViewById(R.id.tvDetailTitle)
        tvEpisodeSubtitle = findViewById(R.id.tvDetailEpisodeSubtitle)
        tvMeta = findViewById(R.id.tvDetailMeta)
        tvTechRatingBadge = findViewById(R.id.tvTechRatingBadge)
        tvMetaRight = findViewById(R.id.tvDetailMetaRight)
        tvGenres = findViewById(R.id.tvDetailGenres)
        tvTmdbRating = findViewById(R.id.tvTmdbRating)
        tvMetacriticScore = findViewById(R.id.tvMetacriticScore)
        tvTraktScore = findViewById(R.id.tvTraktScore)
        tvOverview = findViewById(R.id.tvDetailOverview)
        btnPlayEpisode = findViewById(R.id.btnPlayEpisode)
        btnOverseerrRequest = findViewById(R.id.btnOverseerrRequest)
        btnMarkWatched = findViewById(R.id.btnMarkWatched)
        tvSeason1Header = findViewById(R.id.tvSeason1Header)
        tvSeason2Header = findViewById(R.id.tvSeason2Header)
        rvSeason1 = findViewById(R.id.rvSeason1)
        rvSeason2 = findViewById(R.id.rvSeason2)
        rvCastCrew = findViewById(R.id.rvCastCrew)

        setupActionButtons()
        setupSeasonAndCastRails()
        bindHeader(currentItem)

        loadDetails()
        btnPlayEpisode.requestFocus()
    }

    override fun onResume() {
        super.onResume()
        if (hasResumed) loadDetails()
        hasResumed = true
    }

    private fun loadDetails() {
        btnPlayEpisode.isEnabled = false
        lifecycleScope.launch {
            if (currentItem.isSeerrMedia) {
                val tmdbId = currentItem.tmdbId
                if (tmdbId != null) seerrClient.getMediaDetails(tmdbId, currentItem.type == MediaType.SERIES)?.let { currentItem = it }
                if (currentItem.overseerrStatus == OverseerrStatus.AVAILABLE_ON_JELLYFIN) {
                    jellyfinClient.resolveSeerrItem(currentItem)?.let { currentItem = it }
                }
            } else {
                jellyfinClient.getItemDetails(currentItem.id)?.let { currentItem = it }
            }
            bindHeader(currentItem)
            btnPlayEpisode.isEnabled = true
            when {
                currentItem.isSeerrMedia -> {
                    tvSeason1Header.visibility = View.GONE
                    rvSeason1.visibility = View.GONE
                    tvSeason2Header.visibility = View.GONE
                    rvSeason2.visibility = View.GONE
                }
                currentItem.type == MediaType.SERIES || currentItem.type == MediaType.EPISODE -> loadSeasons()
                currentItem.type == MediaType.COLLECTION || currentItem.type == MediaType.PLAYLIST -> {
                    btnPlayEpisode.visibility = View.GONE
                    btnOverseerrRequest.visibility = View.GONE
                    tvSeason1Header.text = "Dans cette collection"
                    season1Adapter.submitList(jellyfinClient.getCollectionItems(currentItem.id))
                }
                else -> loadRelatedMovies()
            }
        }
    }

    private fun setupActionButtons() {
        findViewById<View>(R.id.btnBack).setOnClickListener { finish() }

        btnPlayEpisode.setOnClickListener {
            val target = selectedEpisode ?: currentItem
            if (target.isSeerrMedia && target.overseerrStatus == OverseerrStatus.AVAILABLE_ON_JELLYFIN) {
                Toast.makeText(this, "Média annoncé disponible, mais introuvable dans Jellyfin. Actualisez la bibliothèque.", Toast.LENGTH_LONG).show()
            } else if (target.type == MediaType.SERIES && !target.isSeerrMedia) {
                Toast.makeText(this, "Aucun épisode disponible pour cette série", Toast.LENGTH_SHORT).show()
            } else if (!target.isReadyToPlay) {
                triggerOverseerrRequest(target)
            } else {
                openPlayer(target)
            }
        }

        btnOverseerrRequest.setOnClickListener {
            val target = selectedEpisode ?: currentItem
            if (!target.trailerUrl.isNullOrBlank()) {
                try {
                    val intent = Intent(Intent.ACTION_VIEW, android.net.Uri.parse(target.trailerUrl))
                    startActivity(intent)
                } catch (e: Exception) {
                    Toast.makeText(this, "Bande-annonce: ${target.trailerUrl}", Toast.LENGTH_LONG).show()
                }
            } else if (!target.isReadyToPlay) {
                triggerOverseerrRequest(target)
            } else {
                val options = arrayOf(
                    "▶ Lecture depuis le début (00:00)",
                    "＋ Demander sur Seerr",
                    "⚙ Configurer Seerr / Clé API"
                )
                AlertDialog.Builder(this)
                    .setTitle(target.title)
                    .setItems(options) { _, which ->
                        when (which) {
                            0 -> openPlayer(target.copy(playbackPositionTicks = 0L))
                            1 -> triggerOverseerrRequest(target)
                            2 -> showSeerrAuthDialog(target)
                        }
                    }
                    .show()
            }
        }

        findViewById<View>(R.id.btnShuffle).setOnClickListener {
            val added = savedStore.toggle(currentItem)
            findViewById<View>(R.id.btnShuffle).isSelected = added
            Toast.makeText(this, if (added) "Ajouté à Ma liste" else "Retiré de Ma liste", Toast.LENGTH_SHORT).show()
        }

        findViewById<View>(R.id.btnRateStar).setOnClickListener {
            val target = currentItem
            if (target.isSeerrMedia) return@setOnClickListener
            val view = findViewById<View>(R.id.btnRateStar)
            val next = !view.isSelected
            lifecycleScope.launch {
                if (jellyfinClient.setFavorite(target.id, next)) {
                    view.isSelected = next
                    currentItem = currentItem.copy(isFavorite = next)
                    Toast.makeText(this@MediaDetailActivity, if (next) "Ajouté aux favoris Jellyfin" else "Retiré des favoris Jellyfin", Toast.LENGTH_SHORT).show()
                } else Toast.makeText(this@MediaDetailActivity, "Impossible de modifier les favoris", Toast.LENGTH_SHORT).show()
            }
        }

        findViewById<View>(R.id.btnDownload).setOnClickListener {
            val target = selectedEpisode ?: currentItem
            if (target.isOverseerrItem) {
                triggerOverseerrRequest(target)
                return@setOnClickListener
            }
            val streamUrl = jellyfinClient.buildPlaybackUrl(target)
            Toast.makeText(this, "Downloading: ${target.title}", Toast.LENGTH_SHORT).show()
            lifecycleScope.launch {
                offlineManager.enqueueDownload(target, streamUrl).onSuccess {
                    Toast.makeText(this@MediaDetailActivity, "Téléchargement terminé", Toast.LENGTH_SHORT).show()
                }.onFailure {
                    Toast.makeText(this@MediaDetailActivity, it.message ?: "Échec du téléchargement", Toast.LENGTH_LONG).show()
                }
            }
        }

        btnMarkWatched.setOnClickListener {
            val target = selectedEpisode ?: currentItem
            if (target.isSeerrMedia) return@setOnClickListener
            val next = !isWatchedState
            btnMarkWatched.isEnabled = false
            lifecycleScope.launch {
                if (jellyfinClient.setPlayedStatus(target.id, next)) {
                    isWatchedState = next
                    btnMarkWatched.isSelected = next
                    if (selectedEpisode != null) selectedEpisode = target.copy(isPlayed = next) else currentItem = target.copy(isPlayed = next)
                    Toast.makeText(this@MediaDetailActivity, if (next) "Marqué comme vu" else "Marqué comme non vu", Toast.LENGTH_SHORT).show()
                } else Toast.makeText(this@MediaDetailActivity, "Modification impossible : vérifiez le serveur", Toast.LENGTH_SHORT).show()
                btnMarkWatched.isEnabled = true
            }
        }

        findViewById<View>(R.id.btnMore).setOnClickListener {
            val target = selectedEpisode ?: currentItem
            val options = arrayOf(
                "Play from Beginning (00:00:00)",
                "Request on Seerr -> Radarr / Sonarr",
                "Configure Seerr Login / API Key",
                "Force H.264 Transcode (Safe Mode)"
            )
            AlertDialog.Builder(this)
                .setTitle(target.title)
                .setItems(options) { _, which ->
                    when (which) {
                        0 -> openPlayer(target.copy(playbackPositionTicks = 0L))
                        1 -> triggerOverseerrRequest(target)
                        2 -> showSeerrAuthDialog(target)
                        3 -> openPlayer(target.copy(videoCodec = "hevc"))
                    }
                }
                .show()
        }
    }

    private fun triggerOverseerrRequest(item: MediaItem) {
        btnPlayEpisode.isEnabled = false
        btnPlayEpisode.text = "Envoi..."
        lifecycleScope.launch {
            val res = seerrClient.requestMedia(item)
            btnPlayEpisode.isEnabled = true
            res.onSuccess { msg ->
                btnPlayEpisode.text = "⏳ Demandé (En cours)"
                if (!item.trailerUrl.isNullOrBlank()) {
                    btnOverseerrRequest.text = "▶ Bande-annonce"
                }
                Toast.makeText(this@MediaDetailActivity, "Demande envoyée à Seerr -> Radarr/Sonarr !", Toast.LENGTH_LONG).show()
            }.onFailure { err ->
                btnPlayEpisode.text = if (!item.isReadyToPlay) "＋ Demander sur Seerr" else item.resumeLabel
                if (err.message == "AUTH_REQUIRED") {
                    showSeerrAuthDialog(item)
                } else {
                    Toast.makeText(this@MediaDetailActivity, "Erreur Seerr: ${err.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    /**
     * Si l'utilisateur n'a pas encore connecté son compte Seerr,
     * ouvre une boîte de dialogue pour saisir une seule fois son Email/Utilisateur + Mot de passe Seerr (ou sa clé API Seerr),
     * puis envoie immédiatement la requête à Seerr -> Radarr / Sonarr -> Transmission !
     */
    private fun showSeerrAuthDialog(itemToRequest: MediaItem) {
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 24, 48, 12)
        }
        val etUserOrKey = EditText(this).apply {
            hint = "Seerr Email / Username OR API Key"
            setText(seerrClient.apiKey)
            setSingleLine(true)
        }
        val etPassword = EditText(this).apply {
            hint = "Seerr Password (leave empty if using API Key)"
            setSingleLine(true)
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        container.addView(etUserOrKey)
        container.addView(etPassword)

        AlertDialog.Builder(this)
            .setTitle("Connect Seerr -> Radarr / Sonarr")
            .setMessage("To send « ${itemToRequest.title} » directly to Radarr/Sonarr and Transmission, enter your Seerr login or API Key:")
            .setView(container)
            .setPositiveButton("Connect & Request") { _, _ ->
                val userOrKey = etUserOrKey.text?.toString().orEmpty()
                val pass = etPassword.text?.toString().orEmpty()
                lifecycleScope.launch {
                    val authRes = seerrClient.authenticateSeerr(userOrKey, pass)
                    authRes.onSuccess {
                        triggerOverseerrRequest(itemToRequest)
                    }.onFailure { err ->
                        Toast.makeText(this@MediaDetailActivity, err.message ?: "Seerr Auth Failed", Toast.LENGTH_LONG).show()
                    }
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun setupSeasonAndCastRails() {
        season1Adapter = MediaCardAdapter(
            style = MediaCardAdapter.CardStyle.EPISODE,
            onItemFocused = { ep -> bindEpisodeFocus(ep) },
            onItemClicked = { ep ->
                if (ep.type == MediaType.EPISODE && !ep.isSeerrMedia) openPlayer(ep) else openRelatedItem(ep)
            }
        )

        season2Adapter = MediaCardAdapter(
            style = MediaCardAdapter.CardStyle.EPISODE,
            onItemFocused = { ep -> bindEpisodeFocus(ep) },
            onItemClicked = { ep ->
                if (ep.type == MediaType.EPISODE && !ep.isSeerrMedia) openPlayer(ep) else openRelatedItem(ep)
            }
        )

        castAdapter = CastCardAdapter()

        rvSeason1.layoutManager = LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, false)
        rvSeason1.setHasFixedSize(true)
        rvSeason1.adapter = season1Adapter

        rvSeason2.layoutManager = LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, false)
        rvSeason2.setHasFixedSize(true)
        rvSeason2.adapter = season2Adapter

        rvCastCrew.layoutManager = LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, false)
        rvCastCrew.setHasFixedSize(true)
        rvCastCrew.adapter = castAdapter
    }

    private fun openRelatedItem(item: MediaItem) {
        val intent = Intent(this, MediaDetailActivity::class.java)
        intent.putExtra("media_item", item)
        startActivity(intent)
    }

    private fun loadSeasons() {
        val seriesId = currentItem.seriesId ?: currentItem.id
        lifecycleScope.launch {
            seasons = jellyfinClient.getEpisodesBySeason(seriesId)
            allEpisodes.clear()
            seasons.toSortedMap().values.forEach { allEpisodes.addAll(it.sortedBy { ep -> ep.episodeNumber ?: 0 }) }
            val initial = allEpisodes.firstOrNull { it.id == selectedEpisode?.id }
                ?: allEpisodes.firstOrNull { it.id == currentItem.id }
                ?: allEpisodes.firstOrNull { it.playbackPositionTicks > 0 && !it.isPlayed }
                ?: allEpisodes.firstOrNull { !it.isPlayed }
                ?: allEpisodes.firstOrNull()
            if (initial != null) {
                activeSeason = initial.seasonNumber ?: seasons.keys.first()
                showSeason(activeSeason)
                bindEpisodeFocus(initial)
            } else {
                tvSeason1Header.text = "Aucun épisode disponible"
                rvSeason1.visibility = View.GONE
            }
            tvSeason2Header.visibility = View.GONE
            rvSeason2.visibility = View.GONE
            tvSeason1Header.isFocusable = seasons.size > 1
            tvSeason1Header.isClickable = seasons.size > 1
            tvSeason1Header.setBackgroundResource(R.drawable.bg_pill_button)
            tvSeason1Header.setPadding(16, 10, 16, 10)
            tvSeason1Header.setTextColor(androidx.core.content.ContextCompat.getColorStateList(this@MediaDetailActivity, R.color.pill_text_color))
            tvSeason1Header.setOnClickListener {
                val keys = seasons.keys.sorted()
                AlertDialog.Builder(this@MediaDetailActivity).setTitle("Choisir une saison")
                    .setSingleChoiceItems(keys.map { "Saison $it" }.toTypedArray(), keys.indexOf(activeSeason)) { dialog, which ->
                        showSeason(keys[which])
                        dialog.dismiss()
                        rvSeason1.requestFocus()
                    }.show()
            }
        }
    }

    private fun showSeason(number: Int) {
        activeSeason = number
        tvSeason1Header.visibility = View.VISIBLE
        rvSeason1.visibility = View.VISIBLE
        tvSeason1Header.text = "Saison $number" + if (seasons.size > 1) "  ·  Changer de saison" else ""
        season1Adapter.submitList(seasons[number].orEmpty())
        rvSeason1.scrollToPosition(0)
    }

    private fun loadRelatedMovies() {
        lifecycleScope.launch {
            tvSeason1Header.text = "Related & Trending"
            val trending = seerrClient.getTrendingDiscover()
            season1Adapter.submitList(trending)
            tvSeason2Header.visibility = View.GONE
            rvSeason2.visibility = View.GONE
        }
    }

    private fun bindHeader(item: MediaItem) {
        if (!item.logoImageUrl.isNullOrBlank()) {
            ivLogo.visibility = View.VISIBLE
            tvTitle.visibility = View.GONE
            Glide.with(this)
                .load(item.logoImageUrl)
                .override(500, 140)
                .fitCenter()
                .listener(object : com.bumptech.glide.request.RequestListener<android.graphics.drawable.Drawable> {
                    override fun onLoadFailed(e: com.bumptech.glide.load.engine.GlideException?, model: Any?, target: com.bumptech.glide.request.target.Target<android.graphics.drawable.Drawable>, isFirstResource: Boolean): Boolean {
                        ivLogo.visibility = View.GONE
                        tvTitle.text = item.seriesName ?: item.title
                        tvTitle.visibility = View.VISIBLE
                        return false
                    }
                    override fun onResourceReady(resource: android.graphics.drawable.Drawable, model: Any, target: com.bumptech.glide.request.target.Target<android.graphics.drawable.Drawable>?, dataSource: com.bumptech.glide.load.DataSource, isFirstResource: Boolean) = false
                })
                .into(ivLogo)
        } else {
            ivLogo.visibility = View.GONE
            tvTitle.visibility = View.VISIBLE
            tvTitle.text = item.seriesName ?: item.title
        }

        tvEpisodeSubtitle.text = item.infuseEpisodeHeader
        tvMeta.text = "${item.formattedDuration}   ${item.formattedDateOrYear}"
        tvTechRatingBadge.text = item.officialRating.orEmpty()
        tvTechRatingBadge.visibility = if (item.officialRating.isNullOrBlank()) View.GONE else View.VISIBLE
        findViewById<View>(R.id.btnRateStar).isSelected = item.isFavorite
        findViewById<View>(R.id.btnRateStar).isEnabled = !item.isSeerrMedia
        btnMarkWatched.isEnabled = !item.isSeerrMedia
        isWatchedState = item.isPlayed
        btnMarkWatched.isSelected = isWatchedState
        findViewById<View>(R.id.btnShuffle).isSelected = savedStore.contains(item.id)
        tvMetaRight.text = "${item.resolutionBadge}   ${item.audioFormatLabel}"
        tvGenres.text = item.genres.joinToString(" · ")

        tvTmdbRating.text = item.communityRating?.let { "★ %.1f / 10".format(it) } ?: ""
        tvMetacriticScore.text = item.criticRating?.let { "Critiques : $it %" } ?: ""
        tvMetacriticScore.visibility = if (item.criticRating == null) View.GONE else View.VISIBLE
        tvTraktScore.visibility = View.GONE

        tvOverview.text = item.overview

        val castItems = if (item.castList.isNotEmpty()) {
            item.castList
        } else {
            item.castMembers.mapIndexed { idx, raw ->
                val name = raw.substringBefore(" (")
                val role = raw.substringAfter("(", "").removeSuffix(")")
                CastMember(id = "cast_$idx", name = name, role = role.ifBlank { "Cast" }, imageUrl = null)
            }
        }
        castAdapter.submitList(castItems)

        if (!item.isReadyToPlay) {
            btnPlayEpisode.text = if (item.overseerrStatus == OverseerrStatus.REQUESTED || seerrClient.isAlreadyRequested(item)) {
                "⏳ Demandé (En cours)"
            } else {
                "＋ Demander sur Seerr"
            }
            btnOverseerrRequest.text = if (!item.trailerUrl.isNullOrBlank()) "▶ Bande-annonce" else "ℹ Info Seerr"
        } else {
            btnPlayEpisode.text = item.resumeLabel
            btnOverseerrRequest.text = if (!item.trailerUrl.isNullOrBlank()) "▶ Bande-annonce" else "Options"
        }

        val backdrop = item.backdropImageUrl ?: item.primaryImageUrl
        if (!backdrop.isNullOrBlank()) {
            Glide.with(this)
                .load(backdrop)
                .override(1280, 720)
                .centerCrop()
                .into(ivBackdrop)
        }
    }

    private fun bindEpisodeFocus(ep: MediaItem) {
        if (ep.isOverseerrItem) return
        selectedEpisode = ep
        isWatchedState = ep.isPlayed
        btnMarkWatched.isSelected = isWatchedState
        tvEpisodeSubtitle.text = ep.infuseEpisodeHeader
        tvMeta.text = "${ep.formattedDuration}   ${ep.formattedDateOrYear}"
        tvTechRatingBadge.text = ep.officialRating?.takeIf { it.isNotBlank() } ?: currentItem.officialRating ?: "TV-14"
        tvMetaRight.text = "${ep.resolutionBadge}   ${ep.audioFormatLabel}"
        if (ep.overview.isNotBlank()) {
            tvOverview.text = ep.overview
        }
        btnPlayEpisode.text = ep.resumeLabel
    }

    private fun openPlayer(item: MediaItem) {
        if (item.isSeerrMedia || item.type == MediaType.SERIES) return
        val intent = Intent(this, PlayerActivity::class.java)
        intent.putExtra("media_item", item)
        intent.putExtra("playlist", ArrayList(allEpisodes))
        startActivity(intent)
    }
}
