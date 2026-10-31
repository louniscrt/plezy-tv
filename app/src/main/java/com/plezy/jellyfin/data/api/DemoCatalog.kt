package com.plezy.jellyfin.data.api

import com.plezy.jellyfin.data.model.ChapterInfo
import com.plezy.jellyfin.data.model.MediaItem
import com.plezy.jellyfin.data.model.MediaType
import com.plezy.jellyfin.data.model.OverseerrStatus

/**
 * Catalogue complet reproduisant toutes les sections Plezy :
 * - Continue Watching (1917, Frieren, Curb Your Enthusiasm, Better Call Saul)
 * - TV Shows (Attack on Titan, Better Call Saul, Chernobyl, Curb Your Enthusiasm, Death Note, Demon Slayer, Dexter, Frieren, Halt and Catch Fire, House, It's Always Sunny...)
 * - Movies (1917, Oppenheimer, Dune: Part Two, Blade Runner 2049, Interstellar, Parasite)
 * - Collections & Playlists
 */
object DemoCatalog {

    private val defaultChapters = listOf(
        ChapterInfo("Cold Open", 0L),
        ChapterInfo("Opening Credits", 2_500_000_000L),
        ChapterInfo("The Pickle Jar", 5_200_000_000L),
        ChapterInfo("Hotel Advice", 9_100_000_000L),
        ChapterInfo("The Diversion", 13_400_000_000L),
        ChapterInfo("Dinner Scene", 16_800_000_000L),
        ChapterInfo("End Credits", 19_500_000_000L)
    )

    val continueWatching: List<MediaItem> = listOf(
        MediaItem(
            id = "demo_1917",
            title = "1917",
            subtitle = "2019",
            type = MediaType.MOVIE,
            overview = "April 6th, 1917. As an infantry battalion assembles to wage war deep in enemy territory, two soldiers are assigned to race against time and deliver a message that will stop 1,600 men from walking straight into a deadly trap.",
            communityRating = 8.8,
            officialRating = "R",
            runtimeTicks = 70_800_000_000L, // 1h 58min
            playbackPositionTicks = 28_000_000_000L,
            productionYear = 2019,
            videoCodec = "h264",
            videoWidth = 1920,
            chapters = defaultChapters
        ),
        MediaItem(
            id = "demo_frieren_s1e2",
            title = "Frieren: Beyond Journey's End",
            subtitle = "S1 E2 · It Didn't Have to Be Magic...",
            type = MediaType.EPISODE,
            overview = "Frieren takes Fern under her wing as an apprentice and begins deciphering a grimoire left behind by Heiter.",
            communityRating = 9.3,
            officialRating = "TV-14",
            runtimeTicks = 14_400_000_000L,
            playbackPositionTicks = 1_800_000_000L,
            productionYear = 2023,
            seriesName = "Frieren: Beyond Journey's End",
            seriesId = "demo_frieren",
            seasonNumber = 1,
            episodeNumber = 2,
            videoCodec = "hevc",
            videoWidth = 1920,
            chapters = defaultChapters
        ),
        MediaItem(
            id = "demo_curb_s9e2",
            title = "Curb Your Enthusiasm",
            subtitle = "S9 E2 · The Pickle Gambit",
            type = MediaType.EPISODE,
            overview = "Larry reaches out to a familiar face, gives a hotel guest sartorial advice and looks to create a diversion to help a friend's nephew.",
            communityRating = 8.8,
            officialRating = "TV-MA",
            runtimeTicks = 21_000_000_000L, // 35min
            playbackPositionTicks = 3_470_000_000L, // 5:47
            productionYear = 2017,
            seriesName = "Curb Your Enthusiasm",
            seriesId = "demo_curb",
            seasonNumber = 9,
            episodeNumber = 2,
            videoCodec = "h264",
            videoWidth = 1920,
            chapters = defaultChapters
        ),
        MediaItem(
            id = "demo_bcs_s2e2",
            title = "Better Call Saul",
            subtitle = "S2 E2 · Cobbler",
            type = MediaType.EPISODE,
            overview = "Mike brokers a deal to keep a volatile situation from spiraling out of control; Jimmy tries to exonerate an eccentric client.",
            communityRating = 9.0,
            officialRating = "TV-MA",
            runtimeTicks = 27_600_000_000L,
            playbackPositionTicks = 3_200_000_000L,
            productionYear = 2016,
            seriesName = "Better Call Saul",
            seriesId = "demo_bcs",
            seasonNumber = 2,
            episodeNumber = 2,
            videoCodec = "h264",
            videoWidth = 1920,
            chapters = defaultChapters
        )
    )

    val libraryShows: List<MediaItem> = listOf(
        MediaItem(
            id = "demo_aot",
            title = "Attack on Titan",
            subtitle = "2013",
            type = MediaType.SERIES,
            overview = "After his hometown is destroyed and his mother is killed, young Eren Jaeger vows to cleanse the earth of the giant humanoid Titans.",
            communityRating = 9.1,
            officialRating = "TV-MA",
            productionYear = 2013,
            unplayedItemCount = 87
        ),
        MediaItem(
            id = "demo_bcs",
            title = "Better Call Saul",
            subtitle = "2015",
            type = MediaType.SERIES,
            overview = "The trials and tribulations of criminal lawyer Jimmy McGill in the years leading up to his fateful run-in with Walter White and Jesse Pinkman.",
            communityRating = 9.0,
            officialRating = "TV-MA",
            productionYear = 2015,
            unplayedItemCount = 63
        ),
        MediaItem(
            id = "demo_chernobyl",
            title = "Chernobyl",
            subtitle = "2019",
            type = MediaType.SERIES,
            overview = "In April 1986, an explosion at the Chernobyl nuclear power plant in the Union of Soviet Socialist Republics becomes one of the world's worst man-made catastrophes.",
            communityRating = 9.3,
            officialRating = "TV-MA",
            productionYear = 2019,
            unplayedItemCount = 5
        ),
        MediaItem(
            id = "demo_curb",
            title = "Curb Your Enthusiasm",
            subtitle = "2000",
            type = MediaType.SERIES,
            overview = "Larry reaches out to a familiar face, gives a hotel guest sartorial advice and looks to create a diversion to help a friend's nephew.",
            communityRating = 8.8,
            officialRating = "TV-MA",
            runtimeTicks = 21_000_000_000L,
            productionYear = 2000,
            unplayedItemCount = 100
        ),
        MediaItem(
            id = "demo_deathnote",
            title = "Death Note",
            subtitle = "2006",
            type = MediaType.SERIES,
            overview = "An intelligent high school student goes on a secret crusade to eliminate criminals from the world after discovering a notebook capable of killing anyone whose name is written into it.",
            communityRating = 8.9,
            officialRating = "TV-14",
            productionYear = 2006,
            unplayedItemCount = 37
        ),
        MediaItem(
            id = "demo_demonslayer",
            title = "Demon Slayer: Kimetsu no Yaiba",
            subtitle = "2019",
            type = MediaType.SERIES,
            overview = "A family is attacked by demons and only two members survive - Tanjiro and his sister Nezuko, who is turning into a demon slowly.",
            communityRating = 8.6,
            officialRating = "TV-MA",
            productionYear = 2019,
            unplayedItemCount = 55
        ),
        MediaItem(
            id = "demo_dexter",
            title = "Dexter",
            subtitle = "2006",
            type = MediaType.SERIES,
            overview = "He's smart. He's lovable. He's Dexter Morgan, America's favorite serial killer, who spends his days solving crimes and nights committing them.",
            communityRating = 8.7,
            officialRating = "TV-MA",
            productionYear = 2006,
            unplayedItemCount = 96
        ),
        MediaItem(
            id = "demo_dexter_nb",
            title = "Dexter: New Blood",
            subtitle = "2021",
            type = MediaType.SERIES,
            overview = "Set 10 years after Dexter went missing in the eye of Hurricane Laura, the series sees him living under an assumed name in the small town of Iron Lake, New York.",
            communityRating = 8.1,
            officialRating = "TV-MA",
            productionYear = 2021,
            unplayedItemCount = 10
        ),
        MediaItem(
            id = "demo_frieren",
            title = "Frieren: Beyond Journey's End",
            subtitle = "2023",
            type = MediaType.SERIES,
            overview = "After a ten-year quest to defeat the Demon King, the elven mage Frieren embarks on a new journey to understand humanity and the passage of time.",
            communityRating = 9.3,
            officialRating = "TV-14",
            productionYear = 2023,
            unplayedItemCount = 38
        ),
        MediaItem(
            id = "demo_hacf",
            title = "Halt and Catch Fire",
            subtitle = "2014",
            type = MediaType.SERIES,
            overview = "Set in the early 1980s, series dramatizes the personal computing boom through the eyes of a visionary, an engineer and a prodigy.",
            communityRating = 8.4,
            officialRating = "TV-14",
            productionYear = 2014,
            unplayedItemCount = 40
        ),
        MediaItem(
            id = "demo_house",
            title = "House",
            subtitle = "2004",
            type = MediaType.SERIES,
            overview = "An antisocial maverick doctor who specializes in diagnostic medicine does whatever it takes to solve puzzling cases that come his way.",
            communityRating = 8.7,
            officialRating = "TV-14",
            productionYear = 2004,
            unplayedItemCount = 176
        ),
        MediaItem(
            id = "demo_sunny",
            title = "It's Always Sunny in Philadelphia",
            subtitle = "2005",
            type = MediaType.SERIES,
            overview = "Five friends with big egos and small brains are the proprietors of an Irish pub in Philadelphia.",
            communityRating = 8.8,
            officialRating = "TV-MA",
            productionYear = 2005,
            unplayedItemCount = 170
        )
    )

    val movies: List<MediaItem> = listOf(
        continueWatching[0],
        MediaItem(
            id = "demo_oppenheimer",
            title = "Oppenheimer",
            subtitle = "2023",
            type = MediaType.MOVIE,
            overview = "The story of J. Robert Oppenheimer's role in the development of the atomic bomb during World War II.",
            communityRating = 8.9,
            officialRating = "R",
            runtimeTicks = 108_000_000_000L,
            productionYear = 2023,
            videoCodec = "hevc",
            videoWidth = 3840,
            chapters = defaultChapters
        ),
        MediaItem(
            id = "demo_dune2",
            title = "Dune: Part Two",
            subtitle = "2024",
            type = MediaType.MOVIE,
            overview = "Paul Atreides unites with Chani and the Fremen while on a warpath of revenge against the conspirators who destroyed his family.",
            communityRating = 8.8,
            officialRating = "PG-13",
            runtimeTicks = 99_600_000_000L,
            productionYear = 2024,
            videoCodec = "hevc",
            videoWidth = 3840,
            chapters = defaultChapters
        ),
        MediaItem(
            id = "demo_br2049",
            title = "Blade Runner 2049",
            subtitle = "2017",
            type = MediaType.MOVIE,
            overview = "Young Blade Runner K's discovery of a long-buried secret leads him to track down former Blade Runner Rick Deckard.",
            communityRating = 8.5,
            officialRating = "R",
            runtimeTicks = 98_400_000_000L,
            productionYear = 2017,
            videoCodec = "h264",
            videoWidth = 1920,
            chapters = defaultChapters
        )
    )

    val collections: List<MediaItem> = listOf(
        MediaItem(
            id = "col_hbo",
            title = "HBO Prestige Classics",
            subtitle = "Collection · 4 items",
            type = MediaType.COLLECTION,
            overview = "Chernobyl, Curb Your Enthusiasm, The Wire, The Sopranos.",
            unplayedItemCount = 4
        ),
        MediaItem(
            id = "col_anime",
            title = "Masterpiece Anime",
            subtitle = "Collection · 4 items",
            type = MediaType.COLLECTION,
            overview = "Frieren: Beyond Journey's End, Attack on Titan, Death Note, Demon Slayer.",
            unplayedItemCount = 4
        )
    )

    val playlists: List<MediaItem> = listOf(
        MediaItem(
            id = "pl_weekend",
            title = "Late Night Comedy",
            subtitle = "Playlist · 18 episodes",
            type = MediaType.PLAYLIST,
            overview = "Best episodes of Curb Your Enthusiasm & It's Always Sunny in Philadelphia.",
            unplayedItemCount = 18
        )
    )

    val recentlyAddedShows: List<MediaItem> = libraryShows

    /**
     * Catalogue de découverte Overseerr / Seerr (Films & Séries Tendances que l'on peut "Request" en 1 clic)
     */
    val overseerrTrending: List<MediaItem> = listOf(
        MediaItem(
            id = "seerr_693134",
            title = "Dune: Part Two",
            subtitle = "2024 · Movie",
            type = MediaType.MOVIE,
            overview = "Follow the mythic journey of Paul Atreides as he unites with Chani and the Fremen while on a warpath of revenge against the conspirators who destroyed his family.",
            communityRating = 8.8,
            officialRating = "PG-13",
            runtimeTicks = 99_600_000_000L,
            productionYear = 2024,
            premiereDateFormatted = "Mar 1, 2024",
            genres = listOf("Sci-Fi", "Adventure", "Drama"),
            castMembers = listOf("Timothée Chalamet", "Zendaya", "Rebecca Ferguson", "Javier Bardem"),
            primaryImageUrl = "https://image.tmdb.org/t/p/w342/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg",
            backdropImageUrl = "https://image.tmdb.org/t/p/w780/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg",
            tmdbId = 693134,
            isOverseerrItem = true,
            overseerrStatus = OverseerrStatus.NOT_REQUESTED
        ),
        MediaItem(
            id = "seerr_95396",
            title = "Severance",
            subtitle = "2022 · TV Series",
            type = MediaType.SERIES,
            overview = "Mark leads a team of office workers whose memories have been surgically divided between their work and personal lives.",
            communityRating = 8.9,
            officialRating = "TV-MA",
            runtimeTicks = 30_000_000_000L,
            productionYear = 2022,
            premiereDateFormatted = "Feb 18, 2022",
            genres = listOf("Drama", "Mystery", "Sci-Fi"),
            castMembers = listOf("Adam Scott", "Britt Lower", "Patricia Arquette", "John Turturro"),
            primaryImageUrl = "https://image.tmdb.org/t/p/w342/pPHpeI2X1qEd1CS1SeyrdhZ4qnT.jpg",
            backdropImageUrl = "https://image.tmdb.org/t/p/w780/hPea3Qy5Gd6z4kJLUruBbwAH8Rm.jpg",
            tmdbId = 95396,
            isOverseerrItem = true,
            overseerrStatus = OverseerrStatus.NOT_REQUESTED
        ),
        MediaItem(
            id = "seerr_1396",
            title = "Mad Men",
            subtitle = "2007 · TV Series",
            type = MediaType.SERIES,
            overview = "Don continues to conceal his increasingly complicated personal life, even in the face of Roger Sterling's invitation to open up. Meanwhile, Peggy pines for the absent Pete still on his honeymoon.",
            communityRating = 8.6,
            officialRating = "TV-14",
            runtimeTicks = 28_800_000_000L,
            productionYear = 2007,
            premiereDateFormatted = "Jul 26, 2007",
            genres = listOf("Drama"),
            castMembers = listOf("Jon Hamm", "Elisabeth Moss", "Vincent Kartheiser", "January Jones", "Christina Hendricks"),
            primaryImageUrl = "https://image.tmdb.org/t/p/w342/7v8iCNzKFpdlr21Co3111111.jpg",
            tmdbId = 1104,
            isOverseerrItem = true,
            overseerrStatus = OverseerrStatus.NOT_REQUESTED
        ),
        MediaItem(
            id = "seerr_872585",
            title = "Oppenheimer",
            subtitle = "2023 · Movie",
            type = MediaType.MOVIE,
            overview = "The story of J. Robert Oppenheimer's role in the development of the atomic bomb during World War II.",
            communityRating = 8.9,
            officialRating = "R",
            runtimeTicks = 108_000_000_000L,
            productionYear = 2023,
            premiereDateFormatted = "Jul 21, 2023",
            genres = listOf("Drama", "History"),
            castMembers = listOf("Cillian Murphy", "Emily Blunt", "Matt Damon", "Robert Downey Jr."),
            primaryImageUrl = "https://image.tmdb.org/t/p/w342/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg",
            backdropImageUrl = "https://image.tmdb.org/t/p/w780/fm6KqXpk3M2HVveHwCrBSSBaO0V.jpg",
            tmdbId = 872585,
            isOverseerrItem = true,
            overseerrStatus = OverseerrStatus.NOT_REQUESTED
        ),
        MediaItem(
            id = "seerr_136315",
            title = "The Bear",
            subtitle = "2022 · TV Series",
            type = MediaType.SERIES,
            overview = "Carmy, a young fine-dining chef, comes home to Chicago to run his family sandwich shop after a heartbreaking death in his family.",
            communityRating = 8.7,
            officialRating = "TV-MA",
            runtimeTicks = 19_200_000_000L,
            productionYear = 2022,
            premiereDateFormatted = "Jun 23, 2022",
            genres = listOf("Drama", "Comedy"),
            castMembers = listOf("Jeremy Allen White", "Ayo Edebiri", "Ebon Moss-Bachrach"),
            primaryImageUrl = "https://image.tmdb.org/t/p/w342/sHFlbKS3WLqMnp9t2ghADIJFnuQ.jpg",
            tmdbId = 136315,
            isOverseerrItem = true,
            overseerrStatus = OverseerrStatus.NOT_REQUESTED
        ),
        MediaItem(
            id = "seerr_126308",
            title = "Shōgun",
            subtitle = "2024 · TV Series",
            type = MediaType.SERIES,
            overview = "In Japan in the year 1600, at the dawn of a century-defining civil war, Lord Yoshii Toranaga is fighting for his life as his enemies on the Council of Regents unite against him.",
            communityRating = 9.0,
            officialRating = "TV-MA",
            runtimeTicks = 36_000_000_000L,
            productionYear = 2024,
            premiereDateFormatted = "Feb 27, 2024",
            genres = listOf("Drama", "War & Politics"),
            castMembers = listOf("Hiroyuki Sanada", "Cosmo Jarvis", "Anna Sawai"),
            primaryImageUrl = "https://image.tmdb.org/t/p/w342/7O4iVfOMQmdCSxhOg1WnzG1AgYT.jpg",
            tmdbId = 126308,
            isOverseerrItem = true,
            overseerrStatus = OverseerrStatus.NOT_REQUESTED
        ),
        MediaItem(
            id = "seerr_533535",
            title = "Gladiator II",
            subtitle = "2024 · Movie",
            type = MediaType.MOVIE,
            overview = "Years after witnessing the death of the revered hero Maximus at the hands of his uncle, Lucius is forced to enter the Colosseum.",
            communityRating = 7.8,
            officialRating = "R",
            runtimeTicks = 88_800_000_000L,
            productionYear = 2024,
            premiereDateFormatted = "Nov 15, 2024",
            genres = listOf("Action", "Adventure"),
            castMembers = listOf("Paul Mescal", "Pedro Pascal", "Denzel Washington"),
            primaryImageUrl = "https://image.tmdb.org/t/p/w342/2cxhvwyEwRlysAmRH4iodkvo0z5.jpg",
            tmdbId = 558449,
            isOverseerrItem = true,
            overseerrStatus = OverseerrStatus.NOT_REQUESTED
        ),
        MediaItem(
            id = "seerr_94997",
            title = "House of the Dragon",
            subtitle = "2022 · TV Series",
            type = MediaType.SERIES,
            overview = "The Targaryen dynasty is at the absolute apex of its power, with more than 15 dragons under their yoke.",
            communityRating = 8.4,
            officialRating = "TV-MA",
            runtimeTicks = 36_000_000_000L,
            productionYear = 2022,
            premiereDateFormatted = "Aug 21, 2022",
            genres = listOf("Sci-Fi & Fantasy", "Drama"),
            castMembers = listOf("Matt Smith", "Emma D'Arcy", "Olivia Cooke"),
            primaryImageUrl = "https://image.tmdb.org/t/p/w342/z2yahl2uefxDCl0nogcRBstwruJ.jpg",
            tmdbId = 94997,
            isOverseerrItem = true,
            overseerrStatus = OverseerrStatus.NOT_REQUESTED
        )
    )

    fun getSeasonsForSeries(seriesId: String): Map<Int, List<MediaItem>> {
        val s9 = listOf(
            MediaItem(
                id = "${seriesId}_s9e1",
                title = "Curb Your Enthusiasm",
                subtitle = "S9 E1 · Foisted!",
                type = MediaType.EPISODE,
                overview = "Larry tries to rid himself of an inept assistant, offends Jeff's barber and gets into hot water over a new project.",
                officialRating = "TV-MA",
                runtimeTicks = 21_000_000_000L,
                seasonNumber = 9,
                episodeNumber = 1,
                chapters = defaultChapters
            ),
            MediaItem(
                id = "${seriesId}_s9e2",
                title = "Curb Your Enthusiasm",
                subtitle = "S9 E2 · The Pickle Gambit",
                type = MediaType.EPISODE,
                overview = "Larry reaches out to a familiar face, gives a hotel guest sartorial advice and looks to create a diversion to help a friend's nephew.",
                officialRating = "TV-MA",
                runtimeTicks = 21_000_000_000L,
                playbackPositionTicks = 3_470_000_000L,
                seasonNumber = 9,
                episodeNumber = 2,
                chapters = defaultChapters
            ),
            MediaItem(
                id = "${seriesId}_s9e3",
                title = "Curb Your Enthusiasm",
                subtitle = "S9 E3 · A Disturbance in the Kitchen",
                type = MediaType.EPISODE,
                overview = "Larry turns to a writer for advice, gets ticked off by the LAPD while tracking down Susie's missing Little Sister.",
                officialRating = "TV-MA",
                runtimeTicks = 21_000_000_000L,
                seasonNumber = 9,
                episodeNumber = 3,
                chapters = defaultChapters
            ),
            MediaItem(
                id = "${seriesId}_s9e4",
                title = "Curb Your Enthusiasm",
                subtitle = "S9 E4 · Running with the Bulls",
                type = MediaType.EPISODE,
                overview = "Larry's therapist accuses him of crossing a line; Susie gets suspicious of Jeff; Larry offers a bribe at a funeral.",
                officialRating = "TV-MA",
                runtimeTicks = 21_000_000_000L,
                seasonNumber = 9,
                episodeNumber = 4,
                chapters = defaultChapters
            )
        )

        val s10 = listOf(
            MediaItem(
                id = "${seriesId}_s10e1",
                title = "Curb Your Enthusiasm",
                subtitle = "S10 E1 · Happy New Year",
                type = MediaType.EPISODE,
                overview = "Larry makes a new enemy in Mocha Joe and triggers misunderstandings with Cheryl and a catering couple.",
                officialRating = "TV-MA",
                runtimeTicks = 21_000_000_000L,
                seasonNumber = 10,
                episodeNumber = 1,
                chapters = defaultChapters
            ),
            MediaItem(
                id = "${seriesId}_s10e2",
                title = "Curb Your Enthusiasm",
                subtitle = "S10 E2 · Side Sitting",
                type = MediaType.EPISODE,
                overview = "Larry's lawyer tries to resolve his Alice issue; Larry buys an extravagant gift for Susie.",
                officialRating = "TV-MA",
                runtimeTicks = 21_000_000_000L,
                seasonNumber = 10,
                episodeNumber = 2,
                chapters = defaultChapters
            )
        )

        return mapOf(9 to s9, 10 to s10)
    }
}
