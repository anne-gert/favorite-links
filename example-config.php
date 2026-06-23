<?php

# Path to the file with access tokens.
$TokenFile = "/etc/favlinks/tokens";

# Directory where the data files should be stored.
# If this is a relative path, it is appended to the script's directory.
$DataRoot = "/var/favlinks";

# Specify the allowed request origins for CORS.
# Valid values are:
# - "*": Use 'Access-Control-Allow-Origin: *'
# - "any": Use 'Access-Control-Allow-Origin: <request-origin>'
# - array: Use 'Access-Control-Allow-Origin: <request-origin>' if
#     <request-domain> is in the array.
$AllowedOrigins = "any";

# Maximum size in bytes for the uploaded data files.
$MaxSize = 512 * 1024;

# Log the requests to the server log if true.
$LogActions = true;

# Set debug mode, which also adds an X-Debug header with detail information.
$Debug = false;

