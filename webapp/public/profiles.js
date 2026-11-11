(() => {
  'use strict';

  const AVATAR_SVGS = {
    lounis: `
      <svg viewBox="0 0 140 140" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="ringGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#00e5ff" stop-opacity="0.3"/>
            <stop offset="60%" stop-color="#00a8ff" stop-opacity="0.1"/>
            <stop offset="100%" stop-color="#0b1329" stop-opacity="0"/>
          </radialGradient>
          <filter id="neonBlur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        <rect width="140" height="140" fill="#0c1220" rx="8"/>
        <circle cx="70" cy="70" r="48" fill="url(#ringGlow)"/>
        <!-- Ring of segmented cyan curved bars -->
        <g filter="url(#neonBlur)" stroke-linecap="round">
          <circle cx="70" cy="70" r="38" fill="none" stroke="#00e5ff" stroke-width="8.5"
                  stroke-dasharray="14 10" transform="rotate(-30 70 70)"/>
        </g>
        <!-- Center subtle glow -->
        <circle cx="70" cy="70" r="20" fill="#00d2ff" opacity="0.18"/>
      </svg>
    `,
    djey: `
      <svg viewBox="0 0 140 140" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <rect width="140" height="140" fill="#325244" rx="8"/>
        <!-- Ape / Monkey character in jacket -->
        <g transform="translate(10, 10)">
          <!-- Jacket collar -->
          <path d="M20 100 L40 76 L80 76 L100 100 Z" fill="#693b22"/>
          <path d="M42 78 L60 98 L78 78 Z" fill="#f4ebd9"/>
          <path d="M30 84 L44 115 L76 115 L90 84 Z" fill="#4d2a17"/>
          <!-- Head -->
          <circle cx="60" cy="52" r="34" fill="#3d2c23"/>
          <!-- Ears -->
          <circle cx="28" cy="54" r="12" fill="#543e32"/>
          <circle cx="28" cy="54" r="7" fill="#8d6e5a"/>
          <circle cx="92" cy="54" r="12" fill="#543e32"/>
          <circle cx="92" cy="54" r="7" fill="#8d6e5a"/>
          <!-- Aviator Cap -->
          <path d="M30 46 C32 20 88 20 90 46 C84 48 36 48 30 46 Z" fill="#241a15"/>
          <path d="M28 42 C30 26 90 26 92 42 Z" fill="#1b1410"/>
          <!-- Goggles on cap -->
          <ellipse cx="46" cy="36" rx="9" ry="6" fill="#4a5568" stroke="#cbd5e0" stroke-width="2"/>
          <ellipse cx="74" cy="36" rx="9" ry="6" fill="#4a5568" stroke="#cbd5e0" stroke-width="2"/>
          <!-- Face muzzle -->
          <ellipse cx="60" cy="62" rx="20" ry="16" fill="#8d6e5a"/>
          <!-- Nose -->
          <ellipse cx="57" cy="58" rx="2.5" ry="3" fill="#241a15"/>
          <ellipse cx="63" cy="58" rx="2.5" ry="3" fill="#241a15"/>
          <!-- Eyes -->
          <circle cx="48" cy="50" r="5" fill="#f6e05e"/>
          <circle cx="48" cy="50" r="2.5" fill="#1a202c"/>
          <circle cx="72" cy="50" r="5" fill="#f6e05e"/>
          <circle cx="72" cy="50" r="2.5" fill="#1a202c"/>
          <!-- Mouth / Beard -->
          <path d="M52 68 Q60 74 68 68" stroke="#241a15" stroke-width="2" fill="none" stroke-linecap="round"/>
        </g>
      </svg>
    `,
    karine: `
      <svg viewBox="0 0 140 140" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <rect width="140" height="140" fill="#267871" rx="8"/>
        <!-- Animated Girl with purple flowers -->
        <g transform="translate(15, 10)">
          <!-- Hair background -->
          <circle cx="55" cy="52" r="38" fill="#2d1d36"/>
          <!-- Shoulders / Top -->
          <path d="M18 105 C25 80 85 80 92 105 Z" fill="#d53f8c"/>
          <path d="M38 88 L55 105 L72 88 Z" fill="#fed7e2"/>
          <!-- Neck & Face -->
          <rect x="48" y="68" width="14" height="16" fill="#fbd38d"/>
          <ellipse cx="55" cy="54" rx="25" ry="24" fill="#feebc8"/>
          <!-- Eyes -->
          <ellipse cx="44" cy="53" rx="5.5" ry="7" fill="#44337a"/>
          <ellipse cx="66" cy="53" rx="5.5" ry="7" fill="#44337a"/>
          <circle cx="42" cy="51" r="2" fill="#fff"/>
          <circle cx="64" cy="51" r="2" fill="#fff"/>
          <!-- Smile -->
          <path d="M48 64 Q55 70 62 64" stroke="#e53e3e" stroke-width="2.5" fill="none" stroke-linecap="round"/>
          <!-- Blush -->
          <circle cx="37" cy="60" r="4" fill="#feb2b2" opacity="0.6"/>
          <circle cx="73" cy="60" r="4" fill="#feb2b2" opacity="0.6"/>
          <!-- Hair bangs -->
          <path d="M30 46 C40 32 70 32 80 46 C75 42 62 42 55 46 C48 42 35 42 30 46 Z" fill="#3b2447"/>
          <!-- Purple hair flower accessory -->
          <g transform="translate(74, 30)">
            <circle cx="0" cy="0" r="6" fill="#b794f4"/>
            <circle cx="-6" cy="0" r="4.5" fill="#9f7aea"/>
            <circle cx="6" cy="0" r="4.5" fill="#9f7aea"/>
            <circle cx="0" cy="-6" r="4.5" fill="#9f7aea"/>
            <circle cx="0" cy="6" r="4.5" fill="#9f7aea"/>
            <circle cx="0" cy="0" r="3" fill="#fefcbf"/>
          </g>
        </g>
      </svg>
    `,
    timeo: `
      <svg viewBox="0 0 140 140" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <rect width="140" height="140" fill="#1a1c23" rx="8"/>
        <!-- Stylized scratch / splash monster character -->
        <g transform="translate(20, 15)">
          <!-- Splatter circle face -->
          <circle cx="50" cy="50" r="42" fill="#2d3748" opacity="0.4"/>
          <!-- Paint splashes -->
          <path d="M12 25 L30 38 L15 55 L28 65 L8 80 L35 78 L50 95 L65 78 L92 80 L72 65 L85 55 L70 38 L88 25 L65 30 L50 5 L35 30 Z" fill="#e2e8f0" opacity="0.88"/>
          <!-- Inner face dark -->
          <circle cx="50" cy="52" r="28" fill="#171923"/>
          <!-- Big funny eyes -->
          <circle cx="40" cy="46" r="8" fill="#ffffff"/>
          <circle cx="42" cy="46" r="4" fill="#000000"/>
          <circle cx="43" cy="44" r="1.5" fill="#ffffff"/>
          <circle cx="60" cy="46" r="8" fill="#ffffff"/>
          <circle cx="58" cy="46" r="4" fill="#000000"/>
          <circle cx="59" cy="44" r="1.5" fill="#ffffff"/>
          <!-- Monster goofy teeth grin -->
          <path d="M36 60 Q50 74 64 60 Z" fill="#edf2f7"/>
          <path d="M36 60 L64 60" stroke="#171923" stroke-width="2"/>
          <line x1="43" y1="60" x2="43" y2="66" stroke="#171923" stroke-width="2"/>
          <line x1="50" y1="60" x2="50" y2="67" stroke="#171923" stroke-width="2"/>
          <line x1="57" y1="60" x2="57" y2="66" stroke="#171923" stroke-width="2"/>
        </g>
      </svg>
    `
  };

  const DEFAULT_PROFILES = [
    { id: 'djey', name: 'Djey', avatar: 'djey' },
    { id: 'karine', name: 'Karine', avatar: 'karine' },
    { id: 'lounis', name: 'Lounis', avatar: 'lounis' },
    { id: 'timeo', name: 'Timéo', avatar: 'timeo' }
  ];

  function getAvatarSvg(avatarKey, initial = 'P') {
    if (avatarKey && AVATAR_SVGS[avatarKey.toLowerCase()]) {
      return AVATAR_SVGS[avatarKey.toLowerCase()];
    }
    const colors = [
      ['#e50914', '#b81d24'],
      ['#0080ff', '#0040aa'],
      ['#2ecc71', '#27ae60'],
      ['#9b59b6', '#8e44ad'],
      ['#e67e22', '#d35400'],
      ['#1abc9c', '#16a085']
    ];
    const idx = Math.abs(initial.charCodeAt(0) || 0) % colors.length;
    const [c1, c2] = colors[idx];
    return `
      <svg viewBox="0 0 140 140" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad_${initial}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="${c1}"/>
            <stop offset="100%" stop-color="${c2}"/>
          </linearGradient>
        </defs>
        <rect width="140" height="140" fill="url(#grad_${initial})" rx="8"/>
        <text x="70" y="88" font-size="54" font-weight="700" fill="#ffffff" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif">${initial.toUpperCase()}</text>
      </svg>
    `;
  }

  function getProfiles() {
    try {
      const stored = localStorage.getItem('plezy.web.profiles');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map(p => ({
            id: p.id || p.user || String(p.name || '').toLowerCase().replace(/\s+/g, '-'),
            name: p.name || 'Profil',
            avatar: p.avatar || (DEFAULT_PROFILES.find(d => d.name.toLowerCase() === (p.name || '').toLowerCase())?.avatar) || 'lounis',
            server: p.server,
            user: p.user || p.id,
            token: p.token
          }));
        }
      }
    } catch {}
    // Seed with the 4 household profiles from user's Netflix screenshot
    saveProfiles(DEFAULT_PROFILES);
    return DEFAULT_PROFILES;
  }

  function saveProfiles(profiles) {
    try {
      localStorage.setItem('plezy.web.profiles', JSON.stringify(profiles));
    } catch {}
  }

  function getActiveProfile() {
    try {
      const activeId = localStorage.getItem('plezy.web.activeProfile');
      const list = getProfiles();
      return list.find(p => p.id === activeId || p.user === activeId || p.name === activeId) || list[0];
    } catch {
      return DEFAULT_PROFILES[0];
    }
  }

  function setActiveProfile(profile) {
    if (!profile) return;
    try {
      localStorage.setItem('plezy.web.activeProfile', profile.id || profile.user || profile.name);
    } catch {}
  }

  window.PlezyProfiles = {
    AVATAR_SVGS,
    DEFAULT_PROFILES,
    getAvatarSvg,
    getProfiles,
    saveProfiles,
    getActiveProfile,
    setActiveProfile
  };
})();
