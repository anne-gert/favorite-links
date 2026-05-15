<?php

$TokenFile = "/etc/favlinks/tokens";
$MaxSize = 512 * 1024;

$TokenFileAllowedPermissions = 0400;
$LogActions = true;

# Set the CORS headers
header("Access-Control-Allow-Origin:  *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: x-name, x-token");

# We need to do a number of checks. In order to give as little information as
# possible, use only a few different return codes until the uses has the
# credentials correct. Then we can cooperate.

# When debugging, the additional headers are used for diagnostics information.
# This should not be enabled in production.
$Debug = false;
function SetDebugHeader($msg)
{
	global $Debug;
	if ($Debug)
	{
		header("X-Debug: $msg", false);
	}
}

# For logging, get the remote IP address
$sender = $_SERVER['REMOTE_ADDR'];

# Check the working directory
$path = dirname($_SERVER['SCRIPT_FILENAME']);
#error_log("DEBUG: \$path='$path'");
if (!is_dir($path))
{
	# Not possible to derive path
	http_response_code(500);  # Internal Server Error
	SetDebugHeader("Cannot determine current path");
	return;
}

# Check the requested method and set some variables
$method = strtoupper($_SERVER['REQUEST_METHOD']);
#error_log("DEBUG: \$method='$method'");
$doRead = false; $doWrite = false;
if ($method == "GET")
{
	$doRead = true;
}
elseif ($method == "POST")
{
	$doWrite = true;
}
elseif ($method == "OPTIONS")
{
	# This may be a CORS preflight, return 200 Ok
	return;  # Ok
}
else
{
	http_response_code(405);  # Method Not Allowed
	SetDebugHeader("Method not allowed: '$method'");
	return;
}

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
		SetDebugHeader("Filename not set");
		return;
	}
	if ($token == null)
	{
		$token = "";
		SetDebugHeader("Token set to empty");
	}
}

# Check input for reading
if ($doWrite)
{
	# Check if the required headers are present.
	# For clients that are just trying, give them a 'not home'.
	if ($filename == null)
	{
		http_response_code(404);  # Not Found
		SetDebugHeader("Filename not set");
		return;
	}
	if ($token == null || $token == "")
	{
		http_response_code(404);  # Not Found
		SetDebugHeader("Token not set");
		return;
	}
}

# Check file permissions (should be 0400)
$perms = fileperms($TokenFile) & 0777;
if ($perms & ~$TokenFileAllowedPermissions)
{
	# Token file has permissions outside the allowable, defensive permissions.
	http_response_code(500);  # Internal Server Error
	error_log("TokenFile ('$TokenFile') has insecure permissions: " . decoct($perms));
	SetDebugHeader("TokenFile has insecure permissions");
	return;
}

# Read granted access from configuration
$lines = file($TokenFile);
if ($lines === false)
{
	# Token file does not exist or not readable
	http_response_code(500);  # Internal Server Error
	error_log("Could not read TokenFile: '$TokenFile'");
	SetDebugHeader("Could not read TokenFile");
	return;
}
$access = "";
foreach ($lines as $line)
{
	if (preg_match('/^\s*(?:\/\/|#|;|$)/', $line)) continue;  # empty line or comment
	# Format of a line: <rwc>+ [token]
	# - Multiple access permissions are allowed per token.
	# - A token may be empty or missing. In this case, the user's token
	#   must also be empty.
	if (preg_match('/^\s*([rwc]+)(?:\s+(.*?))?\s*$/i', $line, $m))
	{
		# 'access token' line
		#error_log('DEBUG: token-line=' . var_export($m, true));
		$tok = (count($m) >= 3) ? $m[2] : "";
		# Use hash_equals($known_string, $user_string) for a constant-time
		# secure string comparison.
		if (hash_equals($tok, $token))
		{
			$access .= $m[1];  # add this access to overall access
		}
	}
	else
	{
		# Unrecognized line
		http_response_code(500);  # Internal Server Error
		error_log("Error in TokenFile: '$line'");
		SetDebugHeader("Error in TokenFile");
		return;
	}
}

# Log if token guessing is suspected
if ($LogActions && $access === "")
{
	error_log("favlinks: Incorrect token received from '$sender'");
}

# Sanitize $filename
# If there is a path in it, reject it.
if (preg_match('/[\\\\\\/]/', $filename))
{
	http_response_code(404);  # Not Found
	SetDebugHeader("Filename contains directory: '$filename'");
	return;
}
$filename = preg_replace('/[^-+_,.a-zA-Z0-9]/', '', $filename); # remove characters we don't want
if (!preg_match('/\.txt$/', strtolower($filename)))
{
	http_response_code(404);  # Not Found
	SetDebugHeader("Filename is not .txt: '$filename'");
	return;
}

# Check if file exists
$filepath = "$path/$filename";
$file_exists = is_file($filepath);

# Read the file and return the contents
if ($doRead)
{
	# Check read access
	if (stripos($access, "r") === false)
	{
		http_response_code(401);  # Unauthorized
		SetDebugHeader("Token not allowed to read");
		return;
	}

	# Check if file exists
	if (!$file_exists)
	{
		http_response_code(404);  # Not Found
		SetDebugHeader("File does not exist: '$filename'");
		return;
	}

	# Read and return file
	header("Content-Type: text/plain; charset=UTF-8");
	$result = readfile($filepath);
	if ($result === false)
	{
		if ($LogActions)
		{
			error_log("favlinks: Reading file '$filepath' failed");
		}
		http_response_code(404);  # Not Found
		SetDebugHeader("Could not read file: '$filename'");
		return;
	}
	else
	{
		if ($LogActions)
		{
			error_log("favlinks: Reading file '$filepath' succeeded");
		}
	}
}

# Write the file
if ($doWrite)
{
	# Check read access
	if ($file_exists)
	{
		if (stripos($access, "w") === false)
		{
			http_response_code(401);  # Unauthorized
			SetDebugHeader("Token not allowed to write");
			return;
		}
		$operation = "write";
	}
	else
	{
		if (stripos($access, "c") === false)
		{
			http_response_code(401);  # Unauthorized
			SetDebugHeader("Token not allowed to create file");
			return;
		}
		$operation = "create";
	}

	# Get body and verify its size
	$body = file_get_contents('php://input');
	$size = strlen($body);
	if ($size > $MaxSize)
	{
		# Content is too large
		http_response_code(413);  # Content Too Large
		SetDebugHeader("Body size too large: $size bytes");
		return;
	}

	# Write the data
	# NOTE: The file must allow the web-user write/create access.
	$result = file_put_contents($filepath, $body);
	if ($result === false)
	{
		# Was not able to write
		if ($LogActions)
		{
			error_log("favlinks: Writing file '$filepath' failed");
		}
		http_response_code(403);  # Forbidden
		SetDebugHeader("Could not $operation file: '$filename'");
		return;
	}

	# Verify the write
	if (filesize($filepath) !== $size)
	{
		if ($LogActions)
		{
			error_log("favlinks: Writing file '$filepath' failed");
		}
		http_response_code(500);  # Internal Server Error
		SetDebugHeader("Could not $operation file: Write verification failed: size mismatch");
		return;
	}

	if ($LogActions)
	{
		error_log("favlinks: Writing file '$filepath' succeeded");
	}
}

