Bookmarks & ToDo-List
=====================

Homepage implementation to manage favorite URLs and bookmarks in a start-page
like fashion. Each item can also be associated with a checkbox, so that this
can also be used as a ToDo list.
The page can be set as home page in the browser's settings and as the Tab
start page via an add-on like [New Tab
Override](https://addons.mozilla.org/en-US/firefox/addon/new-tab-override/).

The favorites.html page uses a textual configuration to specify the URLs.
See [help.html](help.html) for more details and a definition of the syntax for
the configuration.

The page favorites.html can be accessed and used directly (i.e. hosted by
GitHub) by
<https://html-preview.github.io/?url=https://github.com/anne-gert/favorite-links/master/favorites.html>.
This opens the links page with default contents that contains more
documentation.

It is also possible to supply one's own configuration with the links= URL
argument.  The value may an absolute or relative URL.  This can also be used
with a direct link to GitHub:
<https://html-preview.github.io/?url=https://github.com/anne-gert/favorite-links/master/favorites.html&links=example-links.txt>.

This contents can be edited from the page (via the Gears icon) and stored in
the browser's LocalStorage.

Further Ideas
-------------

* Use a PUT or POST URL to store the links contents online.
    - Where should this be defined? On the URL?
    - Should we use credentials or maybe a GUID in the path?
    - Can this be done with NextCloud?

