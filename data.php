<?php

# Expected permissions of the TokenFile.
$TokenFileAllowedPermissions = 0640;

# Path to the file with configuration settings overrides.
$ConfigFile = "config.php";


#############################################################################
### Configuration values

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

### End of configuration values
#############################################################################


# We need to do a number of checks. In order to give as little information as
# possible, use only a few different return codes until the uses has the
# credentials correct. Then we can cooperate.

# When debugging, the additional headers are used for diagnostics information.
# This should not be enabled in production.
function SetDebugHeader($msg)
{
	global $Debug;
	if ($Debug)
	{
		header("X-Debug: $msg", false);
	}
}

# If $path is relative, return it, prefixed with this script's directory.
# If $path is already absolute, return it unchanged.
function scriptRelAbs($path)
{
	if (substr($path, 0, 1) == "/")
	{
		# Is already absolute path
		return $path;
	}

	$scriptPath = dirname($_SERVER['SCRIPT_FILENAME']);
	if ($path == "" || $path == ".")
	{
		# Nothing to append
		return $scriptPath;
	}

	return $scriptPath . "/" . $path;
}

# Check file permissions (should be 0400)
$ConfigFile = scriptRelAbs($ConfigFile);
if (is_file($ConfigFile))
{
	# Config file exists, read it
	#error_log("Read ConfigFile ('$ConfigFile')");
	include($ConfigFile);
}
else
{
	#error_log("ConfigFile ('$ConfigFile') does not exist");
}

# Set the CORS headers
if ($AllowedOrigins == "*")
{
	header("Access-Control-Allow-Origin: *");
}
else
{
	$reqOrigin = strtolower($_SERVER['HTTP_ORIGIN']);
	if (($AllowedOrigins == "any" && $reqOrigin != "") ||  # accept any
		(is_array($AllowedOrigins) && in_array($reqOrigin, $AllowedOrigins)))  # accept if in the list
	{
		header("Access-Control-Allow-Origin: $reqOrigin");
	}
}
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: x-name, x-token, if-match");

# For logging, get the remote IP address
$sender = $_SERVER['REMOTE_ADDR'];

# Check the data root
$DataRoot = scriptRelAbs($DataRoot);
if (!is_dir($DataRoot))
{
	# Not possible to derive path
	http_response_code(500);  # Internal Server Error
	SetDebugHeader("DataRoot does not exist: $DataRoot");
	return;
}
#error_log("DEBUG: \$DataRoot='$DataRoot'");

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

# Find headers: x-name, x-token, if-match
$token = null; $filename = null; $prevETag = null;
foreach (getallheaders() as $n => $v)
{
	$n = strtolower($n);
	if ($n == "x-token")
		$token = $v;
	elseif ($n == "x-name")
		$filename = $v;
	elseif ($n == "if-match")
		$prevETag = $v;
}

# Check input for reading
if ($doRead)
{
	# Check if the required headers are present.
	if ($filename == null)
	{
		# For clients that are just trying, give them a 'not home'.
		http_response_code(404);  # Not Found
		SetDebugHeader("Filename missing");
		return;
	}
	if ($token == null)
	{
		$token = "";
		SetDebugHeader("Token not used");
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
		SetDebugHeader("Filename missing");
		return;
	}
	if ($token == null || $token == "")
	{
		http_response_code(404);  # Not Found
		SetDebugHeader("Token missing");
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
$filepath = "$DataRoot/$filename";
$file_exists = is_file($filepath);

# Select a hash algorithm
$algo = null;
foreach (hash_algos() as $a)
	if (preg_match('/^sha/i', $a))
	{
		$algo = $a;
		break;
	}

# Calculate a unique tag for the data.
function calcETag($data)
{
	global $algo;

	# Normalize the data
	$data = preg_replace('/\r?\n\r?/', '\n', $data);  # crlf -> lf
	$data = preg_replace('/^\s+|\s+$/', '', $data);  # leading+trailing whitespace

	if (isset($algo))
	{
		# Calculate the hash
		$hash = hash($algo, $data, true);
		return preg_replace('/=+$/', '', base64_encode($hash));
	}
	else
	{
		# There is no hash algorithm, calculate a simple sum
		$len = strlen($data);
		$sum = 0;
		foreach (str_split($data) as $char)
			$sum += ord($char);
		return "$len-$sum";
	}
}

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

	# Read file
	$data = file_get_contents($filepath);
	if ($data === false)
	{
		if ($LogActions)
		{
			error_log("favlinks: Reading file '$filepath' failed");
		}
		http_response_code(404);  # Not Found
		SetDebugHeader("Could not read file: '$filename'");
		return;
	}

	# Calculate new ETag
	$eTag = calcETag($data);
	header("ETag: $eTag");

	# Output data
	header("Content-Type: text/plain; charset=UTF-8");
	echo $data;

	if ($LogActions)
	{
		error_log("favlinks: Reading file '$filepath' succeeded");
	}
}

# Write the file
if ($doWrite)
{
	# Check write access
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

	# Get previous contents and check against $prevETag
	if (!isset($prevETag))
	{
		# There is no If-Match, allow all
		SetDebugHeader("Test If-Match: Not present -> Always allowed");
	}
	else if ($prevETag == "*")
	{
		# Special value that always matches
		SetDebugHeader("Test If-Match: '*' -> Always allowed");
	}
	else
	{
		$prevData = file_get_contents($filepath);
		$isEmpty = ($prevData !== false && preg_match('/^\s*$/', $prevData));
		if ($prevETag == "*Empty")
		{
			# Special value that matches if the file does not exist or is empty
			if (!$isEmpty)
			{
				# File exists and is not empty
				http_response_code(412);  # Precondition Failed
				SetDebugHeader("Test If-Match: '$prefETag' <=> File not empty: '$filename' -> no match");
				return;
			}
			else
			{
				SetDebugHeader("Test If-Match: '$prefETag' <=> File empty: '$filename' -> match");
			}
		}
		else
		{
			# A normal value, check that it matches
			if ($prevData === false)
			{
				# Could not read the file, so could not check if $prevTag was correct
				http_response_code(412);  # Precondition Failed
				SetDebugHeader("Test If-Match: '$prefETag' <=> Could not read file: '$filename' -> not allowed");
				return;
			}

			# Calculate ETag and check if it matches the expected value
			if ($isEmpty)
			{
				# If file is empty, there is no danger of overwriting
				SetDebugHeader("Test If-Match: '$prefETag' <=> File empty: '$filename' -> allowed");
			}
			else
			{
				# File is not empty, check contents
				$eTag = calcETag($prevData);
				if ($eTag !== $prevETag)
				{
					http_response_code(412);  # Precondition Failed
					SetDebugHeader("Test If-Match: '$prevETag' <=> current data '$eTag' -> no match");
					header("ETag: $eTag");
					return;
				}
				else
				{
					SetDebugHeader("Test If-Match: '$prevETag' <=> current data '$eTag' -> match");
				}
			}
		}
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

	# Calculate new ETag
	$eTag = calcETag($body);
	header("ETag: $eTag");

	if ($LogActions)
	{
		error_log("favlinks: Writing file '$filepath' succeeded");
	}
}

