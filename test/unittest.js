let LogTest;

// If this is true, the test will stop when the first error is encountered.
let StopOnFirstError = false;
// If this is set, only tests which names satisfy this regex will be executed.
let ExecutedTestsRegexp = null;
//let ExecutedTestsRegexp = /^3\./;

// Mock implementations {{{

// Create an object to register and wait for Promisses.
function CreateReady() {
	let _promise = null;
	let _pending = false;
	let _count = 0;

	function start() {
		if (_count <= 0) {
			// Create a new Promise
			if (!_promise) {
				LogTest.debug('Start new Promise');
				_promise = new PendingPromise();
			} else if (!_pending) {
				LogTest.debug('Start new Promise');
				_promise = new PendingPromise();
			} else {
				LogTest.debug('Start, Promise already created');
			}
			_pending = true;
			_count = 1;
		} else {
			// Add nested start-stop pair
			++_count;
			LogTest.debug('Start count ' + _count);
		}
	}

	function stop() {
		if (_count <= 0) {
			// No Promise pending
			LogTest.error('Stop, but nothing started');
			console.trace();
		} else if (_count == 1) {
			// This is the last
			LogTest.debug('Stop last, resolve Promise');
			_promise.resolve(true);
			_pending = false;
			_count = 0;
		} else {
			LogTest.debug('Stop count ' + _count);
			--_count;
		}
	}

	async function wait() {
		if (!_promise) {
			// There is no Promise, create a new one and wait on it
			_promise = new PendingPromise();
			_pending = true;
			LogTest.debug('Wait for new Promise');
			await _promise;
			LogTest.debug('Finished waiting for new Promise');
		} else if (!_pending) {
			// There is a Promise, but it has already been resolved
			LogTest.debug('Existing Promise already resolved');
		} else {
			// There is a pending Promise
			LogTest.debug('Wait for existing Promise');
			await _promise;
			LogTest.debug('Finished waiting for existing Promise');
		}
	}

	async function wait_pending() {
		if (!_promise) {
			// There is no Promise, there's nothing to wait for
			LogTest.debug('Promise not started, skip waiting');
		} else {
			// Do the normal wait
			await wait();
		}
	}

	return {
		start : start,
		stop : stop,
		wait : wait,
		wait_pending : wait_pending,
	};
}

// Create an object to emulate LocalStorage that can be cleared.
function CreateStorage() {
	let _data = {};
	let _onreset = [];

	function getItem(key) {
		let value = _data[key];
		LogTest.log('Get LocalStorage[' + key + ']: ' + renderValue(value));
		return value;
	}

	function setItem(key, value) {
		LogTest.log('Set LocalStorage[' + key + '] = ' + renderValue(value));
		return _data[key] = value;
	}

	function removeItem(key) {
		LogTest.log('Remove LocalStorage[' + key + ']');
		delete _data[key];
	}

	function clear() {
		LogTest.log('Clear all keys in LocalStorage');
		_data = {};
		reset();
	}

	function reset() {
		for (let i = 0; i < _onreset.length; ++i) _onreset[i]();
	}

	function onreset(callback) {
		_onreset.push(callback);
	}

	function log() {
		LogTest.debug('Contents of LocalStorage', _data);
	}

	let storage = {
		getItem : getItem,
		setItem : setItem,
		removeItem : removeItem,
		clear : clear,
		reset : reset,
		onreset : onreset,
		log : log,
	};
	return storage;
}

// Create an object to emulate a QueryString can be changed.
function CreateQueryString(queryString) {
	let _queryString = queryString;
	let _onreset = [];

	function get() {
		return _queryString;
	}

	function set(value) {
		_queryString = value;
		LogTest.log('Set QueryString to \'' + _queryString + '\'');
		reset();
	}

	function clear() {
		change('');
	}

	function reset() {
		for (let i = 0; i < _onreset.length; ++i) _onreset[i]();
	}

	function onreset(callback) {
		_onreset.push(callback);
	}

	let storage = {
		get : get,
		set : set,
		clear : clear,
		reset : reset,
		onreset : onreset,
	};
	return storage;
}

// Create an object that emulates the content of multiple files that are updated
// with GET and POST.
function CreateRemoteFile(timeout = 100) {
	let _entries = {};
	let _prepareNextResponse = null;

	function clear() {
		LogTest.log('Clear all RemoteFile entries');
		_entries = {};
		_prepareNextResponse = null;
	}

	// Get the remote file name from the url/headers
	function getName(url, headers) {
		//LogTest.devlog('RemoteFile: URL=' + url + ', Headers=', headers);
		// Check if 'x-name' occurs in headers
		if (headers) {
			for (let i = 0; i < headers.length; ++i) {
				if (headers[i][0] == 'x-name') {
					return headers[i][1];
				}
			}
		}
		// Check if url contains a basename
		if (url) {
			url = url.replace(/[?#].*/, '');  //remove querystring and fragment
			let name = url.replace(/.*\//, '');  //remove all but the last name
			if (name != '') {
				return name;
			}
		}
		// Return the default
		return 'links.txt';
	}

	// Get the response entry for the specified name.
	// Creates a new entry if it does not exist yet.
	function getEntry(name) {
		let entry = _entries[name];
		if (entry == null) {
			_entries[name] = entry = {
				getStatus: 200,
				postStatus: 200,
				content: '',
			};
		}
		return entry;
	}

	// Returns Promise that simulates a GET.
	async function getGetResponse(url, headers, body) {
		let name = getName(url, headers);
		let entry = getEntry(name);
		// Wait a bit
		await sleep(timeout);
		// Assemble response
		let rsp = {
			status : entry.getStatus,
			text   : entry.content,
		};
		// Prepare next response if configured
		if (_prepareNextResponse) _prepareNextResponse('GET');
		// Return response
		LogTest.debug('GET content for \'' + name + '\': status ' + rsp.status + ' (' + (rsp.text?.length ?? 0) + ' chars)');
		return rsp;
	}

	// Returns Promise that simulates a POST.
	async function getPostResponse(url, headers, body) {
		let name = getName(url, headers);
		let entry = getEntry(name);
		// Wait a bit
		await sleep(timeout);
		// Update emulated file
		if (entry.postStatus == 200) {
			if (entry.getStatus == 404) entry.getStatus = 200;
			entry.content = body;
		}
		// Assemble response
		let rsp = {
			status : entry.postStatus,
			text   : '',
		};
		// Prepare next response if configured
		if (_prepareNextResponse) _prepareNextResponse('POST');
		// Return response
		LogTest.debug('POST content for \'' + name + '\': status ' + rsp.status + ' (' + (body?.length ?? 0) + ' chars)');
		return rsp;
	}

	// Set the contents from the value for the next request.
	// The value is interpreted as follows:
	// - 'NOT_EXIST': Emulate file that does not exist yet, but will after
	//   upload
	// - 'DEFAULT_LINKS': Value of DefaultLinks
	// - numeric: Return this status, sets content to empty
	// - numeric/numeric: Return separate status for GET/POST.
	// - any other string: Contents of the emulated file
	// If next is set, it is called at the next request with 'GET' or
	// 'POST' as argument. It can then prepare a new response if needed.
	// If name is set, use that filename, otherwise use UrlResolver.getLoadName().
	function setContent(value, name = null, next = null) {
		if (name == null) name = UrlResolver.getLoadName();
		if (value == null) {
			// Do not change content
			LogTest.debug('No change in content for \'' + name + '\'');
			return;
		}
		let entry = getEntry(name);
		let m;
		if (value == 'NOT_EXIST') {
			entry.getStatus = 404;
			entry.postStatus = 200;
			entry.content = '';
		} else if (value == 'DEFAULT_LINKS') {
			entry.getStatus = 200;
			entry.postStatus = 200;
			entry.content = DefaultLinks;
		} else if (value.match(/^\d+$/)) {
			entry.getStatus = value.valueOf();
			entry.postStatus = value.valueOf();
			entry.content = '';
		} else if (m = value.match(/^\s*(\d+)(?:\s*\/\s*(\d+))?\s*$/)) {
			entry.getStatus = m[1].valueOf();
			entry.postStatus = ((m.length >= 2) ? m[2] : m[1]).valueOf();
			let canRead = entry.getStatus == 200;
			let canWrite = entry.postStatus == 200;
			if (canRead) {
				entry.content = canWrite ? 'RW_FILE' : 'RO_FILE';
			} else {
				entry.content = '';
			}
		} else {
			entry.getStatus = 200;
			entry.postStatus = 200;
			entry.content = value;
		}
		LogTest.debug('Set content for \'' + name + '\'');
		_prepareNextResponse = next;
	}

	// Get the contents of the specified name.
	// If name is not specified, use UrlResolver.getLoadName().
	function getContent(name = null) {
		if (name == null) name = UrlResolver.getLoadName();
		let entry = getEntry(name);
		LogTest.debug('Get content for \'' + name + '\': ' + (entry.content?.length ?? 0) + ' chars');
		return entry.content;
	}

	let obj = {
		download : {
			response : getGetResponse,
		},
		upload : {
			response : getPostResponse,
		},
		set : setContent,
		content : getContent,
		clear : clear,
	};
	return obj;
}

// Create an object that can update and close the Settings pane.
function CreateSettingsChanger() {
	let _config = null;
	let _options = [];
	let _action = 'cancel';  //'save', 'clear' or 'cancel'

	async function update(configControl, loadOptionEntries, saveOptionEntries, hideFunction) {
		// Wait a bit
		await sleep(300);

		// Change the controls
		let msg = 'ChangeSettings: ' + _action + ' settings for:';
		if (_config != null && configControl != null) {
			configControl.value = _config;
			msg += ' config';
		}
		let j = 0, count = 0;
		for (let i = 0; i < loadOptionEntries.length; ++i) {
			if (j < _options.length) {
				let v = _options[j];
				if (v) {
					loadOptionEntries[i].entry.value = v;
					LogTest.debug(`ChangeSettings: Set loadOptionEntries[${i}] to '${v}'`);
					++count;
				}
			}
			++j;
		}
		for (let i = 0; i < saveOptionEntries.length; ++i) {
			if (j < _options.length) {
				let v = _options[j];
				if (v) {
					saveOptionEntries[i].entry.value = v;
					LogTest.debug(`ChangeSettings: Set saveOptionEntries[${i}] to '${v}'`);
					++count;
				}
			}
			++j;
		}
		msg += ' ' + count + ' options';
		LogTest.log(msg);

		// Wait a bit more
		await sleep(500);

		// Call the hideSettings
		if (_action == 'save') {
			hideFunction(true);
		} else if (_action == 'clear') {
			hideFunction('clear');
		} else if (_action == 'cancel') {
			hideFunction(false);
		} else {
			LogTest.error('Unknown _action in HOOK_ChangeSettings.update(): ' + _action);
		}
	}

	function setConfig(text) {
		LogTest.log('ChangeSettings: setConfig: ', renderValue(text));
		_config = text;
	}

	function setOptions(options) {
		LogTest.log('ChangeSettings: setOptions: ', options);
		_options = options;
	}

	function setAction(action) {
		LogTest.log('ChangeSettings: setAction: ', renderValue(action));
		_action = action;
	}

	let obj = {
		update : update,
		setConfig : setConfig,
		setOptions : setOptions,
		setAction : setAction,
	};
	return obj;
}

// }}}

// Utility functions {{{

function renderValue(value) {
	if (value == null) {
		return '<null>';
	} else if (typeof value == 'string') {
		return '\'' + value.substring(0, 500) + '\' (' + value.length + ' chars)';
	} else {
		return value;
	}
}

// Compare a and b if they were links. This is basically a string-compare, but
// with the following changes:
// - Harmonize line breaks (replace \r\n by single \n)
// - Remove trailing line breaks
// Returns true if equal
function linksEqual(a, b) {
	if (a === undefined && b === undefined) return true;  //both are undefined
	if (a === null && b === null) return true;  //both are null
	if (a == null || b == null) return false;  //only 1 is null or undefined
	// Now both are set, clean them up
	a = a.replaceAll(/\r?\n\r?|\r/g, '\n');
	b = b.replaceAll(/\r?\n\r?|\r/g, '\n');
	a = a.replace(/[\r\n]+$/, '');
	b = b.replace(/[\r\n]+$/, '');
	return a === b;
}

async function sleep(timeout) {
	let promise = new PendingPromise();
	window.setTimeout(() => promise.resolve(true), timeout);
	await promise;
}

// Wait until the eventloop has been processed.
async function wait() {
	// sleep() posts a timer event at the end of the eventloop
	await sleep(0);
}

// Find first item with specified name (for a link) or first line (for text).
function findItemWithTarget(str) {
	if (RenderedItems == null || RenderedItems.length <= 0) return null;

	for (let i = 0; i < RenderedItems.length; ++i) {
		let item = RenderedItems[i];
		if (item.link.type === 'link') {
			if (item.link.name == str) {
				return item;
			}
		} else if (item.link.type === 'text') {
			if (item.link.lines.length > 0 && item.link.lines[0] == str) {
				return item;
			}
		}
	}
	return null;  //no Item found
}

// }}}

// Initialization {{{

// Set up the hooks
HOOK_Init = initTests;
HOOK_Run = doTests;
HOOK_Ready = CreateReady();
HOOK_QueryString = CreateQueryString('?links=test-config');
HOOK_LocalStorage = CreateStorage();
let remoteFile = CreateRemoteFile();
HOOK_Download = remoteFile.download;
HOOK_Upload = remoteFile.upload;
HOOK_ChangeSettings = CreateSettingsChanger();

let CurrTestCtl = null;

function initTests() {
	// Create the special logger
	LogTest = CreateLogger();
	LogTest.defineLevel('error', 0, 'color:#AA0000;background:#FFDDDD');
	LogTest.defineLevel('warn', 0, 'color:#999900;background:#FFFFCC');
	LogTest.defineLevel('important', 1, 'color:#006666;background:#FFFFCC');
	LogTest.defineLevel('log', 2, 'color:black;background:#FFFFCC');
	LogTest.defineLevel('debug', 3, 'color:#666666;background:#FFFFCC');
	LogTest.setLevel();

	// Add subtitle to display current test
	let title = document.getElementById('Title');
	CurrTestCtl = document.createElement('h2');
	title.parentNode.insertBefore(CurrTestCtl, title.nextSibling);

	LogTest.important('Init Tests');
}

// }}}

// Read Tests {{{

let KnownColumns = [
	'name',
	'keepStorage',
	'iniOverrideArg', 'iniLoadArg', 'iniSaveArg',
	'iniLinks', 'iniRemoteFile', 'iniCleanLinks',
	'expLinks', 'expRemoteFile', 'expCleanLinks',
	'expDispLinks', 'expUplDisabled', 'expConflict', 'expStatus',
	'cnfAction', 'cnfLinks', 'cnfLoadOpt1', 'cnfLoadOpt2', 'cnfSaveOpt',
	'dropSource', 'dropWhere', 'dropTarget',
];

async function readTests(url) {
	LogTest.important('Read test cases from ' + url);
	let test_cases = [];
	let rsp = await fetch(url, { cache: 'no-cache' });
	if (rsp == null) {
		LogTest.error('No response');
		return test_cases;
	}
	if (rsp.status != 200) {
		LogTest.error('No data: status ' + rsp.status);
		return test_cases;
	}
	let contents = await rsp.text();
	//LogTest.devlog(contents);
	let records = contents.split(/[\r\n]+/);  //split in lines
	let names = null;
	for (let r = 0; r < records.length; ++r) {
		let record = records[r];
		if (record.match(/^\s*(?:#|;|\/\/|$)/)) {
			// Empty or comment line
			continue;
		}
		let fields = record.split(/\t/);  //split in fields
		// Check appropriate length
		if (fields.length <= 1) {
			// Should have more than 1 field
			LogTest.error('Invalid record: ' + record);
			if (StopOnFirstError) return test_cases;
			continue;
		}
		if (names == null) {
			// Take first line as headings
			names = [];
			let checkNames = [];
			for (let n = 0; n < fields.length; ++n) {
				let tags = getMultiTags(fields[n]);
				if (tags) {
					// Is multi-valued
					let multiName = [];
					for (let t = 0; t < tags.length; ++t) {
						let tag = tags[t];
						let name = getMultiValue(fields[n], tag);
						multiName.push({ tag: tag, name: name });
						checkNames.push(name);
					}
					names.push(multiName);
				} else {
					// Is single valued
					let name = fields[n];
					names.push(name);
					checkNames.push(name);
				}
			}
			LogTest.log('Number of columns: ' + names.length);
			//LogTest.devlog('Column names: ', names);
			for (let n = 0; n < checkNames.length; ++n) {
				let name = checkNames[n];
				if (!KnownColumns.includes(name)) {
					LogTest.error(`Unknown column name: '${name}'`);
					return test_cases;
				}
			}
		} else {
			// Check length of data
			if (fields.length != names.length) {
				LogTest.error('Invalid number of fields: ' + fields.length);
				if (StopOnFirstError) return test_cases;
				continue;
			}
			// Create entry
			let entry = {};
			let addEntry = (name, value) => {
				// Unescape
				value = value.replace(/^("?)(.*)\1$/, '$2');  //remove surrounding double quotes
				value = value.replaceAll(/""/g, '"');  //un-escape double quotes "" -> "
				value = value.replaceAll(/\\"/g, '"');  //un-escape double quotes \" -> "
				value = value.replaceAll(/\\n/g, '\n');  //un-escape linefeed \\n -> \n
				value = value.replaceAll(/\\r/g, '\r');  //un-escape carriage return \\r -> \r
				value = value.replaceAll(/\\t/g, OneIndent);  //replace tabs \\t -> OneIndent
				// Perform '~' shorthand (to avoid many \n\t)
				let m = value.match(/^~(.*)$/s);  //indicates this shorthand syntax
				if (m) {
					value = m[1].split(/~/)  //split lines
						.map(line => line
							// Replace leading '.' with indent
							.replace(/^(\.+)/, m => OneIndent.repeat(m.length))
							// Replace "text" with text block
							.replace(/^(\s*)"(.*)"$/s, (_, s, t) => `${s}!text\n${t}\n${s}!endtext`)
						).join('\n');
				}
				// Check special words (all capitals)
				if (value == 'TRUE') value = true;
				if (value == 'FALSE') value = false;
				if (value == 'NULL') value = null;
				if (value == 'DEFAULT_LINKS') value = DefaultLinks;
				// Set field value (and type)
				entry[name] = value;
			};
			for (let j = 0; j < fields.length; ++j) {
				let name = names[j];
				let value = fields[j];
				//LogTest.devlog(name);
				if (Array.isArray(name)) {
					// Is multi-valued
					for (let n = 0; n < name.length; ++n) {
						let v = getMultiValue(value, name[n].tag);
						addEntry(name[n].name, v);
					}
				} else {
					// Is single value
					addEntry(name, value);
				}
			}
			test_cases.push(entry);
		}
	}
	LogTest.log('Number of test cases: ' + test_cases.length);
	//LogTest.devlog(test_cases);
	return test_cases;
}

// A value can be a multi-value by using |+...+| and |-...-| syntax. When this
// is present, this function returns an array with tags as keys (here '+' and
// '-') and its associated value. There is also a 'default' key with the value
// with all tags removed.
// Note this syntax is prepared to support extensions like |n...n| with n a
// number.
// When there are only 2 tags (like +-), the syntax |-...|...+| can be used to
// mean |-...-||+...+|.
// Examples:
// - A|-B-|C      : '-' -> 'ABC'; default -> 'AC'
// - A|+B+|C      : '+' -> 'ABC'; default -> 'AC'
// - A|-B-||+C+|D : '-' -> 'ABD'; '+' -> 'ACD'; default -> 'AD'
// - A|-B|C+|D    : equivalent to A|-B-||+C+|D
// - A|+C|B-|D    : equivalent to A|-B|C+|D

const ReTags = /\|(.)([^|]*)\1\|/gu;  //match |n...n| and return all 'n' and value

function normalizeMultiValue(value) {
	// Expand short syntax
	// |-...|...+| -> |-...-||+...+|
	let val = value.replaceAll(/\|-([^|]*)\|([^|]*)\+\|/gu, '|-$1-||+$2+|')
	// |+...|...-| -> |+...+||-...-|
		.replaceAll(/\|\+([^|]*)\|([^|]*)-\|/gu, '|+$1+||-$2-|');
	return val;
}

// Return all non-default tags in value. Returns null if no tags.
function getMultiTags(value) {
	let val = normalizeMultiValue(value);
	// Discover the tags
	let tags = [];
	let ms = val.matchAll(ReTags);
	//LogTest.devlog(ms);
	for (const m of ms) {
		tags.push(m[1]);
	}
	if (tags.length > 0) {
		LogTest.debug(`${value}: MultiValue tags: ${tags}`);
		return tags;
	} else {
		return null;
	}
}

// Take value and return the variant for the specified tag.
function getMultiValue(value, tag) {
	let val = normalizeMultiValue(value);
	val = val.replaceAll(ReTags, (_, t, v) => t === tag ? v : '');
	//LogTest.devlog(`${value}: MultiValue for tag '${tag}': ${val}`);
	return val;
}

// }}}

// Execute tests {{{

let prevStatus = '';
async function executeTest(data) {
	let result = {
		skipped: 0,
		errors: 0,
	};

	// Suspend status messages to no pollute the status messages with
	// test instrumentation
	let saveAddStatus = addStatus;
	let suspendStatus = () => addStatus = () => {};
	let resumeStatus = () => addStatus = saveAddStatus;
	suspendStatus();

	if (data.name.match(/^\s*(?:#|;|\/\/)/)) {
		// This name starts with a comment character
		LogTest.important('Skip Test ' + data.name);
		result.skipped++;
		return result;
	} else if (ExecutedTestsRegexp != null && !data.name.match(ExecutedTestsRegexp)) {
		// This name is not in the Regexp
		LogTest.important('Skip Test ' + data.name);
		result.skipped++;
		return result;
	} else {
		LogTest.important('Test ' + data.name);
		LogTest.debug('Test data', data);
	}
	if (CurrTestCtl) CurrTestCtl.textContent = data.name;

	// Initialize
	if (!data.keepStorage) {
		HOOK_LocalStorage.clear();
		remoteFile.clear();
	}
	// Start with the correct QueryString to get the right ConfigName
	let qs = [];
	if (data.iniOverrideArg != null) qs.push('links-override=' + data.iniOverrideArg);
	if (data.iniLoadArg != null) qs.push('links=' + data.iniLoadArg);
	if (data.iniSaveArg != null) qs.push('save=' + data.iniSaveArg);
	if (qs.length > 0) qs = '?' + qs.join('&'); else qs = '';
	HOOK_QueryString.set(qs);  //triggers re-evaluation of ConfigLoadKey
	//LogTest.devlog('ConfigLoadKey after clear: \'' + UrlResolver.getConfigLoadKey() + '\'');
	HOOK_LocalStorage.reset();  //triggers re-evaluation of UsedLoadConfigName
	//LogTest.devlog('ConfigLoadKey after 2nd reset: \'' + UrlResolver.getConfigLoadKey() + '\'');
	if (data.iniLinks != null) Data.writeLocalLinks(data.iniLinks);
	if (data.iniCleanLinks != null) Data.writeCleanLinks(data.iniCleanLinks);
	HOOK_QueryString.reset();  //triggers re-evaluation of preliminary/download/fallback
	HOOK_LocalStorage.log();

	// Set the Remote File contents
	remoteFile.set(data.iniRemoteFile);

	// Clear caches to not influence the test and resume status
	HOOK_QueryString.reset();
	HOOK_LocalStorage.reset();
	resumeStatus();

	if (!data.keepStorage) {
		clearStatus();
		prevStatus = '';
	}

	// Trigger page initialization
	try {
		initLinks();
		await HOOK_Ready.wait();
	}
	catch (error) {
		LogTest.log('initLinks error: ' + error);
	}

	// If we should set Settings, trigger that and wait for it
	if (data.cnfAction != null && data.cnfAction != '') {
		addStatus('/');
		//LogTest.devlog('Prepare ChangeSettings');
		HOOK_ChangeSettings.setConfig(data.cnfLinks);
		let options = [];
		if (data.cnfLoadOpt1 != '') options.push(data.cnfLoadOpt1);
		if (data.cnfLoadOpt2 != '') options.push(data.cnfLoadOpt2);
		if (options.length < 1) options.push('');  //always at least 1 LoadOption
		options.push(data.cnfSaveOpt);  //may be ''
		//LogTest.devlog('Options: ', options);
		HOOK_ChangeSettings.setOptions(options);
		HOOK_ChangeSettings.setAction(data.cnfAction);
		//LogTest.devlog('Trigger ChangeSettings');
		showSettingsPanel();
		await HOOK_Ready.wait();
		//LogTest.devlog('Finished ChangeSettings');
	}

	// If we should do a Drag-and-Drop, trigger that and wait for it
	// NB: We use dropLinesTarget() rather than dropLinesXY(), because it
	// is difficult to calculate the (x,y) coordinate of the drop, because:
	// 1) The rendition is not yet stable
	// 2) Items may border each other, so that it is not always possible
	//    to click outside of the Item (depends on CSS!)
	// In practice, going to coordinates does not add much to the test,
	// except unnecessary instabilty in the tests.
	if (data.dropSource != null || data.dropWhere != null || data.dropTarget != null) {
		let dropTarget = null, where = null;
		if (data.dropTarget != null && data.dropWhere != null) {
			// Find dropTarget Item in RenderedItems
			dropTarget = findItemWithTarget(data.dropTarget);
		}
		dropLinesTarget(dropTarget, data.dropWhere, data.dropSource);
		await wait();
	}

	suspendStatus();

	// Check expected result (only if the expected result is available)
	LogTest.important('Test ' + data.name + ': Verify results');
	if (data.expLinks !== undefined) {
		let links = Data.readLocalLinks();
		if (!linksEqual(links, data.expLinks)) {
			LogTest.error('Test ' + data.name + ': Links (=' + renderValue(links) + ') has not expected value (=' + renderValue(data.expLinks) + ')');
			++result.errors;
		}
	}
	if (data.expCleanLinks !== undefined) {
		let cleanLinks = Data.readCleanLinks();
		if (!linksEqual(cleanLinks, data.expCleanLinks)) {
			LogTest.error('Test ' + data.name + ': CleanLinks (=' + renderValue(cleanLinks) + ') has not expected value (=' + renderValue(data.expCleanLinks) + ')');
			++result.errors;
		}
	}
	if (data.expDispLinks !== undefined) {
		let dispLinks = Data.getDisplayedLinks();
		if (!linksEqual(dispLinks, data.expDispLinks)) {
			LogTest.error('Test ' + data.name + ': DisplayedLinks (=' + renderValue(dispLinks) + ') has not expected value (=' + renderValue(data.expDispLinks) + ')');
			++result.errors;
		}
	}
	if (data.expConflict !== undefined) {
		let conflictState = Data.getConflictState();
		if (conflictState != data.expConflict) {
			LogTest.error('Test ' + data.name + ': ConflictState (=' + renderValue(conflictState) + ') has not expected value (=' + renderValue(data.expConflict) + ')');
			++result.errors;
		}
	}
	if (data.expUplDisabled !== undefined) {
		let uploadDisabled = UrlResolver.getUploadDisabled();
		if (data.expUplDisabled) {
			if (uploadDisabled == null) {
				LogTest.error('Test ' + data.name + ': UploadDisabled (=' + renderValue(uploadDisabled) + ') has not expected value (=set)');
				++result.errors;
			}
		} else {
			if (uploadDisabled != null) {
				LogTest.error('Test ' + data.name + ': UploadDisabled (=' + renderValue(uploadDisabled) + ') has not expected value (=not set)');
				++result.errors;
			}
		}
	}
	if (data.expRemoteFile !== undefined) {
		if (data.expRemoteFile != null) {
			let content = remoteFile.content();
			if (!linksEqual(content, data.expRemoteFile)) {
				LogTest.error('Test ' + data.name + ': RemoteFile (=' + renderValue(content) + ') has not expected value (=' + renderValue(data.expRemoteFile) + ')');
				++result.errors;
			}
		}
	}
	if (data.expStatus !== undefined) {
		if (data.expStatus != null) {
			let status = document.getElementById('StatusLine').textContent;
			let curStatus = status.replace(/[^a-zA-Z0-9]/g, '');
			let fullStatus = (prevStatus != '') ? prevStatus + ' + ' + data.expStatus : data.expStatus;
			let expStatus = fullStatus.replace(/[^a-zA-Z0-9]/g, '');
			if (curStatus != expStatus) {
				LogTest.error('Test ' + data.name + ': Status (=' + renderValue(status) + ') has not expected value (=' + renderValue(fullStatus) + ')');
				LogTest.debug('Full Status: \'' + status + '\'');
				LogTest.debug('Actual string: \'' + curStatus +'\'');
				LogTest.debug('Expected string: \'' + expStatus +'\'');
				++result.errors;
			}
			prevStatus = fullStatus;  //for next testcase
		}
	}

	if (result.errors == 0) {
		LogTest.important('Tested ' + data.name + ': Pass');
	}

	resumeStatus();

	return result;
}

async function executeTests(test_cases) {
	LogTest.important('Execute tests');
	let result = {
		tests: 0,
		skipped: 0,
		errors: 0,
		failed: [],
	};
	for (let i = 0; i < test_cases.length; ++i) {
		let data = test_cases[i];
		let result1 = await executeTest(data);
		++result.tests;
		result.skipped += result1.skipped;
		result.errors += result1.errors;
		if (result1.errors > 0) {
			result.failed.push(data.name);
			if (StopOnFirstError) return result;
		}
	}
	return result;
}

async function doTests() {
	LogTest.important('Start running tests');

	// Read and execute the tests
	let test_sets = [
		'test/testcases-settings.tsv',
		'test/testcases-updatelinks.tsv',
		'test/testcases-dragdrop.tsv',
	];
	let results = [];
	for (let i = 0; i < test_sets.length; ++i) {
		let test_set = test_sets[i];
		let test_cases = await readTests(test_set);
		let result = await executeTests(test_cases);
		result.name = test_set;
		results.push(result);
		if (result.errors > 0 && StopOnFirstError) break;
	}

	// Prepare results for screen
	let s = 'Test Results:\n';
	for (let i = 0; i < results.length; ++i) {
		let result = results[i];
		s += '* ' + result.name + ': ' + result.tests + ' tests';
		if (result.skipped > 0) {
			s += ', ' + result.skipped + ' skipped';
		}
		if (result.failed.length > 0) {
			s += ', ' + result.failed.length + ' failed';
		} else {
			if (result.skipped == 0) {
				s += ', all passed';
			} else {
				s += ', no errors';
			}
		}
		if (result.errors > 0) {
			s += ' (' + result.errors + ' errors)';
		}
		if (result.failed.length > 0 && result.failed.length <= 20) {
			for (let j = 0; j < result.failed.length; ++j) {
				s += '\n- ' + result.failed[j];
			}
		}
		s += '\n';
	}
	alert(s);

	// Make Settings function normal again
	HOOK_ChangeSettings = null;
}

// }}}


// vim: fdm=marker

