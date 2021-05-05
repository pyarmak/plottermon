const os = require('os');
const blessed = require('blessed');
const contrib = require('blessed-contrib');

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
        this.state = {
            _plots: null,
            _plotsListeners: [],
            _stats: null,
            _statsListeners: [],
            plotProgressBars: {},
            currentProgress: {},
            get stats() {
                return this._stats;
            },
            set stats(v) {
                this._stats = v;
                if (this._statsListeners.length > 0) {
                    for (const listener of this._statsListeners) {
                        listener(v);
                    }
                }
            },
            get plots() {
                return this._plots;
            },
            set plots(v) {
                this._plots = v;
                if (this._plotsListeners.length > 0) {
                    for (const listener of this._plotsListeners) {
                        listener(v);
                    }
                }
            },
            addListener: function(type, listener) {
                this['_'+type+'Listeners'].push(listener);
            }
        };

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

            this.nav = this.createNav();
            screen.append(this.nav);
            this.nav.select(this.currentTabIndex());

            this.content = this.createContentBox();
            screen.append(this.content);

            if (title == 'Monitor') {
                if (this.state.plots) {
                    this.initMonitorTab(this.state.plots);
                    if (Object.keys(this.state.currentProgress).length > 0) {
                        for (const payload of Object.values(this.state.currentProgress)) {
                            this.setProgress(...payload);
                        }
                    }

                    this.screen.render();
                }
                this.state.addListener('plots', plots => {
                    this.initMonitorTab(plots);
                    this.screen.render();
                });
            } else {
                // content.set(0, 0, 2, 2, blessed.box, {content: title});
            }
        };
    }

    createContentBox() {
        return blessed.layout({
            top: 1,
            left: 0,
            width: '100%',
            height: '100%-1',
            border: 'line'
        });
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

    createDetailsTable(top) {
        return blessed.table({
            parent: this.screen,
            width: '99%',
            left: 1,
            top: top,
        });
    }

    updateDetailsTable(name) {
        const {argv, logLocation} = this.state.plots[name];
        let header = Object.keys(argv);
        let data = Object.values(argv).map(v => v.toString());
        header.push('log');
        data.push(logLocation);
        this.detailsTable.setData([
            header,
            data
        ]);
    }

    updateCpuDonut(name) { // TODO: add RAM donut
        const pid = this.state.plots[name].process.pid;
        const { cpu } = this.state.stats[pid];
        this.state.addListener('stats', stats => {
            const { cpu } = stats[pid];
            this.donut.setData([
                {percent: cpu, label: 'CPU', color: 'green'}
            ])
        });
        this.donut.setData([
            {percent: cpu, label: 'CPU', color: 'green'}
        ]);
    }

    setProgress(name, value, title) {
        this.state.currentProgress[name] = [name, value, title];
        const bar = this.state.plotProgressBars[name];
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
        
        for (const [name, plot] of Object.entries(plots)) {
            const parent = button ? button : this.nav;
            button = this.createProgressDetailsButton(parent, name);
            this.state.plotProgressBars[name] = this.createProgressBar(button, name);
        }

        const offset = Math.round(Object.keys(plots).length / 2) + 3;
        
        this.plotSeparator = this.createSeparator(this.content, button);
        this.createResourceDonuts(offset);
        this.donutSeparator = blessed.line({
            parent: this.screen,
            width: '99%',
            left: 'center',
            top: offset + 7,
            orientation: 'horizontal',
            type: 'bg',
            ch: '-',
            hidden: true
        });
        this.donutSeparator.setFront();
        this.screen.append(this.donutSeparator);
        this.detailsTable = this.createDetailsTable(offset + 9);
    }

    createResourceDonuts(top) {
        this.donut = contrib.donut({
            parent: this.screen,
            top: top,
            left: 'center',
            width: 30,
            height: 10,
            label: 'Resources', // TODO: align label better
            radius: 8,
            arcWidth: 3,
            remainColor: 'black',
            yPadding: 2,
            hidden: true,
            data: [ // TODO: enable RAM donut
                {percent: 0, label: 'CPU', color: 'green'},
                // {percent: 0, label: 'RAM', color: 'red'}
            ]
        });
        this.screen.append(this.donut);
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
            parent: this.content,
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
            this.donut.show();
            this.donutSeparator.show();
            this.detailsTable.show();
            this.updateCpuDonut(name);
            this.updateDetailsTable(name);
        });

        return form;
    }

    createProgressBar(button, name) {
        // override default progressbar renderer to allow for truncation of long content string
        blessed.progressbar.prototype.render = function() {
            var ret = this._render();
            if (!ret) return;

            var xi = ret.xi
                , xl = ret.xl
                , yi = ret.yi
                , yl = ret.yl
                , dattr;

            if (this.border) xi++, yi++, xl--, yl--;

            if (this.orientation === 'horizontal') {
                xl = xi + ((xl - xi) * (this.filled / 100)) | 0;
            } else if (this.orientation === 'vertical') {
                yi = yi + ((yl - yi) - (((yl - yi) * (this.filled / 100)) | 0));
            }

            dattr = this.sattr(this.style.bar);

            this.screen.fillRegion(dattr, this.pch, xi, xl, yi, yl);

            if (this.content) {
                var line = this.screen.lines[yi];
                for (var i = 0; i < this.content.length; i++) {
                    if (line[xi + i] && line[xi + i][1]) line[xi + i][1] = this.content[i];
                }
                line.dirty = true;
            }

            return ret;
        };

        return blessed.progressbar({
            parent: this.content,
            content: name,
            orientation: 'horizontal',
            top: button.atop,
            left: button.aright,
            height: 1,
            width: '50%-13',
            filled: 0,
            keys: false,
            mouse: false,
            shrink: true,
            style: {
                bg: 'gray',
                bar: {
                    bg: 'blue',
                }
            }
        });
    }

    setStats(stats) {
        this.state.stats = stats;
    }

    setPlots(plots) {
        this.state.plots = plots;
    }

}

module.exports = UI;
