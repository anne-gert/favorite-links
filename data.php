<?php

$TokenFile = "/etc/favlinks/tokens";
$MaxSize = 512 * 1024;

# Set the CORS headers
header("Access-Control-Allow-Origin:  *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: x-name, x-token");

# Check the working directory
$path = dirname($_SERVER['SCRIPT_FILENAME']);
#error_log("DEBUG: \$path='$path'");
if (!is_dir($path))
{
	# Not possible to derive path
	http_response_code(507);  # Insufficient Storage
	return;
}

# Check the requested method and set some variables
$method = strtoupper($_SERVER['REQUEST_METHOD']);
#error_log("DEBUG: \$method='$method'");
$doRead = false; $doWrite = false;
$access = "-";
if ($method == "GET")
{
	$doRead = true;
	$access = "r";
}
elseif ($method == "POST")
{
	$doWrite = true;
	$access = "w";
}
elseif ($method == "OPTIONS")
{
	# This may be a CORS preflight, return 200 Ok
	return;  # Ok
}
else
{
	http_response_code(405);  # Method Not Allowed
	return;
}

# Read valid tokens from file
$lines = file($TokenFile);
if ($lines === false)
{
	# Token file does not exist or not readable
	error_log("Token file $TokenFile does not exist");
	http_response_code(500);  # Internal Server Error
	return;
}
$tokens = [];
foreach ($lines as $line)
{
	if (preg_match('/^\s*(?:\/\/|#|;|$)/', $line)) continue;  # empty line or comment
	if (preg_match('/^\s*([rw]+)(?:\s+(.*?))?\s*$/i', $line, $m))
	{
		# 'access token' line
		#error_log('DEBUG: token-line=' . var_export($m, true));
		$tok = (count($m) >= 3) ? $m[2] : "";
		$tokens[$tok] = $m[1];
	}
	else
	{
		# Unrecognized line
		error_log("Error in tokens: " . $line);
		http_response_code(500);  # Internal Server Error
		return;
	}
}
#error_log("DEBUG: \$tokens=" . var_export($tokens, true));

# Find headers: x-name, x-token
$token = null; $filename = null;
foreach (getallheaders() as $n => $v)
{
	$n = strtolower($n);
	if ($n == "x-token")
		$token = $v;
	elseif ($n == "x-name")
		$filename = $v;
}

# Check input for reading
if ($doRead)
{
	# Check if the required headers are present.
	if ($filename == null)
	{
		# For clients that are just trying, give them a 'not home'.
		http_response_code(404);  # Not Found
		return;
	}
}

# Check input for reading
if ($doWrite)
{
	# Check if the required headers are present.
	if ($token == null || $filename == null)
	{
		# For clients that are just trying, give them a 'not home'.
		http_response_code(404);  # Not Found
		return;
	}
}

# Verify $token
if (!array_key_exists($token, $tokens))
{
	http_response_code(401);  # Unauthorized
	return;
}
$allowed = strtolower($tokens[$token]);
if (stripos($allowed, $access) === false)
{
	http_response_code(401);  # Unauthorized
	return;
}
if ($doWrite && strlen($token) < 4)
{
	# Token is unreasobly short, reject it
	http_response_code(500);  # Internal Server Error
	return;
}

# Sanitize $filename
# If there is a path in it, remove that.
$filename = preg_replace('/.*[\\\\\\/]/', '', $filename); # remove directories
$filename = preg_replace('/[^-+_,.a-zA-Z0-9]/', '', $filename); # remove characters we don't want
if (!preg_match('/\.txt/i', $filename))
{
	# File does not match a .txt
	http_response_code(400);  # Bad Request
	return;
}

# Read the file and return the contents
if ($doRead)
{
	header("Content-Type: text/plain; charset=UTF-8");
	$result = readfile("$path/$filename");
	if ($result === false)
	{
		http_response_code(404);  # Not Found
		return;
	}
}

# Write the file
if ($doWrite)
{
	# Get body and verify its size
	$body = file_get_contents('php://input');
	$size = strlen($body);
	if ($size > $MaxSize)
	{
		# Content is too large
		http_response_code(413);  # Content Too Large
		return;
	}

	# Write the data
	# NOTE: The file must allow the web-user write access.
	$result = file_put_contents("$path/$filename", $body);
	if ($result === false)
	{
		# Was not able to write
		http_response_code(403);  # Forbidden
		return;
	}
}

