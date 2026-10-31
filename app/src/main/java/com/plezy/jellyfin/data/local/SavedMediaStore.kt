package com.plezy.jellyfin.data.local

import android.content.Context
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.plezy.jellyfin.data.model.MediaItem

/** Personal list stored per Jellyfin profile on this TV. */
class SavedMediaStore(context: Context, userId: String) {
    private val prefs = context.getSharedPreferences("plezy_saved_" + userId, Context.MODE_PRIVATE)
    private val gson = Gson()
    fun items(): List<MediaItem> = try {
        gson.fromJson<List<MediaItem>>(prefs.getString("items", "[]"), object : TypeToken<List<MediaItem>>() {}.type) ?: emptyList()
    } catch (_: Exception) { emptyList() }
    fun contains(id: String) = items().any { it.id == id }
    fun toggle(item: MediaItem): Boolean {
        val all = items().toMutableList()
        val added = all.none { it.id == item.id }
        if (added) all.add(0, item) else all.removeAll { it.id == item.id }
        prefs.edit().putString("items", gson.toJson(all)).apply()
        return added
    }
}
