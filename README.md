Favorite-Links
==============

Generic project to manage favorite URLs in a start-page like fashion.

The favorites.html uses a text file to specify the URLs.
See [syntax.html](syntax.html) for a definition of the syntax for links.

The page favorites.html can be accessed directly (i.e. hosted by GitHub) by
<https://html-preview.github.io/?url=https://github.com/anne-gert/favorite-links/master/favorites.html>.
This opens the links page with default contents.

It is also possible to supply one's own contents with the links= URL argument.
The value may be literal contents or an absolute or relative URL, prefixed
with 'url:'. This can also be used with a direct link to GitHub:
<https://html-preview.github.io/?url=https://github.com/anne-gert/favorite-links/master/favorites.html&links=url:example-links.txt>.

This contents can be edited from the page (via the Gears icon) and stored in
the browser's LocalStorage.

If the contents in the LocalStorage should be overriden, the links-override=
URL argument can be used, similar how links= is used.

