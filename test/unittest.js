let LogTest;

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
		LogTest.log('Contents of LocalStorage', _data);
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

// Create an object that emulates content that is updated with GET and POST.
function CreateRemoteFile(initialContent = '', timeout = 100) {
	let _getStatus = 200;
	let _postStatus = 200;
	let _content = initialContent;
	let _prepareNextResponse = null;

	// Returns Promise that simulates a GET.
	async function getGetResponse(url, headers, body) {
		// Wait a bit
		await sleep(timeout);
		// Assemble response
		let rsp = {
			status : _getStatus,
			text   : _content,
		};
		// Prepare next response if configured
		if (_prepareNextResponse) _prepareNextResponse('GET');
		// Return response
		return rsp;
	}

	// Returns Promise that simulates a POST.
	async function getPostResponse(url, headers, body) {
		// Wait a bit
		await sleep(timeout);
		// Update emulated file
		if (_postStatus == 200 && _getStatus == 404) _getStatus = 200;
		_content = body;
		// Assemble response
		let rsp = {
			status : _postStatus,
			text   : '',
		};
		// Prepare next response if configured
		if (_prepareNextResponse) _prepareNextResponse('POST');
		// Return response
		return rsp;
	}

	// Set the contents from the value for the next requuest.
	// The value is interpreted as follows:
	// - 'NOT_EXIST': Emulate file that does not exist yet, but will after
	//   upload
	// - 'CANNOT_WRITE': Makes upload fail with 403
	// - 'DEFAULT_LINKS': Value of DefaultLinks
	// - numeric: Return this status, sets content to empty
	// - any other string: Contents of the emulated file
	// If next is set, it is called at the next request with 'GET' or
	// 'POST' as argument. It can then prepare a new response if needed.
	function setContent(value, next = null) {
		// Special values:
		if (value == 'NOT_EXIST') {
			_getStatus = 404;
			_postStatus = 200;
			_content = '';
		} else if (value == 'CANNOT_WRITE') {
			_postStatus = 403;
		} else if (value == 'DEFAULT_LINKS') {
			_getStatus = 200;
			_postStatus = 200;
			_content = DefaultLinks;
		} else if (value.match(/^\d+$/)) {
			_getStatus = value.valueOf();
			_postStatus = value.valueOf();
			_content = '';
		} else {
			_getStatus = 200;
			_postStatus = 200;
			_content = value;
		}
	}

	let obj = {
		download : {
			response : getGetResponse,
		},
		upload : {
			response : getPostResponse,
		},
		set : setContent,
		content : () => _content,
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
					++count;
				}
			}
			++j;
		}
		for (let i = 0; i < loadOptionEntries.length; ++i) {
			if (j < _options.length) {
				let v = _options[j];
				if (v) {
					loadOptionEntries[i].entry.value = v;
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
		} else if (_action = 'clear') {
			hideFunction('clear');
		} else if (_action = 'cancel') {
			hideFunction(false);
		} else {
			LogSettings.error('Unknown _action in HOOK_ChangeSettings.update(): ' + _action);
		}
	}

	function setConfig(text) {
		_config = text;
	}

	function setOptions(options) {
		_options = options;
	}

	function setAction(action) {
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
		return '\'' + value.substring(0, 20) + '\' (' + value.length + ' chars)';
	} else {
		return value;
	}
}

async function sleep(timeout) {
	let promise = new PendingPromise();
	window.setTimeout(() => promise.resolve(true), timeout);
	await promise;
}

// }}}

// Initialization {{{

// Set up the hooks
HOOK_Init = initTests;
HOOK_Run = doTests;
HOOK_Ready = CreateReady();
HOOK_QueryString = CreateQueryString('?links=test-config');
HOOK_LocalStorage = CreateStorage();
let remoteFile = CreateRemoteFile('!title Test\n\nInitial');
HOOK_Download = remoteFile.download;
HOOK_Upload = remoteFile.upload;
HOOK_ChangeSettings = CreateSettingsChanger();

function initTests() {
	// Create the special logger
	LogTest = CreateLogger();
	LogTest.defineLevel('error', 0, 'color:#AA0000;background:#FFDDDD');
	LogTest.defineLevel('warn', 0, 'color:#999900;background:#FFFFCC');
	LogTest.defineLevel('important', 1, 'color:#006666;background:#FFFFCC');
	LogTest.defineLevel('log', 2, 'color:black;background:#FFFFCC');
	LogTest.defineLevel('debug', 3, 'color:#666666;background:#FFFFCC');
	LogTest.setLevel();

	LogTest.important('Init Tests');
}

// }}}

// Read Tests {{{

async function readTests(url) {
	LogTest.important('Read test cases from ' + url);
	let rsp = await fetch(url);
	if (rsp == null) {
		LogTest.error('No response');
		return null;
	}
	if (rsp.status != 200) {
		LogTest.error('No data: status ' + rsp.status);
		return null;
	}
	let contents = await rsp.text();
	//LogTest.devlog(contents);
	let records = contents.split(/[\r\n]+/);  //split in lines
	let test_cases = [];
	let names = null;
	for (let i = 0; i < records.length; ++i) {
		let record = records[i];
		if (record.match(/^\s*(?:#|;|\/\/|$)/)) {
			// Empty or comment line
			continue;
		}
		let fields = record.split(/\t/);  //split in fields
		// Check appropriate length
		if (fields.length <= 1) {
			// Should have more than 1 field
			LogError.error('Invalid record: ' + record);
			continue;
		}
		if (names == null) {
			// Take first line as headings
			names = fields;
			LogTest.log('Number of columns: ' + names.length);
		} else {
			// Check length of data
			if (fields.length != names.length) {
				LogTest.error('Invalid number of fields: ' + fields.length);
				continue;
			}
			// Create entry
			let entry = {};
			for (let j = 0; j < fields.length; ++j) {
				let name = names[j];
				let value = fields[j];
				value = value.replace(/^("?)(.*)\1$/, '$2');  //remove surrounding double quotes
				value = value.replaceAll(/""/g, '"');  //un-escape double quotes "" -> "
				value = value.replaceAll(/\\"/g, '"');  //un-escape double quotes \" -> "
				// Check special words (all capitals)
				if (value == 'TRUE') value = true;
				if (value == 'FALSE') value = false;
				if (value == 'NULL') value = null;
				if (value == 'DEFAULT_LINKS') value = DefaultLinks;
				// Set field value (and type)
				entry[name] = value;
			}
			test_cases.push(entry);
		}
	}
	LogTest.log('Number of test cases: ' + test_cases.length);
	//LogTest.devlog(test_cases);
	return test_cases;
}

// }}}

// Execute tests {{{

async function executeTest(data) {
	let result = {
		skipped: 0,
		errors: 0,
	};

	if (data.name.match(/^\s*(?:#|;|\/\/)/)) {
		// This name starts with a comment character
		LogTest.important('Skip Test ' + data.name);
		result.skipped++;
		return result;
	} else {
		LogTest.important('Test ' + data.name);
		LogTest.debug('Test data', data);
	}
	//LogTest.devlog(data);

	// Initialize
	HOOK_LocalStorage.clear();
	// Start with the correct QueryString to get the right ConfigName
	let qs = [];
	if (data.iniOverrideOpt != null) qs.push('links-override=test-override-config');
	if (data.iniLoadOpt != null) qs.push('links=test-config');
	if (data.iniSaveOpt != null && data.iniOverrideOpt == null && data.iniLoadOpt == null) qs.push('save=test-save-config');
	qs = '?' + qs.join('&');
	HOOK_QueryString.set(qs);  //triggers re-evaluation of ConfigLoadKey
	//LogTest.devlog('ConfigLoadKey after clear: \'' + UrlResolver.getConfigLoadKey() + '\'');
	// Set the Load/SaveOptions first, because these are used for the
	// UsedConfigName that is part of other LocalStorage keys.
	if (data.iniOverrideOpt != null) Data.writeLoadOverrideOptions(data.iniOverrideOpt);
	if (data.iniLoadOpt != null) Data.writeLoadOptions(data.iniLoadOpt);
	if (data.iniSaveOpt != null) Data.writeSaveOptions(data.iniSaveOpt);
	//LogTest.devlog('ConfigLoadKey after Option set: \'' + UrlResolver.getConfigLoadKey() + '\'');
	HOOK_LocalStorage.reset();  //triggers re-evaluation of UsedLoadConfigName
	HOOK_QueryString.reset();  //triggers re-evaluation of ConfigLoadKey
	//LogTest.devlog('ConfigLoadKey after 2nd reset: \'' + UrlResolver.getConfigLoadKey() + '\'');
	if (data.iniLinks != null) Data.writeLocalLinks(data.iniLinks);
	if (data.iniCleanLinks != null) Data.writeCleanLinks(data.iniCleanLinks);
	HOOK_QueryString.reset();  //triggers re-evaluation of preliminary/download/fallback
	HOOK_LocalStorage.log();

	remoteFile.set(data.iniRemoteFile);

	// Trigger page initialization
	try {
		initLinks();
		await HOOK_Ready.wait();
	}
	catch (error) {
		LogTest.log('initLinks error: ' + error);
	}

	// If we should set Settings, trigger that and wait for it
	if (data.configAction != null && data.configAction != '') {
		HOOK_ChangeSettings.setConfig(data.config);
		let options = [];
		if (data.loadOpt1 != '') options.push(data.loadOpt1);
		if (data.loadOpt2 != '') options.push(data.loadOpt2);
		if (options.length < 1) options.push('');  //always at least 1 LoadOption
		options.push(data.saveOpt);  //may be ''
		//LogTest.devlog('Options: ', options);
		HOOK_ChangeSettings.setOptions(options);
		HOOK_ChangeSettings.setAction(data.configAction);
		showSettingsPanel();
		await HOOK_Ready.wait();
	}

	// Check expected result
	let links = Data.readLocalLinks();
	if (links != data.expLinks) {
		LogTest.error('Test ' + data.name + ': Links (=' + renderValue(links) + ') has not expected value (=' + renderValue(data.expLinks) + ')');
		++result.errors;
	}
	let cleanLinks = Data.readCleanLinks();
	if (cleanLinks != data.expCleanLinks) {
		LogTest.error('Test ' + data.name + ': CleanLinks (=' + renderValue(cleanLinks) + ') has not expected value (=' + renderValue(data.expCleanLinks) + ')');
		++result.errors;
	}
	let dispLinks = Data.getDisplayedLinks();
	if (dispLinks != data.expDispLinks) {
		LogTest.error('Test ' + data.name + ': DisplayedLinks (=' + renderValue(dispLinks) + ') has not expected value (=' + renderValue(data.expDispLinks) + ')');
		++result.errors;
	}
	let conflictState = Data.getConflictState();
	if (conflictState != data.expConflict) {
		LogTest.error('Test ' + data.name + ': ConflictState (=' + renderValue(conflictState) + ') has not expected value (=' + renderValue(data.expConflict) + ')');
		++result.errors;
	}
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
	if (data.expRemoteFile != null) {
		let content = remoteFile.content();
		if (content != data.expRemoteFile) {
			LogTest.error('Test ' + data.name + ': RemoteFile (=' + renderValue(content) + ') has not expected value (=' + renderValue(data.expRemoteFile) + ')');
			++result.errors;
		}
	}

	if (result.errors == 0) {
		LogTest.important('Tested ' + data.name + ': Pass');
	}

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
		if (result1.errors > 0) result.failed.push(data.name);
	}
	return result;
}

async function doTests() {
	LogTest.important('Start running tests');

	// Read and execute the tests
	let test_sets = [ 'test/testcases.tsv' ];
	let results = [];
	for (let i = 0; i < test_sets.length; ++i) {
		let test_set = test_sets[i];
		let test_cases = await readTests(test_set);
		let result = await executeTests(test_cases);
		result.name = test_set;
		results.push(result);
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
				s += ':\n- ' + result.failed[j];
			}
		}
		s += '\n';
	}
	alert(s);
}

// }}}


// vim: fdm=marker

