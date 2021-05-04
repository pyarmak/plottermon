const os = require('os');
const blessed = require('blessed');
const contrib = require('blessed-contrib');
const grid = require('./grid'); // override blessed-contrib grid to accomodate navbar

class UI {
    constructor(quitCallback) {
        this.screen = blessed.screen({
            smartCSR: true
        });
        this.screen.title = 'Plottermon - Chia Plotting Monitor';

        // Quit on Escape, q, or Control-C.
        this.screen.key(['escape', 'q', 'C-c'], function (ch, key) {
            if (quitCallback && typeof quitCallback === 'function') quitCallback();
            return process.exit(0);
        });
        
        this.init();
    }

    init() {
        this.plotProgressBars = {};

        this.TOTAL_MEM = os.totalmem();

        this.tabs = ['Monitor', 'Create', 'About'];
        this.currentTab = this.tabs[0];
        const pages = [];

        for (const tab of this.tabs) {
            pages.push(this.createTab(tab));
        }
        this.initLayout(pages);
        this.layout.start();
    }

    createTab(title) {
        return (screen) => {
            const content = new grid({rows: 12, cols: 12, screen: this.screen});

            content.set(0, 0, 1, 1, blessed.box, {content: title});
            this.nav = this.createNav();
            this.screen.append(this.nav);
            this.nav.select(this.currentTabIndex());
        };
    }

    initLayout(pages) {
        // Add method to carousel layout to move to specific tab
        contrib.carousel.prototype.setTab = function(index) {
            if (index > this.pages.length - 1) return;
            this.currPage = index;
            this.move();
        };

        this.layout = new contrib.carousel(pages, {
            screen: this.screen,
            interval: 0, // How often to switch views (we set it to 0 to never swicth automatically)
            controlKeys: false, // Disable built-in right and left keyboard arrows control view rotation (we implement a better method below)
            rotate: true // Circle back to the first view when we reach the end
        });

        // Bind view rotation keys and hook them into the interactive navbar
        this.screen.key(['right', 'left', 'home', 'end'], (ch, key) => {
            if (key.name=='right') this.nextTab();
            if (key.name=='left') this.prevTab();
            if (key.name=='home') {
                this.currentTab = this.tabIndexToName(0);
                this.layout.home();
            }
            if (key.name=='end') {
                this.currentTab = this.tabIndexToName(this.tabs.length - 1);
                this.layout.end();
            }
        });
    }

    tabIndexToName(i) {
        return this.tabs[i];
    }

    tabNameToIndex(name) {
        return this.tabs.indexOf(name);
    }

    currentTabIndex() {
        return this.tabs.indexOf(this.currentTab);
    }

    nextTab() {
        let currPage = this.currentTabIndex();
        if (++currPage == this.tabs.length) this.currentTab = this.tabIndexToName(0);
        else this.currentTab = this.tabIndexToName(currPage);
        this.layout.next();
        this.nav.select(this.currentTabIndex());
    }

    prevTab() {
        let currPage = this.currentTabIndex();
        if (--currPage < 0) this.currentTab = this.tabIndexToName(this.tabs.length - 1);
        else this.currentTab = this.tabIndexToName(currPage);
        this.layout.prev();
        this.nav.select(this.currentTabIndex());
    }

    createDetailsTable() {
        return blessed.table({
            parent: this.monitorTab,
            width: '99%',
            left: 0,
            top: this.donutSeparator.abottom,
        });
    }

    updateDetailsTable(name) {
        const {argv, logLocation} = this.plots[name];
        let header = Object.keys(argv);
        let data = Object.values(argv).map(v => v.toString());
        header.push('log');
        data.push(logLocation);
        this.detailsTable.setData([
            header,
            data
        ]);
    }

    updateCpuDonut(name) {
        const cpu = this.plots[name].process.cpu;
        this.donut.setData([
            {percent: cpu, lable: 'CPU', color: 'green'}
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

    initMonitorTab(plots) {
        let button;

        this.plots = plots;
        
        for (const [name, plot] of Object.entries(plots)) {
            const parent = button ? button : this.nav;
            button = this.createProgressDetailsButton(parent, name);
            this.plotProgressBars[name] = this.createProgressBar(button, name);
        }
        
        this.plotSeparator = this.createSeparator(this.monitorTab, button);
        this.donut = contrib.donut({
            parent: this.monitorTab,
            top: 0,
            left: 0,
            label: 'Resources',
            radius: 8,
            arcWidth: 3,
            remainColor: 'black',
            yPadding: 2,
            data: [
                {percent: 80, label: 'CPU', color: 'green'}
            ]
        });
        // this.donutSeparator = this.createSeparator(this.monitorTab, this.donut);
        // this.detailsTable = this.createDetailsTable();
    }

    createNav() {
        let commands = {};

        this.tabs.forEach((name, i) => {
            commands[name] = {
                keys: [i+1],
                callback: () => {
                    if (this.currentTab === name) return;
                    this.currentTab = name;
                    this.layout.setTab(i);
                }
            }
        });

        return blessed.listbar({
            mouse: true,
            left: 0,
            top: 0,
            width: '100%',
            height: 1,
            padding: {
                left: -1
            },
            commands: commands,
            style: {
                bg: 'white',
                selected: {
                    bg: 'blue',
                    fg: 'white'
                },
                item: {
                    bg: 'white',
                    fg: 'black',
                    hover: {
                        fg: 'red'
                    }
                }
            }
        });
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
            this.updateCpuDonut(name);
            // this.updateDetailsTable(name);
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

    setPlots(plots) {
        this.plots = plots;
    }

}

module.exports = UI;