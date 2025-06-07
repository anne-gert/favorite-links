// For the syntax description, see favorites.html.

var Links = `
!title Example Favorites
General
    Search
        DuckDuckGo https://duckduckgo.com
        Google Maps icon=alt https://maps.google.com
        Wikipedia https://www.wikipedia.org
        YouTube https://www.youtube.com
    Source
        GitHub favorite-links https://github.com/anne-gert/favorite-links
        & Direct icon=none https://html-preview.github.io/?url=https://github.com/anne-gert/favorite-links/master/favorites.html
Other
    News
        nu.nl https://nu.nl
    Socials
        Facebook https://www.facebook.com
            Instagram https://www.instagram.com/
            WhatsApp Web https://web.whatsapp.com/
        ---
        LinkedIn https://www.linkedin.com/
    Firefox
        Settings icon=firefox about:preferences target=manual
            All Configuration icon=firefox about:config target=manual
        All about:* icon=firefox about:about target=manual

// Icon definitions
!icondef firefox    https://support.mozilla.org

// Search button definitions
//      Identifier | Label  | Tooltip      | Icon
!search Duck       | Search | Duck Duck Go |
!search Google     | Search |              |
!search Wikipedia  |        |              |
!search YouTube    |        |              |
!search GoogleMaps | Maps   | Google Maps  | alt
`;

// vim: foldmethod=marker nowrap shiftwidth=4 expandtab smartindent

