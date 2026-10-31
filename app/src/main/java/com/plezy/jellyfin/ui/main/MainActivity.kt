package com.plezy.jellyfin.ui.main

import android.content.Intent
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.KeyEvent
import android.view.View
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
import com.plezy.jellyfin.R
import com.plezy.jellyfin.data.api.JellyfinClient
import com.plezy.jellyfin.data.api.SeerrCategory
import com.plezy.jellyfin.data.api.SeerrClient
import com.plezy.jellyfin.data.local.OfflineDownloadManager
import com.plezy.jellyfin.data.model.MediaItem
import com.plezy.jellyfin.ui.common.MediaCardAdapter
import com.plezy.jellyfin.ui.detail.MediaDetailActivity
import com.plezy.jellyfin.ui.login.ServerSetupActivity
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Écran d'accueil Apple TV **Infuse 8 Liquid Glass** (`media_1793397604903_4ae2ba84.png`) :
 * - Barre supérieure épurée : `[ 🔍 Search ]` à gauche, 3 boutons ronds vectoriels (`[Tri] [Refresh] [Settings]`) à droite.
 * - Section `Watching` : Grandes cartes 16:9 aux coins arrondis 14dp avec barre de progression orange et Titre + Sous-titre centrés dessous.
 * - Section `Favorites` : Grandes tuiles 16:9 dégradées (Orange `Overseerr`, Bleu `Movies`, Rose `TV Shows`, Violet `All Media`) avec icône vectorielle blanche au centre et titre centré sous la tuile.
 * - Sections `Recently Added Movies`, `Recently Added TV Shows` et `Trending on Overseerr`.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var jellyfinClient: JellyfinClient
    private lateinit var seerrClient: SeerrClient
    private lateinit var offlineManager: OfflineDownloadManager

    private lateinit var homeContainer: View
    private lateinit var libraryContainer: View
    private lateinit var searchContainer: View
    private lateinit var downloadsContainer: View
    private lateinit var navHome: View
    private lateinit var navSearch: View

    private lateinit var rowJellyfinFilters: View
    private lateinit var rowOverseerrFilters: View

    private lateinit var ivHeroBackdrop: ImageView

    private lateinit var continueAdapter: MediaCardAdapter
    private lateinit var homeMoviesAdapter: MediaCardAdapter
    private lateinit var recentAdapter: MediaCardAdapter
    private lateinit var overseerrTrendingAdapter: MediaCardAdapter
    private lateinit var libraryGridAdapter: MediaCardAdapter
    private lateinit var searchAdapter: MediaCardAdapter
    private lateinit var downloadsAdapter: MediaCardAdapter

    private var contentJob: Job? = null
    private var gridJob: Job? = null
    private var gridGeneration = 0
    private var seerrHasMore = true
    private var resumedOnce = false
    private var ambientJob: Job? = null
    private var currentTab = "Browse"
    private var currentItemType = "Movie,Series"
    private var onlyUnplayed = false
    private var currentSortBy = "SortName"
    private var searchJob: Job? = null

    private var currentSeerrCategory = SeerrCategory.TRENDING
    private var seerrPage = 1
    private var isSeerrLoading = false
    private val seerrLoadedItems = mutableListOf<MediaItem>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        jellyfinClient = JellyfinClient(this)
        seerrClient = SeerrClient(this)
        offlineManager = OfflineDownloadManager(this)

        homeContainer = findViewById(R.id.homeContainer)
        libraryContainer = findViewById(R.id.libraryContainer)
        searchContainer = findViewById(R.id.searchContainer)
        downloadsContainer = findViewById(R.id.downloadsContainer)
        navHome = findViewById(R.id.navHome)
        navSearch = findViewById(R.id.navSearch)

        rowJellyfinFilters = findViewById(R.id.rowJellyfinFilters)
        rowOverseerrFilters = findViewById(R.id.rowOverseerrFilters)

        ivHeroBackdrop = findViewById(R.id.ivHeroBackdrop)

        setupTopNavigationBar()
        setupInfuseFavoriteTiles()
        setupLibraryTabsAndFilters()
        setupSearchInput()
        setupRecyclerViews()
        loadAllContent()
    }

    override fun onResume() {
        super.onResume()
        refreshOfflineDownloads()
        if (resumedOnce) loadAllContent()
        resumedOnce = true
    }

    private fun showContainer(target: View) {
        homeContainer.visibility = if (target == homeContainer) View.VISIBLE else View.GONE
        libraryContainer.visibility = if (target == libraryContainer) View.VISIBLE else View.GONE
        searchContainer.visibility = if (target == searchContainer) View.VISIBLE else View.GONE
        downloadsContainer.visibility = if (target == downloadsContainer) View.VISIBLE else View.GONE
        navHome.visibility = View.VISIBLE
        navHome.isSelected = target == homeContainer
        findViewById<View>(R.id.navLibrary).isSelected = target == libraryContainer
        findViewById<View>(R.id.navDownloads).isSelected = target == downloadsContainer
        if (target == homeContainer) navHome.requestFocus()
        navSearch.isSelected = (target == searchContainer)
    }

    private fun setupTopNavigationBar() {
        val navSettings = findViewById<View>(R.id.navSettings)
        val btnRefresh = findViewById<View>(R.id.btnRefresh)
        val btnSortTop = findViewById<View>(R.id.btnUsers)

        showContainer(homeContainer)
        findViewById<View>(R.id.navLibrary).setOnClickListener { openLibrarySection("Browse", "Movie,Series", "Tous les types") }
        findViewById<View>(R.id.navDownloads).setOnClickListener {
            showContainer(downloadsContainer)
            refreshOfflineDownloads()
            findViewById<View>(R.id.rvDownloads).requestFocus()
        }

        navHome.setOnClickListener {
            showContainer(homeContainer)
        }

        navSearch.setOnClickListener {
            showContainer(searchContainer)
            findViewById<EditText>(R.id.etSearchQuery).requestFocus()
        }

        btnSortTop.setOnClickListener {
            val options = arrayOf(
                "Movies (Jellyfin)",
                "TV Shows (Jellyfin)",
                "Overseerr · Discover & Request",
                "All Media (Movies & TV Shows)",
                "Offline Downloads"
            )
            AlertDialog.Builder(this)
                .setTitle("Browse Library")
                .setItems(options) { _, which ->
                    when (which) {
                        0 -> openLibrarySection("Browse", "Movie", "Movies")
                        1 -> openLibrarySection("Browse", "Series", "TV Shows")
                        2 -> openLibrarySection("Overseerr", "Movie,Series", "Overseerr")
                        3 -> openLibrarySection("Browse", "Movie,Series", "All Types")
                        4 -> {
                            showContainer(downloadsContainer)
                            refreshOfflineDownloads()
                        }
                    }
                }
                .show()
        }

        btnRefresh.setOnClickListener {
            Toast.makeText(this, "Refreshing library...", Toast.LENGTH_SHORT).show()
            loadAllContent()
        }

        navSettings.setOnClickListener {
            showSettingsMenu()
        }
    }

    private fun openLibrarySection(tab: String, itemType: String, filterLabel: String) {
        if (tab == "Overseerr") {
            switchToOverseerrView(SeerrCategory.TRENDING)
            return
        }
        currentTab = tab
        currentItemType = itemType
        rowJellyfinFilters.visibility = View.VISIBLE
        rowOverseerrFilters.visibility = View.GONE
        findViewById<TextView>(R.id.btnFilterType).text = filterLabel
        showContainer(libraryContainer)
        refreshLibraryGrid()
        findViewById<View>(R.id.tabBrowse).requestFocus()
    }

    private fun setupInfuseFavoriteTiles() {
        val tileOverseerr = findViewById<View>(R.id.tileFavOverseerr)
        val tileMovies = findViewById<View>(R.id.tileFavMovies)
        val tileShows = findViewById<View>(R.id.tileFavShows)
        val tileAll = findViewById<View>(R.id.tileFavAll)

        listOf(tileOverseerr, tileMovies, tileShows, tileAll).forEach { tile ->
            tile.setOnFocusChangeListener { v, hasFocus ->
                val scale = if (hasFocus) 1.06f else 1.0f
                v.animate().scaleX(scale).scaleY(scale).setDuration(140).start()
            }
        }

        tileOverseerr.setOnClickListener {
            switchToOverseerrView(SeerrCategory.TRENDING)
        }

        tileMovies.setOnClickListener {
            openLibrarySection("Browse", "Movie", "Films")
        }

        tileShows.setOnClickListener {
            openLibrarySection("Browse", "Series", "Séries")
        }

        tileAll.setOnClickListener {
            openLibrarySection("Browse", "Movie,Series", "Tous les types")
        }
    }

    private fun showSettingsMenu() {
        val seerrState = if (seerrClient.isAuthenticated()) "Connected" else "Configure Login / API Key"
        val items = arrayOf(
            "Configure Overseerr / Seerr ($seerrState)",
            "Switch Jellyfin Profile (${jellyfinClient.currentUserName})",
            "Jellyfin Server & Quick Connect (${jellyfinClient.serverUrl})"
        )
        AlertDialog.Builder(this)
            .setTitle("Settings")
            .setItems(items) { _, which ->
                when (which) {
                    0 -> showSeerrConfigDialog()
                    1 -> showUserProfileSwitcher()
                    2 -> {
                        val intent = Intent(this, ServerSetupActivity::class.java)
                        intent.putExtra("force_setup", true)
                        startActivity(intent)
                    }
                }
            }
            .show()
    }

    private fun showSeerrConfigDialog() {
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 28, 48, 12)
        }
        val etUserOrKey = EditText(this).apply {
            hint = "Seerr Email / Username OR Seerr API Key"
            setText(seerrClient.apiKey)
            setSingleLine(true)
        }
        val etPassword = EditText(this).apply {
            hint = "Seerr Password (leave empty if using API Key)"
            setSingleLine(true)
        }
        container.addView(etUserOrKey)
        container.addView(etPassword)

        AlertDialog.Builder(this)
            .setTitle("Connect Seerr / Overseerr")
            .setMessage("Enter your Seerr login (Email/Username + Password) or your Seerr API Key (Settings -> General in Seerr) to send downloads directly to Radarr, Sonarr & Transmission.")
            .setView(container)
            .setPositiveButton("Connect") { _, _ ->
                val userOrKey = etUserOrKey.text?.toString().orEmpty()
                val pass = etPassword.text?.toString().orEmpty()
                lifecycleScope.launch {
                    val res = seerrClient.authenticateSeerr(userOrKey, pass)
                    res.onSuccess { msg ->
                        Toast.makeText(this@MainActivity, msg, Toast.LENGTH_LONG).show()
                        loadAllContent()
                    }.onFailure { err ->
                        Toast.makeText(this@MainActivity, err.message ?: "Connection failed", Toast.LENGTH_LONG).show()
                    }
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun showUserProfileSwitcher() {
        lifecycleScope.launch {
            val users = jellyfinClient.getPublicUsers()
            val names = users.map { it.name }.toTypedArray()
            if (names.isEmpty()) return@launch

            AlertDialog.Builder(this@MainActivity)
                .setTitle("Select User Profile")
                .setItems(names) { _, which ->
                    val chosen = users[which]
                    jellyfinClient.userId = chosen.id
                    jellyfinClient.currentUserName = chosen.name
                    Toast.makeText(this@MainActivity, "Active profile: ${chosen.name}", Toast.LENGTH_SHORT).show()
                    loadAllContent()
                }
                .show()
        }
    }

    private fun setupLibraryTabsAndFilters() {
        val tabRecommended = findViewById<TextView>(R.id.tabRecommended)
        val tabBrowse = findViewById<TextView>(R.id.tabBrowse)
        val tabCollections = findViewById<TextView>(R.id.tabCollections)
        val tabPlaylists = findViewById<TextView>(R.id.tabPlaylists)

        val jfTabs = listOf(tabBrowse, tabRecommended, tabCollections, tabPlaylists)
        fun selectJfTab(active: TextView, tabName: String) {
            jfTabs.forEach { it.isSelected = (it == active) }
            currentTab = tabName
            if (tabName == "Overseerr") {
                switchToOverseerrView(SeerrCategory.TRENDING)
            } else {
                rowJellyfinFilters.visibility = View.VISIBLE
                rowOverseerrFilters.visibility = View.GONE
                refreshLibraryGrid()
            }
        }

        tabBrowse.isSelected = true
        tabBrowse.setOnClickListener { selectJfTab(tabBrowse, "Browse") }
        tabRecommended.setOnClickListener { selectJfTab(tabRecommended, "Recommended") }
        tabCollections.setOnClickListener { selectJfTab(tabCollections, "Collections") }
        tabPlaylists.setOnClickListener { selectJfTab(tabPlaylists, "Overseerr") }

        val btnFilterType = findViewById<TextView>(R.id.btnFilterType)
        val btnFilterUnplayed = findViewById<TextView>(R.id.btnFilterUnplayed)
        val btnSort = findViewById<TextView>(R.id.btnSort)

        btnFilterType.setOnClickListener {
            when (currentItemType) {
                "Movie,Series" -> {
                    currentItemType = "Movie"
                    btnFilterType.text = "Films"
                }
                "Movie" -> {
                    currentItemType = "Series"
                    btnFilterType.text = "Séries"
                }
                else -> {
                    currentItemType = "Movie,Series"
                    btnFilterType.text = "Tous les types"
                }
            }
            refreshLibraryGrid()
        }

        btnFilterUnplayed.setOnClickListener {
            onlyUnplayed = !onlyUnplayed
            btnFilterUnplayed.text = if (onlyUnplayed) "Non-vus" else "Tous"
            refreshLibraryGrid()
        }

        btnSort.setOnClickListener {
            when (currentSortBy) {
                "SortName" -> {
                    currentSortBy = "CommunityRating"
                    btnSort.text = "Tri: Note"
                }
                "CommunityRating" -> {
                    currentSortBy = "ProductionYear"
                    btnSort.text = "Tri: Année"
                }
                else -> {
                    currentSortBy = "SortName"
                    btnSort.text = "Tri: Titre"
                }
            }
            refreshLibraryGrid()
        }

        // Configuration des onglets Seerr
        val seerrTabTrending = findViewById<TextView>(R.id.seerrTabTrending)
        val seerrTabMovies = findViewById<TextView>(R.id.seerrTabMovies)
        val seerrTabTv = findViewById<TextView>(R.id.seerrTabTv)
        val seerrTabUpcoming = findViewById<TextView>(R.id.seerrTabUpcoming)
        val seerrTabRequests = findViewById<TextView>(R.id.seerrTabRequests)
        val btnBackToJf = findViewById<TextView>(R.id.btnSeerrSwitchToJellyfin)

        val seerrTabs = listOf(seerrTabTrending, seerrTabMovies, seerrTabTv, seerrTabUpcoming, seerrTabRequests)
        fun selectSeerrTab(active: TextView, category: SeerrCategory) {
            seerrTabs.forEach { it.isSelected = (it == active) }
            loadSeerrCategory(category)
        }

        seerrTabTrending.isSelected = true
        seerrTabTrending.setOnClickListener { selectSeerrTab(seerrTabTrending, SeerrCategory.TRENDING) }
        seerrTabMovies.setOnClickListener { selectSeerrTab(seerrTabMovies, SeerrCategory.MOVIES) }
        seerrTabTv.setOnClickListener { selectSeerrTab(seerrTabTv, SeerrCategory.TV) }
        seerrTabUpcoming.setOnClickListener { selectSeerrTab(seerrTabUpcoming, SeerrCategory.UPCOMING) }
        seerrTabRequests.setOnClickListener { selectSeerrTab(seerrTabRequests, SeerrCategory.REQUESTS) }

        btnBackToJf.setOnClickListener {
            currentTab = "Browse"
            rowJellyfinFilters.visibility = View.VISIBLE
            rowOverseerrFilters.visibility = View.GONE
            tabBrowse.isSelected = true
            tabPlaylists.isSelected = false
            refreshLibraryGrid()
        }
    }

    private fun switchToOverseerrView(category: SeerrCategory = SeerrCategory.TRENDING) {
        currentTab = "Overseerr"
        rowJellyfinFilters.visibility = View.GONE
        rowOverseerrFilters.visibility = View.VISIBLE
        showContainer(libraryContainer)
        findViewById<TextView>(R.id.seerrTabTrending).isSelected = (category == SeerrCategory.TRENDING)
        findViewById<TextView>(R.id.seerrTabMovies).isSelected = (category == SeerrCategory.MOVIES)
        findViewById<TextView>(R.id.seerrTabTv).isSelected = (category == SeerrCategory.TV)
        findViewById<TextView>(R.id.seerrTabUpcoming).isSelected = (category == SeerrCategory.UPCOMING)
        findViewById<TextView>(R.id.seerrTabRequests).isSelected = (category == SeerrCategory.REQUESTS)
        loadSeerrCategory(category)
        findViewById<View>(R.id.seerrTabTrending).requestFocus()
    }

    private fun loadSeerrCategory(category: SeerrCategory) {
        gridJob?.cancel()
        val generation = ++gridGeneration
        currentSeerrCategory = category
        seerrPage = 1
        seerrHasMore = true
        seerrLoadedItems.clear()
        libraryGridAdapter.submitList(emptyList())
        isSeerrLoading = true
        gridJob = lifecycleScope.launch {
            try {
                val items = seerrClient.getCategoryItems(category, 1)
                if (generation == gridGeneration && currentTab == "Overseerr") {
                    seerrLoadedItems.addAll(items.distinctBy { it.id })
                    libraryGridAdapter.submitList(ArrayList(seerrLoadedItems))
                    seerrHasMore = items.isNotEmpty()
                }
            } finally { if (generation == gridGeneration) isSeerrLoading = false }
        }
    }

    private fun loadNextSeerrPage() {
        if (isSeerrLoading || !seerrHasMore || currentSeerrCategory == SeerrCategory.REQUESTS) return
        val generation = gridGeneration
        val category = currentSeerrCategory
        val nextPage = seerrPage + 1
        isSeerrLoading = true
        gridJob = lifecycleScope.launch {
            try {
                val more = seerrClient.getCategoryItems(category, nextPage)
                if (generation == gridGeneration && currentTab == "Overseerr") {
                    val fresh = more.filter { item -> seerrLoadedItems.none { it.id == item.id } }
                    seerrHasMore = fresh.isNotEmpty()
                    seerrPage = nextPage
                    seerrLoadedItems.addAll(fresh)
                    libraryGridAdapter.submitList(ArrayList(seerrLoadedItems))
                }
            } finally { if (generation == gridGeneration) isSeerrLoading = false }
        }
    }

    private fun setupSearchInput() {
        val etSearch = findViewById<EditText>(R.id.etSearchQuery)
        etSearch.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                searchJob?.cancel()
                val query = s?.toString().orEmpty()
                searchJob = lifecycleScope.launch {
                    delay(250L)
                    val jellyfinMatches = jellyfinClient.searchItems(query)
                    val overseerrMatches = seerrClient.searchOverseerr(query)
                    if (etSearch.text.toString() == query) {
                        val matches = (jellyfinMatches + overseerrMatches).distinctBy { it.id }
                        searchAdapter.submitList(matches)
                        findViewById<TextView>(R.id.tvSearchStatus).text = if (query.isBlank()) "Recherchez un film ou une série" else if (matches.isEmpty()) "Aucun résultat pour « $query »" else "${matches.size} résultats"
                    }
                }
            }
            override fun afterTextChanged(s: Editable?) {}
        })
    }

    private fun setupRecyclerViews() {
        val rvContinue = findViewById<RecyclerView>(R.id.rvContinueWatching)
        val rvHomeMovies = findViewById<RecyclerView>(R.id.rvHomeMovies)
        val rvRecent = findViewById<RecyclerView>(R.id.rvRecentlyAdded)
        val rvOverseerr = findViewById<RecyclerView>(R.id.rvOverseerrTrending)
        val rvLibraryGrid = findViewById<RecyclerView>(R.id.rvLibraryGrid)
        val rvSearchResults = findViewById<RecyclerView>(R.id.rvSearchResults)
        val rvDownloads = findViewById<RecyclerView>(R.id.rvDownloads)

        continueAdapter = MediaCardAdapter(
            style = MediaCardAdapter.CardStyle.LANDSCAPE,
            onItemFocused = { updateAmbientBackdrop(it) },
            onItemClicked = { openMediaDetail(it) }
        )

        homeMoviesAdapter = MediaCardAdapter(
            style = MediaCardAdapter.CardStyle.POSTER,
            onItemFocused = { updateAmbientBackdrop(it) },
            onItemClicked = { openMediaDetail(it) }
        )

        recentAdapter = MediaCardAdapter(
            style = MediaCardAdapter.CardStyle.POSTER,
            onItemFocused = { updateAmbientBackdrop(it) },
            onItemClicked = { openMediaDetail(it) }
        )

        overseerrTrendingAdapter = MediaCardAdapter(
            style = MediaCardAdapter.CardStyle.POSTER,
            onItemFocused = { updateAmbientBackdrop(it) },
            onItemClicked = { openMediaDetail(it) }
        )

        libraryGridAdapter = MediaCardAdapter(
            style = MediaCardAdapter.CardStyle.POSTER,
            onItemFocused = { updateAmbientBackdrop(it) },
            onItemClicked = { openMediaDetail(it) }
        )

        searchAdapter = MediaCardAdapter(
            style = MediaCardAdapter.CardStyle.POSTER,
            onItemFocused = { updateAmbientBackdrop(it) },
            onItemClicked = { openMediaDetail(it) }
        )

        downloadsAdapter = MediaCardAdapter(
            style = MediaCardAdapter.CardStyle.LANDSCAPE,
            onItemFocused = { updateAmbientBackdrop(it) },
            onItemClicked = { openMediaDetail(it) }
        )

        rvContinue.layoutManager = LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, false)
        rvContinue.setHasFixedSize(true)
        rvContinue.adapter = continueAdapter

        rvHomeMovies.layoutManager = LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, false)
        rvHomeMovies.setHasFixedSize(true)
        rvHomeMovies.adapter = homeMoviesAdapter

        rvRecent.layoutManager = LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, false)
        rvRecent.setHasFixedSize(true)
        rvRecent.adapter = recentAdapter

        rvOverseerr.layoutManager = LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, false)
        rvOverseerr.setHasFixedSize(true)
        rvOverseerr.adapter = overseerrTrendingAdapter

        val gridLayout = GridLayoutManager(this, 5)
        rvLibraryGrid.layoutManager = gridLayout
        rvLibraryGrid.setHasFixedSize(true)
        rvLibraryGrid.adapter = libraryGridAdapter
        rvLibraryGrid.addOnScrollListener(object : RecyclerView.OnScrollListener() {
            override fun onScrolled(recyclerView: RecyclerView, dx: Int, dy: Int) {
                super.onScrolled(recyclerView, dx, dy)
                if (currentTab == "Overseerr" && dy > 0) {
                    val visible = gridLayout.childCount
                    val total = gridLayout.itemCount
                    val first = gridLayout.findFirstVisibleItemPosition()
                    if (first + visible >= total - 6) {
                        loadNextSeerrPage()
                    }
                }
            }
        })

        rvSearchResults.layoutManager = GridLayoutManager(this, 5)
        rvSearchResults.setHasFixedSize(true)
        rvSearchResults.adapter = searchAdapter

        rvDownloads.layoutManager = LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, false)
        rvDownloads.setHasFixedSize(true)
        rvDownloads.adapter = downloadsAdapter
    }

    private fun loadAllContent() {
        contentJob?.cancel()
        contentJob = lifecycleScope.launch {
            val status = findViewById<TextView>(R.id.tvHomeStatus)
            status.visibility = View.VISIBLE
            status.text = "Chargement de votre bibliothèque…"
            coroutineScope {
                val resume = async { jellyfinClient.getContinueWatching() }
                val movies = async { jellyfinClient.getRecentlyAddedMovies() }
                val shows = async { jellyfinClient.getRecentlyAdded("Series") }
                val seerr = async { seerrClient.getTrendingDiscover() }
                val continueItems = resume.await()
                val movieItems = movies.await()
                val showItems = shows.await()
                continueAdapter.submitList(continueItems)
                homeMoviesAdapter.submitList(movieItems)
                recentAdapter.submitList(showItems)
                findViewById<View>(R.id.tvContinueHeader).visibility = if (continueItems.isEmpty()) View.GONE else View.VISIBLE
                findViewById<View>(R.id.rvContinueWatching).visibility = if (continueItems.isEmpty()) View.GONE else View.VISIBLE
                status.text = if (movieItems.isEmpty() && showItems.isEmpty()) "Bibliothèque vide ou serveur indisponible. Réessayez avec Actualiser." else ""
                status.visibility = if (status.text.isEmpty()) View.GONE else View.VISIBLE
                if (homeContainer.visibility == View.VISIBLE) (continueItems.firstOrNull() ?: movieItems.firstOrNull() ?: showItems.firstOrNull())?.let { updateAmbientBackdrop(it) }
                overseerrTrendingAdapter.submitList(seerr.await())
            }
            refreshOfflineDownloads()
        }
    }

    private fun refreshOfflineDownloads() {
        val saved = com.plezy.jellyfin.data.local.SavedMediaStore(this, jellyfinClient.userId).items()
        downloadsAdapter.submitList((saved + offlineManager.getDownloadedItems()).distinctBy { it.id })
    }

    private fun refreshLibraryGrid() {
        if (currentTab == "Overseerr") { loadSeerrCategory(currentSeerrCategory); return }
        gridJob?.cancel()
        val generation = ++gridGeneration
        val tab = currentTab
        val type = currentItemType
        val sort = currentSortBy
        val unplayed = onlyUnplayed
        listOf(R.id.tabBrowse, R.id.tabRecommended, R.id.tabCollections).forEachIndexed { index, id ->
            findViewById<View>(id).isSelected = tab == listOf("Browse", "Recommended", "Collections")[index]
        }
        gridJob = lifecycleScope.launch {
            val items = jellyfinClient.getLibraryCatalog(tab, type, sort,
                if (sort == "SortName") "Ascending" else "Descending", unplayed)
            if (generation == gridGeneration && currentTab == tab) libraryGridAdapter.submitList(items)
        }
    }

    private fun updateAmbientBackdrop(item: MediaItem) {
        findViewById<TextView>(R.id.tvHeroTitle).text = item.seriesName ?: item.title
        findViewById<TextView>(R.id.tvHeroMeta).text = listOfNotNull(item.productionYear?.toString(), item.formattedDuration.takeIf { it.isNotBlank() }, item.communityRating?.let { "★ %.1f".format(it) }).joinToString("   ·   ")
        findViewById<TextView>(R.id.tvHeroOverview).text = item.overview
        ambientJob?.cancel()
        ambientJob = lifecycleScope.launch {
            delay(180)
            Glide.with(this@MainActivity).load(item.backdropImageUrl ?: item.primaryImageUrl)
                .override(960, 540).centerCrop().into(ivHeroBackdrop)
        }
    }

    private fun openMediaDetail(item: MediaItem) {
        val intent = Intent(this, MediaDetailActivity::class.java)
        intent.putExtra("media_item", item)
        startActivity(intent)
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK && homeContainer.visibility != View.VISIBLE) {
            showContainer(homeContainer)
            return true
        }
        return super.onKeyDown(keyCode, event)
    }
}
