package com.plezy.jellyfin.data.api

import com.google.gson.JsonParser
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.Assert.*
import org.junit.Test

class StremioEngineTest {
    private fun engine(server: MockWebServer): StremioEngine {
        val url = server.url("/").toString().trimEnd('/')
        val config = JsonParser.parseString("""{"metadataManifest":false,"addons":["$url/one/manifest.json","$url/two/manifest.json","$url/bad/manifest.json"]}""").asJsonObject
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val path = request.path.orEmpty()
                if (path.startsWith("/bad/")) return MockResponse().setResponseCode(503)
                val body = when {
                    path.endsWith("/manifest.json") -> """{"types":["movie","series"],"resources":["meta",{"name":"stream","types":["movie","series"],"idPrefixes":["tt"]}],"catalogs":[{"type":"movie","id":"top","extra":[{"name":"search"}]}]}"""
                    path.contains("/catalog/") -> """{"metas":[{"id":"tt123","name":"Film test","description":"Synopsis","imdbRating":"8.1"}]}"""
                    path.contains("/meta/") -> """{"meta":{"id":"tt456","name":"Series test","videos":[{"id":"tt456:1:2","season":1,"episode":2,"title":"Second"},{"id":"tt456:1:1","season":1,"episode":1,"title":"First"}]}}"""
                    path.contains("/stream/") -> """{"streams":[{"url":"https://cdn.test/movie.mp4"},{"url":"https://cdn.test/movie.mp4"},{"infoHash":"abc"},{"url":"file:///private"},{"url":"https://cdn.test/not-ready","behaviorHints":{"notWebReady":true}}]}"""
                    else -> "{}"
                }
                return MockResponse().setHeader("Content-Type", "application/json").setBody(body)
            }
        }
        return StremioEngine(config)
    }
    @Test fun catalogsAndStreamsDeduplicateAndSurviveAddonFailure() = runBlocking {
        val server = MockWebServer(); server.start()
        try {
            val engine = engine(server)
            val items = engine.catalog(search = "été & test")
            assertEquals(1, items.size); assertEquals("Film test", items[0].title)
            assertEquals(8.1, items[0].communityRating!!, 0.01)
            val streams = engine.streams(items[0].id)
            assertEquals(listOf("https://cdn.test/movie.mp4"), streams.map { it.url })
        } finally { server.shutdown() }
    }
    @Test fun episodeIdsAndSeasonOrderingArePreserved() = runBlocking {
        val server = MockWebServer(); server.start()
        try {
            val engine = engine(server)
            val episodes = engine.episodes(StremioEngine.key("series", "tt456"))[1]!!
            assertEquals(listOf(1, 2), episodes.map { it.episodeNumber })
            assertEquals("tt456:1:2", StremioEngine.parse(episodes[1].id).second)
            assertEquals(episodes[0], engine.details(episodes[0].id))
        } finally { server.shutdown() }
    }
    @Test fun manifestAndIdentifiersValidateTransportAndCredentials() {
        assertEquals("https://addon.test/token", StremioEngine.base("stremio://addon.test/token/manifest.json"))
        for (bad in listOf("file:///private", "https://user:password@addon.test/manifest.json")) {
            assertTrue(runCatching { StremioEngine.base(bad) }.isFailure)
        }
        assertTrue(runCatching { StremioEngine.parse("jellyfin-id") }.isFailure)
    }
}
