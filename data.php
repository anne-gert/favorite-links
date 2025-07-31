<?php

$TokenFile_Read = "/etc/favlinks/read-token";
$TokenFile_Save = "/etc/favlinks/save-token";
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
$tokenFile = null;
if ($method == "GET")
{
	$doRead = true;
	$tokenFile = $TokenFile_Read;
}
elseif ($method == "POST")
{
	$doWrite = true;
	$tokenFile = $TokenFile_Save;
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

# Read expectedToken from file
$expectedToken = file_get_contents($tokenFile);
if ($expectedToken === false)
{
	# Token file does not exist or not readable
	http_response_code(500);  # Internal Server Error
	return;
}
# Remove leading and trailing whitespace
$expectedToken = preg_replace('/^\s+/', '', preg_replace('/\s+$/', '', $expectedToken));
#error_log("DEBUG: \$expectedToken='$expectedToken'");

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

	# Token is mandatory
	if (strlen($expectedToken) < 4)
	{
		# Token is unreasobly short, reject it
		http_response_code(500);  # Internal Server Error
		return;
	}
}

# Verify $token
if ($token != $expectedToken)
{
	http_response_code(401);  # Unauthorized
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

