# Règles ProGuard pour conserver les modèles JSON Jellyfin et ExoPlayer
-keep class com.plezy.jellyfin.data.model.** { *; }
-dontwarn com.google.android.exoplayer2.**
