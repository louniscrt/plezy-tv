package com.plezy.jellyfin.ui.common

import android.view.KeyEvent
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.ProgressBar
import android.widget.TextView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.bumptech.glide.Glide
import com.plezy.jellyfin.R
import com.plezy.jellyfin.data.model.MediaItem
import com.plezy.jellyfin.data.model.MediaType
import com.plezy.jellyfin.data.model.OverseerrStatus

/**
 * Adaptateur des rangées Netflix TV :
 * - `TILE`  : vignette 16:9 avec titre incrusté, badge rouge et progression.
 * - `TOP10` : grand chiffre détouré + affiche verticale.
 */
class NetflixRowAdapter(
    private val style: Style,
    private val recentBadgeCount: Int = 0,
    private val onItemFocused: (MediaItem, Int) -> Unit,
    private val onItemClicked: (MediaItem) -> Unit
) : RecyclerView.Adapter<NetflixRowAdapter.Holder>() {

    enum class Style { TILE, TOP10 }

    private val items = mutableListOf<MediaItem>()

    fun submitList(newItems: List<MediaItem>) {
        val old = items.toList()
        val fresh = newItems.distinctBy { it.id }
        val diff = DiffUtil.calculateDiff(object : DiffUtil.Callback() {
            override fun getOldListSize() = old.size
            override fun getNewListSize() = fresh.size
            override fun areItemsTheSame(a: Int, b: Int) = old[a].id == fresh[b].id
            override fun areContentsTheSame(a: Int, b: Int) = old[a] == fresh[b]
        })
        items.clear()
        items.addAll(fresh)
        diff.dispatchUpdatesTo(this)
    }

    fun currentItems(): List<MediaItem> = items.toList()

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
        val res = if (style == Style.TOP10) R.layout.item_nfx_top10 else R.layout.item_nfx_tile
        val view = LayoutInflater.from(parent.context).inflate(res, parent, false)
        if ((parent as? RecyclerView)?.layoutManager is GridLayoutManager) {
            view.layoutParams.width = ViewGroup.LayoutParams.MATCH_PARENT
            (view.layoutParams as? ViewGroup.MarginLayoutParams)?.let {
                it.marginEnd = (12 * parent.resources.displayMetrics.density).toInt()
                it.bottomMargin = (16 * parent.resources.displayMetrics.density).toInt()
            }
        }
        return Holder(view)
    }

    override fun onBindViewHolder(holder: Holder, position: Int) = holder.bind(items[position], position)

    override fun getItemCount(): Int = items.size

    inner class Holder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val ivThumb: ImageView = itemView.findViewById(R.id.ivThumb)
        private val tvTitle: TextView = itemView.findViewById(R.id.tvTitle)
        private val tvBadge: TextView? = itemView.findViewById(R.id.tvBadge)
        private val tvBrand: TextView? = itemView.findViewById(R.id.tvBrand)
        private val pbProgress: ProgressBar? = itemView.findViewById(R.id.pbProgress)
        private val rank: OutlinedNumberView? = itemView.findViewById(R.id.tvRank)

        init {
            ivThumb.clipToOutline = true
            itemView.findViewById<View>(R.id.tileFrame)?.clipToOutline = true
        }

        fun bind(item: MediaItem, position: Int) {
            rank?.number = (position + 1).toString()

            val isEpisode = item.type == MediaType.EPISODE
            tvTitle.text = if (isEpisode) (item.seriesName ?: item.title) else item.title

            // Le logo "P" rouge signale les titres déjà présents dans votre Jellyfin
            tvBrand?.visibility = if (!item.isSeerrMedia) View.VISIBLE else View.GONE

            val pct = item.progressPercent
            pbProgress?.let {
                it.visibility = if (pct > 0) View.VISIBLE else View.GONE
                it.progress = pct
            }

            tvBadge?.let { badge ->
                val (text, red) = badgeFor(item, position, pct)
                if (text == null) {
                    badge.visibility = View.GONE
                } else {
                    badge.visibility = View.VISIBLE
                    badge.text = text
                    badge.setBackgroundResource(if (red) R.drawable.bg_nfx_badge_red else R.drawable.bg_nfx_badge_dark)
                }
            }

            val url = if (style == Style.TOP10) {
                item.primaryImageUrl ?: item.backdropImageUrl
            } else if (isEpisode) {
                item.primaryImageUrl ?: item.thumbImageUrl ?: item.backdropImageUrl
            } else {
                item.backdropImageUrl ?: item.thumbImageUrl ?: item.primaryImageUrl
            }
            Glide.with(ivThumb).clear(ivThumb)
            if (!url.isNullOrBlank()) {
                val (w, h) = if (style == Style.TOP10) 180 to 262 else 464 to 262
                Glide.with(ivThumb).load(url).override(w, h).centerCrop()
                    .placeholder(R.drawable.bg_nfx_tile).error(R.drawable.bg_nfx_tile).into(ivThumb)
            } else {
                ivThumb.setImageResource(R.drawable.bg_nfx_tile)
            }

            itemView.setOnFocusChangeListener { v, hasFocus ->
                val s = if (hasFocus) 1.06f else 1f
                v.animate().scaleX(s).scaleY(s).setDuration(150).start()
                if (hasFocus) onItemFocused(item, bindingAdapterPosition.coerceAtLeast(0))
            }
            itemView.setOnClickListener { onItemClicked(item) }
            itemView.setOnKeyListener { _, keyCode, event ->
                if (event.action != KeyEvent.ACTION_DOWN) return@setOnKeyListener false
                val pos = bindingAdapterPosition
                when (keyCode) {
                    KeyEvent.KEYCODE_DPAD_RIGHT -> pos == itemCount - 1 && (itemView.parent as? RecyclerView)?.layoutManager !is GridLayoutManager
                    KeyEvent.KEYCODE_DPAD_LEFT -> pos == 0 && (itemView.parent as? RecyclerView)?.layoutManager !is GridLayoutManager
                    else -> false
                }
            }
        }

        private fun badgeFor(item: MediaItem, position: Int, pct: Int): Pair<String?, Boolean> {
            if (item.isSeerrMedia) {
                return when (item.overseerrStatus) {
                    OverseerrStatus.AVAILABLE_ON_JELLYFIN -> "Disponible" to true
                    OverseerrStatus.REQUESTED -> "Demandé" to false
                    OverseerrStatus.NOT_REQUESTED -> null to false
                }
            }
            if (pct > 0) return null to false
            if (position < recentBadgeCount) {
                return "Récemment ajouté" to true
            }
            return null to false
        }
    }
}
