const blessed = require('blessed');

class UI {
    constructor() {
        this.screen = blessed.screen({
            smartCSR: true
        });
        this.screen.title = 'Plottermon - Chia Plotting Monitor';
        this.layout = blessed.layout({
            parent: this.screen,
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            border: 'none',
        });

        this.plotProgressBars = {};

        // Quit on Escape, q, or Control-C.
        this.screen.key(['escape', 'q', 'C-c'], function (ch, key) {
            return process.exit(0);
        });
        
        this.init();
    }

    init() {
        this.nav = this.createNav();
        this.monitorTab = this.createContentBox();
        this.createTab = this.createContentBox();
        this.aboutTab = this.createContentBox();
        this.currentTab = {name: 'Monitor', widget: this.monitorTab};
    }

    createContentBox() {
        return blessed.layout({
            parent: this.layout,
            top: this.navContainer.abottom,
            left: 0,
            width: '100%-1',
            height: `99%-${this.navContainer.height}`,
            border: 'line'
        });
    }

    createDetailsTable() {
        return blessed.table({
            parent: this.monitorTab,
            width: '99%',
            left: 0,
            top: this.plotSeparator.abottom,
        });
    }

    updateDetailsTable(name) {
        const argv = this.plots[name].argv;
        this.detailsTable.setData([
            Object.keys(argv),
            Object.values(argv).map(v => v.toString())
        ]);
    }

    setProgress(name, value, title) {
        const bar = this.plotProgressBars[name];
        bar.setProgress(value);
        bar.content = title;
        this.screen.render();
    }

    createSeparator(parent, alignmentParent) {
        return blessed.line({
            parent: parent,
            width: '99%',
            left: 0,
            top: alignmentParent.abottom,
            orientation: 'horizontal',
            type: 'bg',
            ch: '-'
        });
    }

    initProgressBars(plots) {
        let button;

        this.plots = plots;
        
        for (const [name, plot] of Object.entries(plots)) {
            const parent = button ? button : this.nav;
            button = this.createProgressDetailsButton(parent, name);
            this.plotProgressBars[name] = this.createProgressBar(button, name);
        }
        
        this.plotSeparator = this.createSeparator(this.monitorTab, button);
        this.detailsTable = this.createDetailsTable();
    }

    createNav() {
        this.navContainer = blessed.box({
            parent: this.layout,
            top: 0,
            left: 0,
            width: '100%-1',
            height: 3,
            border: 'line',
        });

        return blessed.listbar({
            parent: this.navContainer,
            top: 0,
            left: 0,
            width: '99%',
            height: '50%',
            mouse: true,
            commands: { // TODO: DRY this up
                'Monitor': {
                    keys: [1],
                    callback: () => {
                        if (this.currentTab.name === 'Monitor') return;
                        this.currentTab.widget.toggle();
                        this.monitorTab.toggle();
                        this.currentTab.name = 'Monitor';
                        this.currentTab.widget = this.monitorTab;
                    }
                },
                'Create': {
                    keys: [2],
                    callback: () => {
                        if (this.currentTab.name === 'Create') return;
                        this.currentTab.widget.toggle();
                        this.createTab.toggle();
                        this.currentTab.name = 'Create';
                        this.currentTab.widget = this.createTab;
                    }
                },
                'About': {
                    keys: [3],
                    callback: () => {
                        if (this.currentTab.name === 'About') return;
                        this.currentTab.widget.toggle();
                        this.aboutTab.toggle();
                        this.currentTab.name = 'About';
                        this.currentTab.widget = this.aboutTab;
                    }
                }
            },
            style: {
                selected: {
                    fg: 'blue'
                },
                item: {
                    fg: '#676767',
                    hover: {
                        fg: 'red'
                    }
                }
            }
        })
    }

    createProgressDetailsButton(alignParent, name) {
        const form = blessed.form({
            parent: this.monitorTab,
            keys: true,
            top: alignParent.abottom,
            left: 0,
            width: 11,
            height: 1,
            padding: {
                left: 1,
                right: 1
            }
        });

        const details = blessed.button({
            parent: form,
            mouse: true,
            keys: true,
            shrink: false,
            left: 0,
            top: 0,
            padding: {
                left: 1,
                right: 1
            },
            name: 'details',
            content: 'Details',
            style: {
                bg: 'blue',
                focus: {
                    bg: 'red'
                },
                hover: {
                    bg: 'red'
                }
            }
        });

        details.on('press', () => {
            this.updateDetailsTable(name);
        });

        return form;
    }

    createProgressBar(button, name) {
        return blessed.progressbar({
            parent: this.monitorTab,
            content: name,
            orientation: 'horizontal',
            top: button.atop,
            left: button.aright,
            height: 1,
            width: '50%-13',
            filled: 0,
            keys: false,
            mouse: false,
            style: {
                bg: '#676767',
                bar: {
                    bg: 'blue',
                }
            }
        });
    }

    draw() {
        this.screen.append(this.layout);
        this.screen.render();
    }
}

module.exports = UI;