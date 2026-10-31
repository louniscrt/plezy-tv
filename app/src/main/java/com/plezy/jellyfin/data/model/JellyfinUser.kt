package com.plezy.jellyfin.data.model

import java.io.Serializable

data class JellyfinUser(
    val id: String,
    val name: String,
    val hasPassword: Boolean = false,
    val primaryImageTag: String? = null
) : Serializable
