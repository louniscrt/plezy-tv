package com.plezy.jellyfin.ui.common

import android.animation.AnimatorInflater
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.ProgressBar
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.DiffUtil
import com.bumptech.glide.Glide
import com.plezy.jellyfin.R
import com.plezy.jellyfin.data.model.MediaItem
import com.plezy.jellyfin.data.model.OverseerrStatus

/**
 * Adaptateur RecyclerView fidèle au pixel près à Infuse 8 (Apple TV / visionOS) :
 * - `LANDSCAPE` : Grandes cartes 16:9 "Watching" (`item_card_landscape.xml`) avec coins arrondis 14dp, barre orange et titre/sous-titre centrés dessous.
 * - `EPISODE` : Vignettes 16:9 "Season 1" (`item_episode_infuse.xml`) avec triangle orange diagonal en coin haut-droit pour les épisodes non vus + titre numéroté "1. Smoke Gets in Your Eyes".
 * - `POSTER` : Affiches 2:3 (`item_card_poster.xml`) avec coins arrondis 14dp et triangle orange.
 */
class MediaCardAdapter(
    private val style: CardStyle,
    private val onItemFocused: (MediaItem) -> Unit,
    private val onItemClicked: (MediaItem) -> Unit
) : RecyclerView.Adapter<MediaCardAdapter.CardViewHolder>() {

    enum class CardStyle {
        LANDSCAPE,
        EPISODE,
        POSTER
    }

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

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): CardViewHolder {
        val layoutRes = when (style) {
            CardStyle.LANDSCAPE -> R.layout.item_card_landscape
            CardStyle.EPISODE -> R.layout.item_episode_infuse
            CardStyle.POSTER -> R.layout.item_card_poster
        }
        val view = LayoutInflater.from(parent.context).inflate(layoutRes, parent, false)
        if ((parent as? RecyclerView)?.layoutManager is GridLayoutManager) {
            view.layoutParams.width = ViewGroup.LayoutParams.MATCH_PARENT
        }
        return CardViewHolder(view)
    }

    override fun onBindViewHolder(holder: CardViewHolder, position: Int) {
        holder.bind(items[position])
    }

    override fun getItemCount(): Int = items.size

    inner class CardViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val ivImage: ImageView = itemView.findViewById(
            if (style == CardStyle.POSTER) R.id.ivPoster else R.id.ivThumb
        )
        private val tvTitle: TextView = itemView.findViewById(R.id.tvTitle)
        private val tvSubtitle: TextView? = itemView.findViewById(R.id.tvSubtitle)
        private val pbProgress: ProgressBar? = itemView.findViewById(R.id.pbProgress)
        private val tvBadgeCount: TextView? = itemView.findViewById(R.id.tvBadgeCount)
        private val ivUnwatchedTriangle: ImageView? = itemView.findViewById(R.id.ivUnwatchedTriangle)

        init {
            // Coins arrondis matériels (API 21+)
            ivImage.clipToOutline = true
            itemView.stateListAnimator = AnimatorInflater.loadStateListAnimator(itemView.context, R.animator.card_focus_animator)
        }

        fun bind(item: MediaItem) {
            itemView.stateListAnimator?.jumpToCurrentState()
            Glide.with(ivImage).clear(ivImage)
            ivImage.setBackgroundResource(R.drawable.bg_rounded_image_14)
            if (style == CardStyle.EPISODE) {
                tvTitle.text = item.numberedEpisodeTitle
                tvSubtitle?.visibility = View.GONE
            } else {
                tvTitle.text = item.title
                tvSubtitle?.text = item.subtitle
                tvSubtitle?.visibility = if (item.subtitle.isBlank()) View.GONE else View.VISIBLE
            }

            pbProgress?.let { bar ->
                val pct = item.progressPercent
                if (pct > 0) {
                    bar.visibility = View.VISIBLE
                    bar.progress = pct
                } else {
                    bar.visibility = View.GONE
                }
            }

            // Triangle orange en coin haut-droit identique à Infuse (épisodes non vus / films non vus)
            ivUnwatchedTriangle?.let { triangle ->
                if (!item.isPlayed && item.progressPercent == 0 && !item.isOverseerrItem) {
                    triangle.visibility = View.VISIBLE
                } else {
                    triangle.visibility = View.GONE
                }
            }

            // Badge discret pour Overseerr ou compteur d'épisodes
            tvBadgeCount?.let { badge ->
                when {
                    item.isOverseerrItem -> {
                        badge.visibility = View.VISIBLE
                        when (item.overseerrStatus) {
                            OverseerrStatus.AVAILABLE_ON_JELLYFIN -> {
                                badge.text = "✓ DISPO"
                                badge.setBackgroundResource(R.drawable.bg_badge_available)
                                badge.setTextColor(0xFF4ADE80.toInt())
                            }
                            OverseerrStatus.REQUESTED -> {
                                badge.text = "⏳ DEMANDÉ"
                                badge.setBackgroundResource(R.drawable.bg_badge_requested)
                                badge.setTextColor(0xFFFBBF24.toInt())
                            }
                            OverseerrStatus.NOT_REQUESTED -> {
                                badge.text = "＋ DEMANDER"
                                badge.setBackgroundResource(R.drawable.bg_badge_request)
                                badge.setTextColor(0xFF38BDF8.toInt())
                            }
                        }
                    }
                    item.unplayedItemCount != null && item.unplayedItemCount > 0 -> {
                        badge.visibility = View.VISIBLE
                        badge.text = item.unplayedItemCount.toString()
                        badge.setBackgroundResource(R.drawable.bg_badge_count)
                        badge.setTextColor(0xFFFFFFFF.toInt())
                    }
                    else -> {
                        badge.visibility = View.GONE
                    }
                }
            }

            val imageUrl = when (style) {
                CardStyle.LANDSCAPE -> item.thumbImageUrl ?: item.backdropImageUrl ?: item.primaryImageUrl
                CardStyle.EPISODE -> item.primaryImageUrl ?: item.backdropImageUrl
                CardStyle.POSTER -> item.primaryImageUrl ?: item.backdropImageUrl
            }

            if (!imageUrl.isNullOrBlank()) {
                val targetW = when (style) {
                    CardStyle.LANDSCAPE -> 380
                    CardStyle.EPISODE -> 300
                    CardStyle.POSTER -> 220
                }
                val targetH = when (style) {
                    CardStyle.LANDSCAPE -> 214
                    CardStyle.EPISODE -> 168
                    CardStyle.POSTER -> 320
                }
                Glide.with(itemView.context)
                    .load(imageUrl)
                    .override(targetW, targetH)
                    .placeholder(R.drawable.bg_rounded_image_14)
                    .error(R.drawable.bg_rounded_image_14)
                    .centerCrop()
                    .into(ivImage)
            } else {
                ivImage.setImageDrawable(null)
                val demoColors = intArrayOf(
                    0xFF1E293B.toInt(),
                    0xFF312E81.toInt(),
                    0xFF14532D.toInt(),
                    0xFF4C1D95.toInt(),
                    0xFF7C2D12.toInt()
                )
                ivImage.setImageDrawable(android.graphics.drawable.ColorDrawable(demoColors[(item.id.hashCode() and 0x7FFFFFFF) % demoColors.size]))
            }

            itemView.setOnFocusChangeListener { _, hasFocus ->
                val position = bindingAdapterPosition
                if (hasFocus && position != RecyclerView.NO_POSITION) onItemFocused(items[position])
            }

            itemView.setOnClickListener {
                onItemClicked(item)
            }
        }
    }
}
