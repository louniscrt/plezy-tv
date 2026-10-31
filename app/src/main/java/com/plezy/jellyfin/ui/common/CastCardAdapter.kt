package com.plezy.jellyfin.ui.common

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.bumptech.glide.Glide
import com.plezy.jellyfin.R
import com.plezy.jellyfin.data.model.CastMember

/**
 * Adaptateur pour la rangée "Cast and Crew" au bas de l'écran de détails Infuse 8 (`item_cast_infuse.xml`) :
 * Affiche la photo portrait arrondie de chaque acteur avec son nom et son rôle centrés en dessous.
 */
class CastCardAdapter : RecyclerView.Adapter<CastCardAdapter.CastViewHolder>() {

    private val members = mutableListOf<CastMember>()

    fun submitList(newMembers: List<CastMember>) {
        members.clear()
        members.addAll(newMembers)
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): CastViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_cast_infuse, parent, false)
        return CastViewHolder(view)
    }

    override fun onBindViewHolder(holder: CastViewHolder, position: Int) {
        holder.bind(members[position])
    }

    override fun getItemCount(): Int = members.size

    class CastViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val ivCastPhoto: ImageView = itemView.findViewById(R.id.ivCastPhoto)
        private val tvCastName: TextView = itemView.findViewById(R.id.tvCastName)
        private val tvCastRole: TextView = itemView.findViewById(R.id.tvCastRole)

        init {
            ivCastPhoto.clipToOutline = true
        }

        fun bind(member: CastMember) {
            tvCastName.text = member.name
            tvCastRole.text = member.role.ifBlank { "Actor" }

            if (!member.imageUrl.isNullOrBlank()) {
                Glide.with(itemView.context)
                    .load(member.imageUrl)
                    .override(160, 200)
                    .centerCrop()
                    .into(ivCastPhoto)
            } else {
                ivCastPhoto.setImageDrawable(null)
                ivCastPhoto.setBackgroundColor(0xFF232630.toInt())
            }

            itemView.setOnFocusChangeListener { v, hasFocus ->
                val scale = if (hasFocus) 1.05f else 1.0f
                v.animate().scaleX(scale).scaleY(scale).setDuration(140).start()
            }
        }
    }
}
