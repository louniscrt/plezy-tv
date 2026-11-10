/* Même sélection d'aperçu que la version Vega. Aucun identifiant serveur. */
(() => {
  const titles = [
    ['Colisión', 'Movie', 2026, 'Thriller', 'Un casse méticuleusement préparé tourne court quand une conspiration interne refait surface dans les rues de Bogota.', 'photo-1509198397868-475647b2a1e5'],
    ['Habeas Corpus', 'Series', 2026, 'Drame', 'Face à une erreur judiciaire, une avocate tenace s’attaque aux plus hautes sphères du pouvoir pour libérer un innocent.', 'photo-1574375927938-d5a98e8ffe85'],
    ['A Different World', 'Series', 2026, 'Comédie', 'Une nouvelle génération découvre la vie universitaire, entre amitiés, ambitions et liberté.', 'photo-1534447677768-be436bb09401'],
    ['Mayor of Kingstown', 'Series', 2024, 'Drame', 'Dans une ville où les prisons sont la seule industrie prospère, la famille McLusky négocie entre les gangs et les forces de l’ordre.', 'photo-1509281373149-e957c6296406'],
    ['Medusa', 'Movie', 2025, 'Action', 'Une espionne d’élite traquée par son propre réseau tente de sauver sa famille et de faire éclater une conspiration.', 'photo-1536440136628-849c177e76a1'],
    ['The Gentlemen', 'Series', 2024, 'Action', 'Eddie Horniman hérite du domaine de son père et découvre un empire secret de la pègre britannique.', 'photo-1489599849927-2ee91cede3ba'],
    ['1917', 'Movie', 2019, 'Guerre', 'Deux soldats doivent traverser les lignes ennemies pour remettre un message qui pourrait sauver des centaines de vies.', 'photo-1478720568477-152d9b164e26'],
    ['Interstellar', 'Movie', 2014, 'Science-fiction', 'Un groupe d’explorateurs franchit les limites de notre galaxie pour chercher un avenir à l’humanité.', 'photo-1446776811953-b23d57bd21aa']
  ];
  window.PlezyDemo = titles.map(([Name, Type, ProductionYear, genre, Overview, photo], i) => ({ Id: 'demo-' + i, Name, Type, ProductionYear, Genres: [genre], Overview, demo: true, art: 'art/demo-' + i + '.jpg', OfficialRating: '16+', RunTimeTicks: (Type === 'Movie' ? 106 : 45) * 600000000, UserData: { PlaybackPositionTicks: i < 4 ? (i + 1) * 2400000000 : 0 }, photo }));
  window.PlezyDemoSeasons = series => [{ Id: series.Id + '-s1', Name: 'Saison 1', IndexNumber: 1 }];
  window.PlezyDemoEpisodes = (series, season) => Array.from({ length: 6 }, (_, i) => ({ ...series, Id: series.Id + '-e' + i, Name: 'Épisode ' + (i + 1), Type: 'Episode', SeriesName: series.Name, SeriesId: series.Id, ParentIndexNumber: season.IndexNumber, IndexNumber: i + 1, UserData: {} }));
})();
