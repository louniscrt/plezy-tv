plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.plezy.jellyfin"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.plezy.jellyfin"
        // Cible explicitement Fire OS / Android 5.1 (API Level 22)
        minSdk = 22
        targetSdk = 34
        versionCode = 6
        versionName = "2.2.0-PlezyTV"

        // MultiDex requis sur API 22 si le nombre de méthodes dépasse 64K
        multiDexEnabled = true
        vectorDrawables.useSupportLibrary = true
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }

    kotlinOptions {
        jvmTarget = "1.8"
    }

    buildFeatures {
        viewBinding = true
    }
}

dependencies {
    // Support AndroidX & UI légère compatible API 22
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("androidx.constraintlayout:constraintlayout:2.1.4")
    implementation("androidx.recyclerview:recyclerview:1.3.2")
    implementation("androidx.leanback:leanback:1.0.0")
    implementation("androidx.multidex:multidex:2.0.1")

    // Coroutines & Lifecycle
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.7.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.7.0")

    // Réseau : OkHttp 4.12.0 supporte minSdk 21+ (et TLS 1.2 sur Android 5.1)
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.google.code.gson:gson:2.10.1")

    // Chargement d'images optimisé pour 1 Go RAM (RGB_565 + sous-échantillonnage serveur Jellyfin)
    implementation("com.github.bumptech.glide:glide:4.16.0")

    // Lecteur vidéo : ExoPlayer 2.19.1 (robuste sur API 22 pour Direct Play H.264 et HLS Transcoding)
    implementation("com.google.android.exoplayer:exoplayer-core:2.19.1")
    implementation("com.google.android.exoplayer:exoplayer-hls:2.19.1")
    implementation("com.google.android.exoplayer:exoplayer-ui:2.19.1")
}
