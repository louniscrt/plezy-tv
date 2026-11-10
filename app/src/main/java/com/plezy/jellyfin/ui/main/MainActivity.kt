package com.plezy.jellyfin.ui.main

import android.content.Intent
import android.graphics.drawable.Drawable
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.bumptech.glide.Glide
import com.bumptech.glide.load.DataSource
import com.bumptech.glide.load.engine.GlideException
import com.bumptech.glide.load.resource.drawable.DrawableTransitionOptions
import com.bumptech.glide.request.RequestListener
import com.bumptech.glide.request.target.Target
import com.plezy.jellyfin.R
import com.plezy.jellyfin.data.api.JellyfinClient
import com.plezy.jellyfin.data.api.SeerrCategory
import com.plezy.jellyfin.data.api.SeerrClient
import com.plezy.jellyfin.data.local.OfflineDownloadManager
import com.plezy.jellyfin.data.local.SavedMediaStore
import com.plezy.jellyfin.data.model.MediaItem
import com.plezy.jellyfin.data.model.MediaType
import com.plezy.jellyfin.data.model.OverseerrStatus
import com.plezy.jellyfin.ui.common.NetflixRowAdapter
import com.plezy.jellyfin.ui.common.RowsScrollView
import com.plezy.jellyfin.ui.common.StartAlignLayoutManager
import com.plezy.jellyfin.ui.detail.MediaDetailActivity
import com.plezy.jellyfin.ui.login.ServerSetupActivity
import com.plezy.jellyfin.ui.player.PlayerActivity
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Reproduction exacte de l'interface Netflix TV (media_1793484172329_ae29df35.png) :
 * - Barre latérale gauche 54dp avec barre rouge verticale sur l'onglet actif.
 * - Grand Billboard cinématique : [P] FILM / S É R I E -> Titre géant -> [ ▶ Lecture ] [ Plus d'infos ] -> Synopsis 3-4 lignes.
 * - Tag de classification flottant à droite (| 16+).
 * - Logo PLEZY rouge vif au-dessus des rangées en bas à droite.
 * - Carrousel horizontal de vignettes 16:9 et rangée Top 10 à grands chiffres détourés.
 * - Suppression complète de "Mes demandes" conformément à la demande utilisateur.
 */
class MainActivity : AppCompatActivity() {

    private enum class Page { HOME, SERIES, MOVIES, SEERR, MYLIST, SEARCH }

    private class RowSpec(
        val title: String,
        val items: List<MediaItem>,
        val style: NetflixRowAdapter.Style = NetflixRowAdapter.Style.TILE,
        val recentBadges: Int = 0,
        val top10: Boolean = false,
        val key: String? = null,
        val callout: (MediaItem, Int) -> String? = { _, _ -> null },
        val loadMore: (suspend (Int) -> List<MediaItem>)? = null
    )

    private class RowState(
        val view: View,
        val rv: RecyclerView,
        val adapter: NetflixRowAdapter,
        val spec: RowSpec
    ) {
        var page = 1
        var loading = false
        var hasMore = true
    }

    private class PageContent(
        val featured: MediaItem?,
        val featuredCallout: String?,
        val featuredTop10: Boolean,
        val rows: List<RowSpec>
    )

    private lateinit var jellyfinClient: JellyfinClient
    private lateinit var seerrClient: SeerrClient
    private lateinit var offlineManager: OfflineDownloadManager

    private lateinit var browseContainer: View
    private lateinit var searchContainer: View
    private lateinit var sidebarContainer: ViewGroup
    private lateinit var rowsScroll: RowsScrollView
    private lateinit var rowsContainer: LinearLayout
    private lateinit var heroButtons: View
    private lateinit var btnHeroPlay: TextView
    private lateinit var btnHeroMoreInfo: TextView
    private lateinit var ivHeroBackdrop: ImageView
    private lateinit var ivHeroLogo: ImageView
    private lateinit var tvHeroTitle: TextView
    private lateinit var tvHeroOverview: TextView
    private lateinit var tvHeroCategoryTag: TextView
    private lateinit var tvHeroMeta: TextView
    private lateinit var tvStatus: TextView
    private lateinit var etSearch: EditText
    private lateinit var searchAdapter: NetflixRowAdapter

    private lateinit var navTabs: Map<Page, View>

    private val rows = mutableListOf<RowState>()
    private var currentPage = Page.HOME
    private var featuredItem: MediaItem? = null
    private var featuredCallout: String? = null
    private var featuredTop10 = false
    private var heroMode = true
    private var pageJob: Job? = null
    private var navSwitchJob: Job? = null
    private var pageGeneration = 0
    private var backdropJob: Job? = null
    private var searchJob: Job? = null
    private var resumedOnce = false
    private var lastBackdropUrl: String? = null
    private var lastLogoUrl: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        jellyfinClient = JellyfinClient(this)
        seerrClient = SeerrClient(this)
        offlineManager = OfflineDownloadManager(this)

        browseContainer = findViewById(R.id.browseContainer)
        searchContainer = findViewById(R.id.searchContainer)
        sidebarContainer = findViewById(R.id.topBarContainer)
        rowsScroll = findViewById(R.id.rowsScroll)
        rowsContainer = findViewById(R.id.rowsContainer)
        heroButtons = findViewById(R.id.heroButtons)
        btnHeroPlay = findViewById(R.id.btnHeroPlay)
        btnHeroMoreInfo = findViewById(R.id.btnHeroMoreInfo)
        ivHeroBackdrop = findViewById(R.id.ivHeroBackdrop)
        ivHeroLogo = findViewById(R.id.ivHeroLogo)
        tvHeroTitle = findViewById(R.id.tvHeroTitle)
        tvHeroOverview = findViewById(R.id.tvHeroOverview)
        tvHeroCategoryTag = findViewById(R.id.tvHeroCategoryTag)
        tvHeroMeta = findViewById(R.id.tvHeroMeta)
        tvStatus = findViewById(R.id.tvHomeStatus)
        etSearch = findViewById(R.id.etSearchQuery)

        navTabs = mapOf(
            Page.SEARCH to findViewById(R.id.navSearch),
            Page.HOME to findViewById(R.id.navHome),
            Page.SERIES to findViewById(R.id.navSeries),
            Page.MOVIES to findViewById(R.id.navMovies),
            Page.MYLIST to findViewById(R.id.navDownloads),
            Page.SEERR to findViewById(R.id.navOverseerr)
        )

        setupTopBar()
        setupHeroButtons()
        setupSearch()
        tvStatus.setOnClickListener { if (!seerrClient.isAuthenticated()) showSeerrConfigDialog() }
        openPage(Page.HOME)
        btnHeroPlay.requestFocus()
    }

    override fun onResume() {
        super.onResume()
        if (resumedOnce) refreshDynamicRows()
        resumedOnce = true
    }

    // ------------------------------------------------------------------
    // Barre supérieure Netflix TV 2026
    // ------------------------------------------------------------------

    private fun setupTopBar() {
        val profile = findViewById<TextView>(R.id.navProfile)
        val interp = androidx.core.view.animation.PathInterpolatorCompat.create(0.2f, 0.9f, 0.3f, 1.0f)
        profile.text = jellyfinClient.currentUserName.firstOrNull()?.uppercase() ?: "L"
        profile.setOnClickListener { showSettingsMenu() }
        profile.setOnFocusChangeListener { v, hasFocus ->
            val s = if (hasFocus) 1.1f else 1.0f
            v.animate().scaleX(s).scaleY(s).setInterpolator(interp).setDuration(260).start()
        }

        findViewById<View?>(R.id.tvBrandWatermark)?.setOnClickListener { showSettingsMenu() }

        navTabs.forEach { (page, view) ->
            view.setOnClickListener {
                navSwitchJob?.cancel()
                if (currentPage != page) openPage(page)
            }
            view.setOnFocusChangeListener { v, hasFocus ->
                val s = if (hasFocus) 1.08f else 1.0f
                v.animate().scaleX(s).scaleY(s).translationZ(if (hasFocus) 8f else 0f).setInterpolator(interp).setDuration(220).start()
                if (hasFocus && currentPage != page) {
                    navSwitchJob?.cancel()
                    navSwitchJob = lifecycleScope.launch {
                        delay(180L)
                        if (v.hasFocus() && currentPage != page) {
                            openPage(page)
                        }
                    }
                }
            }
        }
    }

    private fun openPage(page: Page) {
        currentPage = page
        navTabs.forEach { (p, v) ->
            v.isSelected = (p == page)
            (v as? TextView)?.let { tv ->
                if (p == page) {
                    tv.setBackgroundResource(R.drawable.bg_nfx_nav_pill_active)
                    tv.setTextColor(0xFF000000.toInt())
                } else {
                    tv.setBackgroundResource(R.drawable.bg_nfx_nav_tab)
                    tv.setTextColor(0xFFD1D5DB.toInt())
                }
            }
        }

        if (page == Page.SEARCH) {
            browseContainer.visibility = View.GONE
            searchContainer.visibility = View.VISIBLE
            findViewById<View>(R.id.btnConnectSeerr).visibility = if (seerrClient.isAuthenticated()) View.GONE else View.VISIBLE
            etSearch.requestFocus()
            if (searchAdapter.itemCount == 0) runSearch("")
            return
        }
        searchContainer.visibility = View.GONE
        browseContainer.visibility = View.VISIBLE
        loadPage(page)
    }

    // ------------------------------------------------------------------
    // Chargement des pages
    // ------------------------------------------------------------------

    private fun loadPage(page: Page) {
        pageJob?.cancel()
        val generation = ++pageGeneration
        rows.clear()
        rowsContainer.removeAllViews()
        rowsScroll.scrollTo(0, 0)
        tvStatus.visibility = View.VISIBLE
        tvStatus.text = "Chargement…"

        pageJob = lifecycleScope.launch {
            val content = try {
                when (page) {
                    Page.HOME -> buildHome()
                    Page.SERIES -> buildLibrary("Series")
                    Page.MOVIES -> buildLibrary("Movie")
                    Page.SEERR -> buildSeerr()
                    Page.MYLIST -> buildMyList()
                    Page.SEARCH -> PageContent(null, null, false, emptyList())
                }
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                PageContent(null, null, false, emptyList())
            }
            if (generation != pageGeneration) return@launch

            content.rows.forEach { addRow(it) }
            featuredItem = content.featured ?: rows.firstOrNull()?.spec?.items?.firstOrNull()
            featuredCallout = content.featuredCallout
            featuredTop10 = content.featuredTop10

            if (rows.isEmpty()) {
                tvStatus.visibility = View.VISIBLE
                tvStatus.text = if (page == Page.SEERR && !seerrClient.isAuthenticated()) "Connectez Seerr depuis le profil pour découvrir et demander des titres." else "Rien à afficher pour le moment."
                tvStatus.isFocusable = page == Page.SEERR && !seerrClient.isAuthenticated()
                tvStatus.isClickable = tvStatus.isFocusable
            } else {
                tvStatus.visibility = View.GONE
            }
            heroButtons.visibility = if (featuredItem != null) View.VISIBLE else View.GONE
            setHeroMode(true)
        }
    }

    private suspend fun buildHome(): PageContent = coroutineScope {
        val resumeD = async { jellyfinClient.getContinueWatching() }
        val moviesD = async { jellyfinClient.getRecentlyAddedMovies() }
        val showsD = async { jellyfinClient.getRecentlyAdded("Series") }
        val trendingD = async { safe { seerrClient.getCategoryItems(SeerrCategory.TRENDING, 1) } }
        val topD = async { jellyfinClient.getLibraryCatalog("Recommended", "Movie,Series", limit = 24) }
        val randomD = async { jellyfinClient.getLibraryCatalog("Browse", "Movie,Series", "Random", "Ascending", limit = 150) }

        val resume = resumeD.await()
        val movies = moviesD.await()
        val shows = showsD.await()
        val trending = trendingD.await()
        val saved = SavedMediaStore(this@MainActivity, jellyfinClient.userId).items()

        val rows = mutableListOf<RowSpec>()
        rows += RowSpec("Reprendre avec le profil de ${jellyfinClient.currentUserName}", resume, key = "resume")
        rows += RowSpec(
            "Top 10 des tendances aujourd'hui", trending.take(10), NetflixRowAdapter.Style.TOP10, top10 = true,
            callout = { _, i -> "N° ${i + 1} des tendances aujourd'hui" }
        )
        rows += RowSpec("Films ajoutés récemment", movies, recentBadges = 3, callout = { _, i -> if (i < 3) "Récemment ajouté" else null })
        rows += RowSpec("Séries ajoutées récemment", shows, recentBadges = 3, callout = { _, i -> if (i < 3) "Récemment ajouté" else null })
        rows += RowSpec("Ma liste", saved, key = "mylist")
        rows += RowSpec("Les mieux notés", topD.await(), callout = { it, _ -> it.communityRating?.let { r -> "★ %.1f".format(r) } })
        rows += genreRows(randomD.await(), 5)

        val featured = (movies.take(6) + shows.take(6)).filter { it.backdropImageUrl != null }.randomOrNull()
            ?: movies.firstOrNull() ?: shows.firstOrNull()
        PageContent(featured, "Récemment ajouté", false, rows)
    }

    private suspend fun buildLibrary(type: String): PageContent = coroutineScope {
        val isSeries = type == "Series"
        val recentD = async { if (isSeries) jellyfinClient.getRecentlyAdded("Series") else jellyfinClient.getRecentlyAddedMovies() }
        val topD = async { jellyfinClient.getLibraryCatalog("Recommended", type, limit = 30) }
        val allD = async { jellyfinClient.getLibraryCatalog("Browse", type, "SortName", "Ascending", limit = 400) }
        val resumeD = async { jellyfinClient.getContinueWatching() }

        val recent = recentD.await()
        val all = allD.await()
        val resume = resumeD.await().filter { if (isSeries) it.type == MediaType.EPISODE else it.type == MediaType.MOVIE }
        val label = if (isSeries) "séries" else "films"

        val rows = mutableListOf<RowSpec>()
        rows += RowSpec("Reprendre", resume, key = "resume")
        rows += RowSpec("Nouveautés", recent, recentBadges = 3, callout = { _, i -> if (i < 3) "Récemment ajouté" else null })
        rows += RowSpec(
            if (isSeries) "Séries les mieux notées" else "Films les mieux notés", topD.await(),
            callout = { it, _ -> it.communityRating?.let { r -> "★ %.1f".format(r) } }
        )
        rows += genreRows(all.shuffled(), 8)
        rows += RowSpec("Tous les $label de A à Z", all)

        val featured = recent.filter { it.backdropImageUrl != null }.take(8).randomOrNull() ?: recent.firstOrNull() ?: all.firstOrNull()
        PageContent(featured, "Récemment ajouté", false, rows)
    }

    private suspend fun buildSeerr(): PageContent = coroutineScope {
        val trendingD = async { safe { seerrClient.getCategoryItems(SeerrCategory.TRENDING, 1) } }
        val moviesD = async { safe { seerrClient.getCategoryItems(SeerrCategory.MOVIES, 1) } }
        val tvD = async { safe { seerrClient.getCategoryItems(SeerrCategory.TV, 1) } }
        val upcomingD = async { safe { seerrClient.getCategoryItems(SeerrCategory.UPCOMING, 1) } }

        val trending = trendingD.await()
        val rows = mutableListOf<RowSpec>()
        rows += RowSpec(
            "Top 10 des tendances aujourd'hui", trending.take(10), NetflixRowAdapter.Style.TOP10, top10 = true,
            callout = { _, i -> "N° ${i + 1} des tendances aujourd'hui" }
        )
        rows += RowSpec("Tendances de la semaine", trending.drop(10), loadMore = { p -> seerrClient.getCategoryItems(SeerrCategory.TRENDING, p) })
        rows += RowSpec("Films populaires", moviesD.await(), loadMore = { p -> seerrClient.getCategoryItems(SeerrCategory.MOVIES, p) })
        rows += RowSpec("Séries populaires", tvD.await(), loadMore = { p -> seerrClient.getCategoryItems(SeerrCategory.TV, p) })
        rows += RowSpec("Prochainement au cinéma", upcomingD.await(), callout = { _, _ -> "Prochainement" }, loadMore = { p -> seerrClient.getCategoryItems(SeerrCategory.UPCOMING, p) })

        val featured = trending.firstOrNull { it.backdropImageUrl != null } ?: trending.firstOrNull()
        val rank = trending.indexOf(featured)
        PageContent(featured, if (rank in 0..9) "N° ${rank + 1} des tendances aujourd'hui" else null, rank in 0..9, rows)
    }

    private suspend fun buildMyList(): PageContent = coroutineScope {
        val resumeD = async { jellyfinClient.getContinueWatching() }
        val saved = SavedMediaStore(this@MainActivity, jellyfinClient.userId).items()
        val downloads = offlineManager.getDownloadedItems()
        val resume = resumeD.await()

        val rows = listOf(
            RowSpec("Ma liste", saved, key = "mylist"),
            RowSpec("Reprendre", resume, key = "resume"),
            RowSpec("Téléchargements", downloads, callout = { _, _ -> "Disponible hors connexion" })
        )
        val featured = saved.firstOrNull() ?: resume.firstOrNull()
        PageContent(featured, if (saved.isNotEmpty()) "Dans votre liste" else null, false, rows)
    }

    private fun genreRows(items: List<MediaItem>, max: Int): List<RowSpec> {
        val byGenre = linkedMapOf<String, MutableList<MediaItem>>()
        items.forEach { item -> item.genres.forEach { g -> byGenre.getOrPut(g) { mutableListOf() }.add(item) } }
        return byGenre.entries
            .filter { it.value.size >= 4 }
            .sortedByDescending { it.value.size }
            .take(max)
            .map { (genre, list) -> RowSpec(genre, list.take(30), callout = { _, _ -> genre }) }
    }

    private suspend fun <T> safe(block: suspend () -> List<T>): List<T> = try {
        block()
    } catch (e: Exception) {
        if (e is kotlinx.coroutines.CancellationException) throw e
        emptyList()
    }

    // ------------------------------------------------------------------
    // Rangées
    // ------------------------------------------------------------------

    private fun addRow(spec: RowSpec) {
        if (spec.items.isEmpty()) return
        val view = layoutInflater.inflate(R.layout.view_nfx_row, rowsContainer, false)
        view.findViewById<TextView>(R.id.tvRowTitle).text = spec.title
        val rv = view.findViewById<RecyclerView>(R.id.rvRow)
        if (spec.style == NetflixRowAdapter.Style.TOP10) {
            rv.setPadding(rv.paddingLeft - (24 * resources.displayMetrics.density).toInt(), rv.paddingTop, rv.paddingRight, rv.paddingBottom)
        }

        var state: RowState? = null
        val adapter = NetflixRowAdapter(
            style = spec.style,
            recentBadgeCount = spec.recentBadges,
            onItemFocused = { item, pos -> state?.let { onCardFocused(it, item, pos) } },
            onItemClicked = { openMediaDetail(it) }
        )
        rv.layoutManager = StartAlignLayoutManager(this)
        rv.itemAnimator = null
        rv.setHasFixedSize(true)
        rv.adapter = adapter
        adapter.submitList(spec.items)

        state = RowState(view, rv, adapter, spec)
        rows += state
        rowsContainer.addView(view)
    }

    private fun onCardFocused(state: RowState, item: MediaItem, position: Int) {
        if (heroMode) setHeroMode(false)
        rowsScroll.post { rowsScroll.smoothScrollTo(0, state.view.top) }
        val callout = state.spec.callout(item, position) ?: defaultCallout(item)
        renderInfo(item, callout, state.spec.top10)

        if (state.spec.loadMore != null && !state.loading && state.hasMore && position >= state.adapter.itemCount - 6) {
            loadMoreRow(state)
        }
    }

    private fun loadMoreRow(state: RowState) {
        val loader = state.spec.loadMore ?: return
        state.loading = true
        val next = state.page + 1
        val generation = pageGeneration
        lifecycleScope.launch {
            try {
                val more = loader(next)
                if (generation != pageGeneration) return@launch
                val existing = state.adapter.currentItems()
                val fresh = more.filter { m -> existing.none { it.id == m.id } }
                state.page = next
                state.hasMore = fresh.isNotEmpty()
                if (fresh.isNotEmpty()) state.adapter.submitList(existing + fresh)
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                state.hasMore = false
            } finally {
                state.loading = false
            }
        }
    }

    private fun focusRow(index: Int) {
        val target = rows.getOrNull(index) ?: return
        val lm = target.rv.layoutManager as LinearLayoutManager
        val pos = lm.findFirstCompletelyVisibleItemPosition().takeIf { it >= 0 }
            ?: lm.findFirstVisibleItemPosition().takeIf { it >= 0 } ?: 0
        rowsScroll.smoothScrollTo(0, target.view.top)
        val vh = target.rv.findViewHolderForAdapterPosition(pos)
        if (vh != null) vh.itemView.requestFocus() else target.rv.requestFocus()
    }

    private fun refreshDynamicRows() {
        if (currentPage == Page.SEARCH) return
        val generation = pageGeneration
        lifecycleScope.launch {
            rows.toList().forEach { row ->
                val fresh: List<MediaItem>? = when (row.spec.key) {
                    "resume" -> {
                        val all = jellyfinClient.getContinueWatching()
                        when (currentPage) {
                            Page.SERIES -> all.filter { it.type == MediaType.EPISODE }
                            Page.MOVIES -> all.filter { it.type == MediaType.MOVIE }
                            else -> all
                        }
                    }
                    "mylist" -> SavedMediaStore(this@MainActivity, jellyfinClient.userId).items()
                    else -> null
                }
                if (fresh != null && generation == pageGeneration && fresh.isNotEmpty()) row.adapter.submitList(fresh)
            }
        }
    }

    // ------------------------------------------------------------------
    // Billboard / Panneau d'informations
    // ------------------------------------------------------------------

    private fun setupHeroButtons() {
        val interp = androidx.core.view.animation.PathInterpolatorCompat.create(0.2f, 0.9f, 0.3f, 1.0f)
        btnHeroPlay.setOnFocusChangeListener { v, hasFocus ->
            val s = if (hasFocus) 1.06f else 1.0f
            v.animate().scaleX(s).scaleY(s).translationZ(if (hasFocus) 8f else 0f).setInterpolator(interp).setDuration(280).start()
        }
        btnHeroMoreInfo.setOnFocusChangeListener { v, hasFocus ->
            val s = if (hasFocus) 1.06f else 1.0f
            v.animate().scaleX(s).scaleY(s).translationZ(if (hasFocus) 8f else 0f).setInterpolator(interp).setDuration(280).start()
        }
        btnHeroPlay.setOnClickListener {
            val hero = featuredItem ?: return@setOnClickListener
            if (hero.isSeerrMedia && hero.type == MediaType.MOVIE && hero.tmdbId != null && jellyfinClient.stremio.enabled) {
                lifecycleScope.launch {
                    val resolved = jellyfinClient.stremio.engine.resolveTmdb(hero.tmdbId, false)
                    if (resolved != null) startActivity(Intent(this@MainActivity, PlayerActivity::class.java).putExtra("media_item", resolved))
                    else Toast.makeText(this@MainActivity, "Aucun lien français disponible pour ce titre", Toast.LENGTH_LONG).show()
                }
                return@setOnClickListener
            }
            when {
                hero.isSeerrMedia && hero.overseerrStatus != OverseerrStatus.AVAILABLE_ON_JELLYFIN -> openMediaDetail(hero)
                hero.type == MediaType.MOVIE || hero.type == MediaType.EPISODE -> {
                    startActivity(Intent(this, PlayerActivity::class.java).putExtra("media_item", hero))
                }
                else -> openMediaDetail(hero)
            }
        }
        btnHeroMoreInfo.setOnClickListener { featuredItem?.let { openMediaDetail(it) } }
    }

    private fun setHeroMode(on: Boolean) {
        heroMode = on
        heroButtons.visibility = if (on && featuredItem != null) View.VISIBLE else View.GONE
        if (on) {
            rowsScroll.smoothScrollTo(0, 0)
            val hero = featuredItem
            if (hero != null) {
                renderInfo(hero, featuredCallout ?: defaultCallout(hero), featuredTop10)
                btnHeroPlay.text = when {
                    hero.isSeerrMedia && !jellyfinClient.stremio.enabled && hero.overseerrStatus != OverseerrStatus.AVAILABLE_ON_JELLYFIN ->
                        if (hero.overseerrStatus == OverseerrStatus.REQUESTED || seerrClient.isAlreadyRequested(hero)) "⏳  Demandé" else "＋  Demander"
                    hero.progressPercent > 0 -> "▶  Reprendre"
                    else -> "▶  Lecture"
                }
            } else {
                renderPlaceholder()
            }
        }
    }

    private fun renderPlaceholder() {
        tvHeroCategoryTag.text = ""
        ivHeroLogo.visibility = View.GONE
        tvHeroTitle.visibility = View.VISIBLE
        tvHeroTitle.text = "PLEZY"
        tvHeroOverview.text = ""
        tvHeroMeta.text = "16+"
    }

    private fun renderInfo(item: MediaItem, callout: String?, top10: Boolean) {
        val isSeries = item.type == MediaType.SERIES || item.type == MediaType.EPISODE
        val inLibrary = !item.isSeerrMedia || item.overseerrStatus == OverseerrStatus.AVAILABLE_ON_JELLYFIN

        findViewById<View>(R.id.tvBrandLetter).visibility = if (inLibrary) View.VISIBLE else View.GONE
        tvHeroCategoryTag.text = when {
            !inLibrary && isSeries -> "S É R I E"
            !inLibrary -> "F I L M"
            isSeries -> "S É R I E"
            else -> "F I L M"
        }

        val title = item.seriesName ?: item.title
        tvHeroTitle.text = title
        val logo = item.logoImageUrl
        if (logo.isNullOrBlank()) {
            lastLogoUrl = null
            Glide.with(this).clear(ivHeroLogo)
            ivHeroLogo.visibility = View.GONE
            tvHeroTitle.visibility = View.VISIBLE
        } else if (logo != lastLogoUrl) {
            lastLogoUrl = logo
            Glide.with(this).load(logo).override(640, 160).fitCenter()
                .listener(object : RequestListener<Drawable> {
                    override fun onLoadFailed(e: GlideException?, model: Any?, target: Target<Drawable>, isFirstResource: Boolean): Boolean {
                        if (lastLogoUrl == logo) {
                            ivHeroLogo.visibility = View.GONE
                            tvHeroTitle.visibility = View.VISIBLE
                        }
                        return false
                    }

                    override fun onResourceReady(resource: Drawable, model: Any, target: Target<Drawable>?, dataSource: DataSource, isFirstResource: Boolean): Boolean {
                        if (lastLogoUrl == logo) {
                            ivHeroLogo.visibility = View.VISIBLE
                            tvHeroTitle.visibility = View.GONE
                        }
                        return false
                    }
                })
                .into(ivHeroLogo)
        }

        // Synopsis (3-4 lignes sous les boutons comme dans la capture)
        val overview = if (item.type == MediaType.EPISODE && !item.episodeTitle.isNullOrBlank()) {
            "S${item.seasonNumber ?: 1}:É${item.episodeNumber ?: 1} « ${item.episodeTitle} » — ${item.overview}"
        } else item.overview
        tvHeroOverview.text = overview.ifBlank { "Sélectionnez ce titre pour lancer la lecture ou afficher les détails complets." }

        // Tag classification à droite (style | 16+ · FR · EN)
        val rating = item.officialRating?.takeIf { it.isNotBlank() } ?: "16+"
        tvHeroMeta.text = "$rating  ·  FR · EN"

        // Visuel plein écran
        val url = item.backdropImageUrl ?: item.thumbImageUrl ?: item.primaryImageUrl
        backdropJob?.cancel()
        if (url != null && url != lastBackdropUrl) {
            backdropJob = lifecycleScope.launch {
                delay(200)
                lastBackdropUrl = url
                Glide.with(this@MainActivity).load(url).override(1280, 720).centerCrop()
                    .transition(DrawableTransitionOptions.withCrossFade(300))
                    .into(ivHeroBackdrop)
            }
        }
    }

    private fun defaultCallout(item: MediaItem): String? = when {
        item.progressPercent > 0 -> "Reprendre"
        else -> null
    }

    // ------------------------------------------------------------------
    // Recherche
    // ------------------------------------------------------------------

    private fun setupSearch() {
        val rv = findViewById<RecyclerView>(R.id.rvSearchResults)
        searchAdapter = NetflixRowAdapter(
            style = NetflixRowAdapter.Style.TILE,
            onItemFocused = { _, _ -> },
            onItemClicked = { openMediaDetail(it) }
        )
        rv.layoutManager = GridLayoutManager(this, 4)
        rv.itemAnimator = null
        rv.adapter = searchAdapter

        findViewById<View>(R.id.btnConnectSeerr).setOnClickListener { showSeerrConfigDialog() }
        etSearch.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                runSearch(s?.toString().orEmpty())
            }
            override fun afterTextChanged(s: Editable?) {}
        })
    }

    private fun runSearch(query: String) {
        searchJob?.cancel()
        val status = findViewById<TextView>(R.id.tvSearchStatus)
        searchJob = lifecycleScope.launch {
            delay(300L)
            if (query.isBlank()) {
                if (!seerrClient.isAuthenticated()) {
                    searchAdapter.submitList(emptyList())
                    status.text = "Connectez Seerr pour découvrir les films et séries absents de Jellyfin."
                    return@launch
                }
                val popular = safe { seerrClient.getCategoryItems(SeerrCategory.TRENDING, 1) }
                searchAdapter.submitList(popular)
                status.text = "Recherches populaires"
                return@launch
            }
            val jf = jellyfinClient.searchItems(query)
            val seerr = (if (seerrClient.isAuthenticated()) safe { seerrClient.searchOverseerr(query) } else emptyList())
                .filter { s -> jf.none { it.title.equals(s.title, ignoreCase = true) } }
            val matches = (jf + seerr).distinctBy { it.id }
            if (etSearch.text.toString() == query) {
                searchAdapter.submitList(matches)
                status.text = if (!seerrClient.isAuthenticated()) "Résultats Jellyfin · Connectez Seerr pour chercher ailleurs" else if (matches.isEmpty()) "Aucun résultat pour « $query »" else "Films et séries"
            }
        }
    }

    // ------------------------------------------------------------------
    // Réglages (Profil)
    // ------------------------------------------------------------------

    private fun showSettingsMenu() {
        val seerrState = if (seerrClient.isAuthenticated()) "connecté" else "à configurer"
        val items = arrayOf(
            "Changer de profil (${jellyfinClient.currentUserName})",
            "Configurer Seerr ($seerrState)",
            "Serveur Jellyfin & Quick Connect",
            "Actualiser"
        )
        AlertDialog.Builder(this)
            .setTitle("Profil & réglages")
            .setItems(items) { _, which ->
                when (which) {
                    0 -> showUserProfileSwitcher()
                    1 -> showSeerrConfigDialog()
                    2 -> startActivity(Intent(this, ServerSetupActivity::class.java).putExtra("force_setup", true))
                    3 -> openPage(currentPage)
                }
            }
            .show()
    }

    private fun showSeerrConfigDialog() {
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 28, 48, 12)
        }
        val etUrl = EditText(this).apply {
            hint = "Adresse Seerr (ex : http://IP:PORT)"
            setText(seerrClient.seerrUrl)
            setSingleLine(true)
        }
        val etUserOrKey = EditText(this).apply {
            hint = "E-mail Seerr OU clé API"
            setText(seerrClient.apiKey)
            setSingleLine(true)
        }
        val etPassword = EditText(this).apply {
            hint = "Mot de passe (vide si clé API)"
            setSingleLine(true)
        }
        container.addView(etUrl)
        container.addView(etUserOrKey)
        container.addView(etPassword)

        AlertDialog.Builder(this)
            .setTitle("Connexion à Seerr")
            .setView(container)
            .setPositiveButton("Connecter") { _, _ ->
                etUrl.text?.toString()?.takeIf { it.isNotBlank() }?.let { seerrClient.seerrUrl = it }
                val userOrKey = etUserOrKey.text?.toString().orEmpty()
                val pass = etPassword.text?.toString().orEmpty()
                lifecycleScope.launch {
                    seerrClient.authenticateSeerr(userOrKey, pass)
                        .onSuccess { msg ->
                            Toast.makeText(this@MainActivity, msg, Toast.LENGTH_LONG).show()
                            if (currentPage == Page.SEARCH) runSearch(etSearch.text.toString()) else openPage(currentPage)
                        }
                        .onFailure { err ->
                            Toast.makeText(this@MainActivity, err.message ?: "Échec de connexion", Toast.LENGTH_LONG).show()
                        }
                }
            }
            .setNegativeButton("Annuler", null)
            .show()
    }

    private fun showUserProfileSwitcher() {
        lifecycleScope.launch {
            val users = jellyfinClient.getPublicUsers()
            if (users.isEmpty()) return@launch
            AlertDialog.Builder(this@MainActivity)
                .setTitle("Qui est-ce ?")
                .setItems(users.map { it.name }.toTypedArray()) { _, which ->
                    val chosen = users[which]
                    jellyfinClient.userId = chosen.id
                    jellyfinClient.currentUserName = chosen.name
                    findViewById<TextView>(R.id.navProfile).text = chosen.name.firstOrNull()?.uppercase() ?: "L"
                    openPage(Page.HOME)
                }
                .show()
        }
    }

    private fun openMediaDetail(item: MediaItem) {
        startActivity(Intent(this, MediaDetailActivity::class.java).putExtra("media_item", item))
    }

    // ------------------------------------------------------------------
    // Télécommande D-Pad (Navigation fluide Sidebar <-> Billboard <-> Rails)
    // ------------------------------------------------------------------

    private fun isInside(parent: View, view: View?): Boolean {
        var v: View? = view
        while (v != null) {
            if (v === parent) return true
            v = v.parent as? View
        }
        return false
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN) {
            val focus = currentFocus
            val rowIndex = rows.indexOfFirst { focus != null && focus.parent === it.rv }

            when (event.keyCode) {
                KeyEvent.KEYCODE_DPAD_LEFT -> {
                    if (isInside(heroButtons, focus) && focus == btnHeroPlay) {
                        navTabs[currentPage]?.requestFocus() ?: findViewById<View>(R.id.navHome).requestFocus()
                        return true
                    }
                    if (rowIndex >= 0) {
                        val row = rows[rowIndex]
                        val lm = row.rv.layoutManager as? LinearLayoutManager
                        val firstPos = lm?.findFirstVisibleItemPosition() ?: 0
                        val holder = focus?.let { row.rv.findContainingViewHolder(it) }
                        if (holder?.bindingAdapterPosition == 0 || firstPos == 0 && focus == holder?.itemView) {
                            navTabs[currentPage]?.requestFocus() ?: findViewById<View>(R.id.navHome).requestFocus()
                            return true
                        }
                    }
                }
                KeyEvent.KEYCODE_DPAD_RIGHT -> {
                    if (isInside(sidebarContainer, focus)) {
                        if (currentPage == Page.SEARCH) {
                            etSearch.requestFocus()
                        } else if (heroMode && featuredItem != null) {
                            btnHeroPlay.requestFocus()
                        } else if (rows.isNotEmpty()) {
                            focusRow(0)
                        }
                        return true
                    }
                }
                KeyEvent.KEYCODE_DPAD_UP -> {
                    if (currentPage == Page.SEARCH) {
                        val rvSearch = findViewById<RecyclerView>(R.id.rvSearchResults)
                        val btnConnect = findViewById<View>(R.id.btnConnectSeerr)
                        if (focus === etSearch || focus === btnConnect) {
                            navTabs[Page.SEARCH]?.requestFocus()
                            return true
                        }
                        if (focus != null && focus.parent === rvSearch) {
                            val holder = rvSearch.findContainingViewHolder(focus)
                            if ((holder?.bindingAdapterPosition ?: 0) < 4) {
                                etSearch.requestFocus()
                                return true
                            }
                        }
                    } else {
                        if (isInside(heroButtons, focus)) {
                            navTabs[currentPage]?.requestFocus() ?: findViewById<View>(R.id.navHome).requestFocus()
                            return true
                        }
                        if (rowIndex == 0) {
                            setHeroMode(true)
                            if (featuredItem != null) btnHeroPlay.requestFocus()
                            return true
                        }
                        if (rowIndex > 0) {
                            focusRow(rowIndex - 1)
                            return true
                        }
                    }
                }
                KeyEvent.KEYCODE_DPAD_DOWN -> {
                    if (isInside(sidebarContainer, focus)) {
                        if (currentPage == Page.SEARCH) {
                            etSearch.requestFocus()
                        } else if (featuredItem != null) {
                            btnHeroPlay.requestFocus()
                        } else if (rows.isNotEmpty()) {
                            focusRow(0)
                        }
                        return true
                    }
                    if (currentPage == Page.SEARCH) {
                        val rvSearch = findViewById<RecyclerView>(R.id.rvSearchResults)
                        val btnConnect = findViewById<View>(R.id.btnConnectSeerr)
                        if (focus === etSearch) {
                            if (rvSearch.childCount > 0) rvSearch.getChildAt(0).requestFocus()
                            else if (btnConnect.visibility == View.VISIBLE) btnConnect.requestFocus()
                            return true
                        }
                    } else {
                        if (rowIndex >= 0) {
                            if (rowIndex < rows.lastIndex) focusRow(rowIndex + 1)
                            return true
                        }
                        if (isInside(heroButtons, focus)) {
                            if (rows.isNotEmpty()) focusRow(0)
                            return true
                        }
                    }
                }
                KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.KEYCODE_MEDIA_PLAY -> {
                    if (focus != null && rowIndex >= 0) {
                        focus.performClick()
                        return true
                    }
                    if (featuredItem != null && btnHeroPlay.visibility == View.VISIBLE) {
                        btnHeroPlay.performClick()
                        return true
                    }
                }
            }
        }
        return super.dispatchKeyEvent(event)
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (!isInside(sidebarContainer, currentFocus)) {
                navTabs[currentPage]?.requestFocus() ?: findViewById<View>(R.id.navHome).requestFocus()
                return true
            }
            if (currentPage != Page.HOME) {
                openPage(Page.HOME)
                navTabs[Page.HOME]?.requestFocus()
                return true
            }
        }
        return super.onKeyDown(keyCode, event)
    }
}
