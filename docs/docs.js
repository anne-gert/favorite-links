// Set the value of a CSS variable on the document element.
function setCssVar(name, value) {
	name = '--' + name;
	console.log(`Set ${name} = '${value}'`);
	document.documentElement.style.setProperty(name, value);
}

// Names of color variables and their shorthands.
let ColorVars = {
	a : 'accent-color',
	b : 'background',
	d : 'disabled-color',
	f : 'foreground',
	l : 'link-color',
	bb : 'block-background',
	be : 'block-border',
	bf : 'block-foreground',
	cb : 'code-background',
	cf : 'code-foreground',
	eb : 'error-background',
	ee : 'error-border',
	ef : 'error-foreground',
	sb : 'selection-background',
	sf : 'selection-foreground',
};

// Set the color of the name (either long or short name).
function setColor(name, color) {
	if (ColorVars[name] !== undefined) name = ColorVars[name];
	if (color.match(/^([0-9a-fA-F]{2}){3,4}$/)) color = '#' + color;
	setCssVar(name, color);
}

// Go through query string arguments and apply all specified colors.
function setColors() {
	function apply(colors) {
		let params = new URLSearchParams(colors);
		for (name in ColorVars) {
			let color = params.get(name);
			if (color != null) setColor(name, color);
		}
	}
	// First check LocalStorage
	if (localStorage) {
		let key = 'favlist_colors';
		let colors = localStorage.getItem(key);
		if (colors) apply('?' + colors);
	}
	// Secondly, override with QueryString
	apply(location.search);
}

